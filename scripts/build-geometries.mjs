import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_JS_PATH = path.join(ROOT_DIR, 'data.js');
const OUT_PATH = path.join(ROOT_DIR, 'geometries.js');
const CACHE_DIR = path.join(__dirname, '.cache');
const BM_CACHE_PATH = path.join(CACHE_DIR, 'bm-ciclovias.json');
const GEOCODE_CACHE_PATH = path.join(CACHE_DIR, 'geocode-cache.json');
const ROUTE_CACHE_PATH = path.join(CACHE_DIR, 'route-cache.json');

const BM_URL =
  'https://services7.arcgis.com/TOuassHKg3yWkrb9/arcgis/rest/services/Ciclovias_Callao_Lima_BM/FeatureServer/0/query?where=1=1&outFields=FID,Nombre_de,Ciclov%C3%ADa,V%C3%ADa,Desde,Hasta,Distrito,Longitud__,Longitud_K,Tipo,Subtipo,Estado_de&outSR=4326&f=json&resultRecordCount=1000';

const LIMA_BOUNDS = {
  minLat: -12.50,
  maxLat: -11.75,
  minLng: -77.20,
  maxLng: -76.65
};

const PERIPHERAL_DISTRICTS = new Set([
  'LURIN',
  'PACHACAMAC',
  'ATE',
  'SAN JUAN DE LURIGANCHO',
  'CHORRILLOS',
  'VILLA EL SALVADOR',
  'VILLA MARIA DEL TRIUNFO',
  'PUNTA HERMOSA',
  'PUNTA NEGRA',
  'SAN BARTOLO',
  'SANTA MARIA DEL MAR',
  'LA MOLINA',
  'SANTIAGO DE SURCO',
  'SAN MARTIN DE PORRES'
]);

const STREET_ALIASES = {
  'av ferrocarril': 'av enrique meiggs',
  'parque keneddy': 'parque kennedy',
  'malecon poul harris': 'malecon paul harris',
  'av malecon souza': 'malecon souza',
  'jr los jazminez': 'jr los jazmines',
  'av los insurgentes': 'av de los insurgentes',
  'av mariscal ramon castilla': 'av ramon castilla',
  'av pizarro': 'av francisco pizarro',
  'av habich': 'av eduardo habich',
  'av bauzate y meza': 'av bauzate y mesa',
  'ovalo 2 de mayo': 'plaza dos de mayo',
  'ovalo jorge chavez': 'plaza jorge chavez',
  'campo de marte': 'av de la peruanidad',
  'bajada sucre bajada brasil': 'bajada sucre',
  'av alameda manuel lorenzo de vidaurre': 'alameda vidaurre',
  'av moralez duarez': 'av morales duarez',
  'av alfonso ugarte santa anita': 'av alfonso ugarte',
  'av parque del norte': 'av del parque norte',
  'av del parque sur': 'av del parque sur',
  'via periurbana iv': 'via periurbana',
  'av prolongacion portillo': 'av portillo grande',
  'plaza civica de santa clara': 'parque civico santa clara',
  'jr jose de la torre ugarte': 'jr jose de la torre ugarte',
  'av enrique canaval y moreyra': 'av canaval y moreyra',
  'av malecon de la reserva': 'malecon de la reserva',
  'bajada sucre bajada brasil': 'bajada brasil bajada sucre',
  'bajada sucre': 'bajada brasil bajada sucre',
  'panamericana sur': 'carretera panamericana sur',
  'av del ejercito': 'av augusto perez aranibar',
  'av flores de primavera': 'av las flores de primavera'
};

const LANDMARK_COORDS = {
  'playa agua dulce': [-12.16233, -77.02695],
  'playa las sombrillas': [-12.14988, -77.02321],
  'bajada armendariz': [-12.13580, -77.02907],
  'estadio manuel bonilla': [-12.11002, -77.05286],
  'peaje de villa': [-12.21799, -76.97825],
  'club paraiso del sur': [-12.21998, -76.97563]
};

const PAIR_COORDS = [
  { street: 'costa verde', cross: 'salaverry', coords: [-12.10757, -77.05990] },
  { street: 'salaverry', cross: 'ejercito', coords: [-12.10113, -77.06063] },
  { street: '200 millas', cross: 'separadora industrial', coords: [-12.22427, -76.92362] },
  { street: 'tomas valle', cross: 'universitaria', coords: [-12.01231, -77.07963] },
  { street: 'tomas valle', cross: 'angelica gamarra', coords: [-12.01166, -77.09050] },
  { street: 'soledad', cross: 'paseo de la republica', coords: [-12.08934, -77.02422] }
];

const ENDPOINT_FIXES = [
  [/av\.\s*universitaria/gi, 'Av. Universitaria'],
  [/av\.?\s*uiniversitaria/gi, 'Av. Universitaria'],
  [/av\.?\s*costar\s+verde/gi, 'Av. Costa Verde'],
  [/keneddy/gi, 'Kennedy'],
  [/poul\s+harris/gi, 'Paul Harris'],
  [/jazminez/gi, 'Jazmines'],
  [/morale[zs]\s+duare[zs]/gi, 'Morales Duárez'],
  [/claudio\s+caleno/gi, 'Claudio Galeno'],
  [/prolongaci[oó]n\s+de\s+iquitos/gi, 'Prolongación Iquitos'],
  [/complejo\s+manuel\s+bonilla/gi, 'Estadio Manuel Bonilla'],
  [/bajada\s+armendariz/gi, 'Bajada Armendáriz'],
  [/bauzate\s+y\s+meza/gi, 'Bauzate y Mesa'],
  [/humbdolt/gi, 'Humboldt'],
  [/caraquiri/gi, 'Carriquiry'],
  [/\bluini\b/gi, 'Luni'],
  [/jose\s+carlo\s+mariategui/gi, 'Av. José Carlos Mariátegui'],
  [/av\.\s*jos[eé]\s+carlos\s+mariategu[ií]/gi, 'Av. José Carlos Mariátegui'],
  [/\bav\.\s*san\s+jos[eé]\b/gi, 'Av. San José'],
  [/av\.paseo/gi, 'Av. Paseo'],
  [/av\.prolongaci[oó]n/gi, 'Av. Prolongación'],
  [/pte\.?\s*trujillo/gi, 'Puente Trujillo'],
  [/pte\s+santa\s+rosa/gi, 'Puente Santa Rosa'],
  [/av\.\s*del\s+ejercito/gi, 'Av. del Ejército'],
  [/\bca\.\s*dalias\b/gi, 'Calle Las Dalias'],
  [/entreca\./gi, 'Entre Ca.'],
  [/\s+/g, ' ']
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadJson(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch {
    // ignore corrupt cache and rebuild
  }
  return fallback;
}

function saveJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function loadBundleFromDataJs() {
  const code = fs.readFileSync(DATA_JS_PATH, 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(code, sandbox);
  if (!sandbox.window.CICLOVIAS_BUNDLE) {
    throw new Error('No se pudo cargar window.CICLOVIAS_BUNDLE desde data.js');
  }
  return sandbox.window.CICLOVIAS_BUNDLE;
}

function stripAccents(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function cleanTokens(s) {
  return stripAccents(s)
    .replace(/ciclovia\s*/g, '')
    .replace(/[()]/g, ' ')
    .replace(
      /\b(av\.?|avenida|jr\.?|jiron|ca\.?|calle|cll\.?|psje\.?|pasaje|pje\.?|mal\.?|malecon|prol\.?|prolongacion|ov\.?|ovalo|alameda|alam\.?|parque|pq\.?|paseo|via|auxiliar|plaza|plz\.?|bajada|baj\.?|camino|gral\.?|general|cdra\.?|cuadra|sector|etapa)\b/g,
      ' '
    )
    .replace(/\b(de|del|la|las|los|el|y|e|en|a|al|u)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normDistrict(s) {
  return stripAccents(s)
    .replace(/lima cercado/g, 'lima')
    .replace(/magdalena del mar/g, 'magdalena')
    .replace(/santiago de surco/g, 'surco')
    .replace(/ate vitarte/g, 'ate')
    .trim();
}

function tokenSimilarity(a, b) {
  const ta = new Set(cleanTokens(a).split(' ').filter((w) => w.length >= 2));
  const tb = new Set(cleanTokens(b).split(' ').filter((w) => w.length >= 2));
  if (!ta.size || !tb.size) return 0;
  let hits = 0;
  for (const w of ta) {
    if (tb.has(w)) {
      hits += 1;
      continue;
    }
    for (const bw of tb) {
      if (w.length >= 4 && bw.length >= 4 && w.slice(0, 4) === bw.slice(0, 4)) {
        hits += 0.8;
        break;
      }
    }
  }
  return hits / Math.max(ta.size, tb.size);
}

function extractBaseStreet(nombre, districtNames) {
  let clean = nombre.replace(/^ciclov[ií]a\s+/i, '').trim();
  const normClean = stripAccents(clean);
  // Remove trailing " - <District>" using accent-insensitive matching
  const suffixVariants = [
    ...districtNames.map((d) => stripAccents(d)),
    'ate vitarte',
    'lima',
    'magdalena',
    'surco'
  ];
  const dashIdx = normClean.lastIndexOf('-');
  if (dashIdx > 2) {
    const tail = normClean.slice(dashIdx + 1).trim();
    if (suffixVariants.some((v) => tail === v || tail.includes(v))) {
      clean = clean.slice(0, dashIdx).trim();
    }
  }
  clean = clean.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  return clean;
}

function applyEndpointFixes(s) {
  let out = String(s || '').trim();
  for (const [re, rep] of ENDPOINT_FIXES) {
    out = out.replace(re, rep);
  }
  return out.trim();
}

function parseTramoEndpoints(tramoRaw) {
  const t = applyEndpointFixes(tramoRaw);

  // Multi-clause: "Entre A y B, [Av.] Entre B y C"
  let m = t.match(/^entre\s+(.+?)\s+y\s+([^,]+?)\s*,\s*(?:av\.\s*)?entre\s+(.+?)\s+y\s+(.+)$/i);
  if (m) {
    return { inicioLabel: m[1].trim(), finLabel: m[4].trim(), isSinglePoint: false };
  }

  // Standard "Entre X y/hasta/u Y"
  m = t.match(/^entre\s+(.+?)\s+(?:y|hasta|u)\s+(.+)$/i);
  if (m) {
    const s = m[1].trim();
    const e = m[2].trim();
    return { inicioLabel: s, finLabel: e, isSinglePoint: stripAccents(s) === stripAccents(e) };
  }

  // Dash separated: "Entre X - Y"
  m = t.match(/^entre\s+(.+?)\s*-\s*(.+)$/i);
  if (m) {
    const s = m[1].trim();
    const e = m[2].trim();
    return { inicioLabel: s, finLabel: e, isSinglePoint: stripAccents(s) === stripAccents(e) };
  }

  // Missing conjunction between two street prefixes inside "Entre <Street1> <Street2>"
  m = t.match(/^entre\s+(.+)$/i);
  if (m) {
    const inner = m[1].trim();
    const splitMatch = inner.match(/^(.+?)\s+(?=(?:Av\.|Jr\.|Ca\.|Malec[oó]n|Psje\.|Pje\.|Óvalo|Ovalo|Plaza)\s)/i);
    if (splitMatch && splitMatch[1].length >= 4) {
      const s = splitMatch[1].trim();
      const e = inner.slice(s.length).trim();
      return { inicioLabel: s, finLabel: e, isSinglePoint: false };
    }
    return { inicioLabel: inner, finLabel: inner, isSinglePoint: true };
  }

  return { inicioLabel: t, finLabel: t, isSinglePoint: true };
}

function haversineKm(a, b) {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLon = (b[1] - a[1]) * rad;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function polylineLengthKm(coords) {
  let km = 0;
  for (let i = 1; i < coords.length; i++) {
    km += haversineKm(coords[i - 1], coords[i]);
  }
  return km;
}

function midpoint(coords) {
  if (!coords.length) return null;
  return coords[Math.floor(coords.length / 2)];
}

function stitchPaths(paths, maxGapKm = 0.25) {
  const latLngPaths = paths
    .map((p) => p.map(([lng, lat]) => [lat, lng]))
    .filter((p) => p.length >= 2);
  if (latLngPaths.length <= 1) return latLngPaths;

  // Greedily stitch paths whose endpoints are within maxGapKm
  const remaining = latLngPaths.slice(1);
  const stitched = [latLngPaths[0].slice()];

  while (remaining.length > 0) {
    const cur = stitched[stitched.length - 1];
    const curEnd = cur[cur.length - 1];
    const curStart = cur[0];
    let bestIdx = -1;
    let bestDist = Infinity;
    let mode = 'append';

    for (let i = 0; i < remaining.length; i++) {
      const p = remaining[i];
      const d1 = haversineKm(curEnd, p[0]);
      const d2 = haversineKm(curEnd, p[p.length - 1]);
      const d3 = haversineKm(curStart, p[p.length - 1]);
      const d4 = haversineKm(curStart, p[0]);
      if (d1 < bestDist) { bestDist = d1; bestIdx = i; mode = 'append'; }
      if (d2 < bestDist) { bestDist = d2; bestIdx = i; mode = 'append_rev'; }
      if (d3 < bestDist) { bestDist = d3; bestIdx = i; mode = 'prepend'; }
      if (d4 < bestDist) { bestDist = d4; bestIdx = i; mode = 'prepend_rev'; }
    }

    const chosen = remaining.splice(bestIdx, 1)[0];
    if (bestDist <= maxGapKm) {
      if (mode === 'append') cur.push(...chosen);
      else if (mode === 'append_rev') cur.push(...chosen.slice().reverse());
      else if (mode === 'prepend') stitched[stitched.length - 1] = [...chosen, ...cur];
      else stitched[stitched.length - 1] = [...chosen.slice().reverse(), ...cur];
    } else {
      stitched.push(chosen);
    }
  }

  return stitched;
}

async function fetchWithRetry(url, options = {}, retries = 3) {
  let lastErr;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(url, { ...options, signal: ctrl.signal });
      clearTimeout(timeout);
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        continue;
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} on ${url.slice(0, 80)}`);
      }
      return await res.json();
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    }
  }
  throw lastErr;
}

async function loadBmFeatures() {
  if (fs.existsSync(BM_CACHE_PATH)) {
    const cached = loadJson(BM_CACHE_PATH, null);
    if (cached && Array.isArray(cached.features) && cached.features.length > 0) {
      console.log(`BM cache cargado: ${cached.features.length} features`);
      return cached.features;
    }
  }
  console.log('Descargando trazos Banco Mundial (ArcGIS FeatureServer)...');
  const json = await fetchWithRetry(BM_URL);
  if (!json.features || !json.features.length) {
    throw new Error('No se recibieron features del FeatureServer BM.');
  }
  saveJson(BM_CACHE_PATH, json);
  console.log(`BM descargado y cacheado: ${json.features.length} features`);
  return json.features;
}

function preprocessBm(features) {
  return features
    .map((f) => {
      const a = f.attributes || {};
      const stitched = stitchPaths(f.geometry?.paths || []);
      if (!stitched.length) return null;
      // Primary longest contiguous chain for 1-to-1, plus all paths for corridor slicing
      const longest = stitched.slice().sort((x, y) => polylineLengthKm(y) - polylineLengthKm(x))[0];
      const geomKm = polylineLengthKm(longest);
      return {
        fid: a.FID,
        nombreDe: (a.Nombre_de || '').trim(),
        ciclovia: (a['Ciclovía'] || '').trim(),
        via: (a['Vía'] || '').trim(),
        desde: (a.Desde || '').trim(),
        hasta: (a.Hasta || '').trim(),
        distrito: (a.Distrito || '').trim(),
        attrKm: parseFloat(a['Longitud__']) || geomKm,
        geomKm,
        coords: longest,
        allPaths: stitched,
        mid: midpoint(longest)
      };
    })
    .filter(Boolean);
}

function getStreetSearchAlias(street) {
  const key = stripAccents(street)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return STREET_ALIASES[key] || street;
}

function isWithinLima(pt) {
  return (
    pt &&
    Number.isFinite(pt[0]) &&
    Number.isFinite(pt[1]) &&
    pt[0] >= LIMA_BOUNDS.minLat &&
    pt[0] <= LIMA_BOUNDS.maxLat &&
    pt[1] >= LIMA_BOUNDS.minLng &&
    pt[1] <= LIMA_BOUNDS.maxLng
  );
}

function isBareDistrictAddress(address, distrito) {
  const normAddr = stripAccents(address || '');
  const normDist = normDistrict(distrito || '');
  const parts = normAddr.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 2 && !normAddr.includes('&')) {
    const first = parts[0] || '';
    if (first === normDist || first === 'lima' || first === 'callao') return true;
  }
  return false;
}

function createGeocoder(geocodeCache) {
  let networkCalls = 0;

  async function queryArcgis(singleLine, bias, distrito, maxRadiusKm) {
    const key = `arc2:${stripAccents(singleLine)}:${stripAccents(distrito)}`;
    if (key in geocodeCache) return geocodeCache[key];

    const url =
      'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?' +
      new URLSearchParams({
        SingleLine: singleLine,
        f: 'json',
        maxLocations: '6',
        location: `${bias.lng},${bias.lat}`,
        distance: String(Math.round(maxRadiusKm * 1000))
      }).toString();

    networkCalls++;
    await new Promise((r) => setTimeout(r, 90));
    let result = null;
    try {
      const j = await fetchWithRetry(url);
      const candidates = (j.candidates || []).filter((c) => {
        if (!c.location || !isWithinLima([c.location.y, c.location.x])) return false;
        if (isBareDistrictAddress(c.address, distrito)) return false;
        return haversineKm([c.location.y, c.location.x], [bias.lat, bias.lng]) <= maxRadiusKm;
      });
      if (candidates.length > 0) {
        candidates.sort((a, b) => {
          const da = haversineKm([a.location.y, a.location.x], [bias.lat, bias.lng]);
          const db = haversineKm([b.location.y, b.location.x], [bias.lat, bias.lng]);
          return b.score - db * 2.5 - (a.score - da * 2.5);
        });
        const best = candidates[0];
        result = {
          lat: best.location.y,
          lng: best.location.x,
          score: best.score,
          address: best.address,
          provider: 'arcgis'
        };
      }
    } catch {
      result = null;
    }
    geocodeCache[key] = result;
    return result;
  }

  async function queryPhoton(q, bias) {
    const key = `pho:${stripAccents(q)}`;
    if (key in geocodeCache) return geocodeCache[key];

    const url =
      'https://photon.komoot.io/api/?' +
      new URLSearchParams({
        q,
        lat: String(bias.lat),
        lon: String(bias.lng),
        limit: '3'
      }).toString();

    networkCalls++;
    await new Promise((r) => setTimeout(r, 120));
    let result = null;
    try {
      const j = await fetchWithRetry(url, {
        headers: { 'User-Agent': 'LimaCicloviasViewer/1.0' }
      });
      const feats = (j.features || []).filter(
        (f) => f.geometry?.coordinates && isWithinLima([f.geometry.coordinates[1], f.geometry.coordinates[0]])
      );
      if (feats.length > 0) {
        const c = feats[0].geometry.coordinates;
        result = {
          lat: c[1],
          lng: c[0],
          score: 80,
          address: feats[0].properties?.name || q,
          provider: 'photon'
        };
      }
    } catch {
      result = null;
    }
    geocodeCache[key] = result;
    return result;
  }

  async function geocodeIntersection(mainStreet, crossLabel, distrito, bias, maxRadiusKm) {
    const sKey = stripAccents(mainStreet);
    const cKey = stripAccents(applyEndpointFixes(crossLabel));
    for (const pair of PAIR_COORDS) {
      if (sKey.includes(pair.street) && cKey.includes(pair.cross)) {
        return pair.coords;
      }
    }

    const landmarkKey = cKey;
    for (const [k, coords] of Object.entries(LANDMARK_COORDS)) {
      if (landmarkKey.includes(k) && haversineKm(coords, [bias.lat, bias.lng]) <= maxRadiusKm + 4) {
        return coords;
      }
    }

    const districtClean = distrito === 'LIMA CERCADO' ? 'Lima' : distrito;
    const crossClean = applyEndpointFixes(crossLabel);
    const streetClean = getStreetSearchAlias(mainStreet);

    const attempts = [
      `${streetClean} & ${crossClean}, ${districtClean}, Lima, Peru`,
      `${crossClean} & ${streetClean}, ${districtClean}, Lima, Peru`,
      `${crossClean}, ${districtClean}, Lima, Peru`
    ];

    for (const q of attempts) {
      const hit = await queryArcgis(q, bias, distrito, maxRadiusKm);
      if (hit && hit.score >= 76) {
        return [hit.lat, hit.lng];
      }
    }

    const pHit = await queryPhoton(`${streetClean} ${crossClean} ${districtClean} Lima Peru`, bias);
    if (pHit) {
      const dist = haversineKm([pHit.lat, pHit.lng], [bias.lat, bias.lng]);
      if (dist <= maxRadiusKm) return [pHit.lat, pHit.lng];
    }
    return null;
  }

  async function geocodePlace(placeLabel, distrito, bias, maxRadiusKm) {
    const landmarkKey = stripAccents(applyEndpointFixes(placeLabel));
    for (const [k, coords] of Object.entries(LANDMARK_COORDS)) {
      if (landmarkKey.includes(k) && haversineKm(coords, [bias.lat, bias.lng]) <= maxRadiusKm + 4) {
        return coords;
      }
    }

    const districtClean = distrito === 'LIMA CERCADO' ? 'Lima' : distrito;
    const hit = await queryArcgis(`${getStreetSearchAlias(placeLabel)}, ${districtClean}, Lima, Peru`, bias, distrito, maxRadiusKm);
    if (hit && hit.score >= 75) {
      return [hit.lat, hit.lng];
    }
    const pHit = await queryPhoton(`${placeLabel} ${districtClean} Lima Peru`, bias);
    if (pHit && haversineKm([pHit.lat, pHit.lng], [bias.lat, bias.lng]) <= maxRadiusKm) {
      return [pHit.lat, pHit.lng];
    }
    return null;
  }

  return {
    geocodeIntersection,
    geocodePlace,
    getNetworkCalls: () => networkCalls
  };
}

function createBikeRouter(routeCache) {
  let networkCalls = 0;

  async function queryOsrmSingle(providerName, baseUrl, p1, p2) {
    const rKey = `${providerName}:${p1[0].toFixed(5)},${p1[1].toFixed(5)}->${p2[0].toFixed(5)},${p2[1].toFixed(5)}`;
    if (rKey in routeCache) return routeCache[rKey];

    const url = `${baseUrl}/${p1[1]},${p1[0]};${p2[1]},${p2[0]}?overview=full&geometries=geojson`;
    networkCalls++;
    await new Promise((r) => setTimeout(r, 110));
    let res = null;
    try {
      const j = await fetchWithRetry(url, {
        headers: { 'User-Agent': 'LimaCicloviasViewer/1.0' }
      });
      if (j.routes && j.routes[0]?.geometry?.coordinates?.length >= 2) {
        const coords = j.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
        res = {
          coords,
          distanceKm: (j.routes[0].distance || 0) / 1000,
          provider: providerName
        };
      }
    } catch {
      res = null;
    }
    routeCache[rKey] = res;
    return res;
  }

  async function routeBikeBidirectional(startPt, endPt, targetKm) {
    const candidates = [];
    const bikeFwd = await queryOsrmSingle(
      'osm_bike',
      'https://routing.openstreetmap.de/routed-bike/route/v1/driving',
      startPt,
      endPt
    );
    if (bikeFwd) candidates.push({ coords: bikeFwd.coords, km: bikeFwd.distanceKm });

    const bikeRev = await queryOsrmSingle(
      'osm_bike',
      'https://routing.openstreetmap.de/routed-bike/route/v1/driving',
      endPt,
      startPt
    );
    if (bikeRev) candidates.push({ coords: bikeRev.coords.slice().reverse(), km: bikeRev.distanceKm });

    if (!candidates.length) {
      const drvFwd = await queryOsrmSingle(
        'osrm_drv',
        'https://router.project-osrm.org/route/v1/driving',
        startPt,
        endPt
      );
      if (drvFwd) candidates.push({ coords: drvFwd.coords, km: drvFwd.distanceKm });

      const drvRev = await queryOsrmSingle(
        'osrm_drv',
        'https://router.project-osrm.org/route/v1/driving',
        endPt,
        startPt
      );
      if (drvRev) candidates.push({ coords: drvRev.coords.slice().reverse(), km: drvRev.distanceKm });
    }

    if (!candidates.length) return null;
    candidates.sort((a, b) => Math.abs(a.km - targetKm) - Math.abs(b.km - targetKm));
    return candidates[0];
  }

  return {
    routeBikeBidirectional,
    getNetworkCalls: () => networkCalls
  };
}

function densifyPath(coords, maxStepKm = 0.035) {
  if (coords.length < 2) return coords.slice();
  const out = [coords[0]];
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1];
    const b = coords[i];
    const d = haversineKm(a, b);
    if (d > maxStepKm) {
      const steps = Math.ceil(d / maxStepKm);
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    out.push(b);
  }
  return out;
}

function buildCorridorGraph(bmMatches) {
  const nodes = [];
  const adj = [];

  for (const bm of bmMatches) {
    for (const rawPath of bm.allPaths) {
      const dense = densifyPath(rawPath, 0.035);
      let prevIdx = -1;
      for (const pt of dense) {
        const idx = nodes.length;
        nodes.push(pt);
        adj.push([]);
        if (prevIdx !== -1) {
          const w = haversineKm(nodes[prevIdx], pt);
          adj[prevIdx].push({ to: idx, w });
          adj[idx].push({ to: prevIdx, w });
        }
        prevIdx = idx;
      }
    }
  }

  // Link nearby vertices across separate BM features of the same corridor (<= 220m)
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (Math.abs(nodes[i][0] - nodes[j][0]) > 0.0024 || Math.abs(nodes[i][1] - nodes[j][1]) > 0.0024) {
        continue;
      }
      const d = haversineKm(nodes[i], nodes[j]);
      if (d <= 0.22) {
        // Avoid duplicating direct consecutive links
        if (!adj[i].some((e) => e.to === j)) {
          adj[i].push({ to: j, w: Math.max(d, 0.001) });
          adj[j].push({ to: i, w: Math.max(d, 0.001) });
        }
      }
    }
  }

  return { nodes, adj };
}

function findNearestNode(graph, pt, maxDistKm = 0.45) {
  let bestIdx = -1;
  let bestDist = Infinity;
  for (let i = 0; i < graph.nodes.length; i++) {
    const d = haversineKm(graph.nodes[i], pt);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  if (bestIdx !== -1 && bestDist <= maxDistKm) {
    return { idx: bestIdx, distKm: bestDist };
  }
  return null;
}

function dijkstra(graph, startIdx, endIdx) {
  const n = graph.nodes.length;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const visited = new Uint8Array(n);
  dist[startIdx] = 0;

  // Simple O(V^2) or min-heap (n <= 1200 per street corridor, so min-heap or linear is <1ms; use binary heap for clarity)
  const heap = [[0, startIdx]];
  while (heap.length > 0) {
    // pop min
    const top = heap[0];
    const last = heap.pop();
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      while (true) {
        let smallest = i;
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        if (l < heap.length && heap[l][0] < heap[smallest][0]) smallest = l;
        if (r < heap.length && heap[r][0] < heap[smallest][0]) smallest = r;
        if (smallest === i) break;
        [heap[i], heap[smallest]] = [heap[smallest], heap[i]];
        i = smallest;
      }
    }

    const [d, u] = top;
    if (visited[u]) continue;
    visited[u] = 1;
    if (u === endIdx) break;

    for (const edge of graph.adj[u]) {
      const nd = d + edge.w;
      if (nd < dist[edge.to]) {
        dist[edge.to] = nd;
        prev[edge.to] = u;
        heap.push([nd, edge.to]);
        let ci = heap.length - 1;
        while (ci > 0) {
          const pi = (ci - 1) >> 1;
          if (heap[pi][0] <= heap[ci][0]) break;
          [heap[pi], heap[ci]] = [heap[ci], heap[pi]];
          ci = pi;
        }
      }
    }
  }

  if (!Number.isFinite(dist[endIdx])) return null;
  const coords = [];
  let cur = endIdx;
  while (cur !== -1) {
    coords.push(graph.nodes[cur]);
    cur = prev[cur];
  }
  coords.reverse();
  return { coords, km: dist[endIdx] };
}

function perpDistSq(p, a, b) {
  let x = a[0];
  let y = a[1];
  let dx = b[0] - x;
  let dy = b[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = b[0];
      y = b[1];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = p[0] - x;
  dy = p[1] - y;
  return dx * dx + dy * dy;
}

function simplifyDP(points, epsilon = 0.00003) {
  if (points.length <= 2) return points.slice();
  const sqEps = epsilon * epsilon;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];

  while (stack.length > 0) {
    const [first, last] = stack.pop();
    let maxSq = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const sq = perpDistSq(points[i], points[first], points[last]);
      if (sq > maxSq) {
        maxSq = sq;
        index = i;
      }
    }
    if (maxSq > sqEps && index !== -1) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }

  const out = [];
  for (let i = 0; i < points.length; i++) {
    if (keep[i]) out.push(points[i]);
  }
  return out;
}

function roundCoords(coords) {
  return coords.map(([lat, lng]) => [Math.round(lat * 1e5) / 1e5, Math.round(lng * 1e5) / 1e5]);
}

function makeLoopCoords(center, targetKm) {
  const radiusKm = Math.max(0.025, Math.min(0.12, targetKm / (2 * Math.PI)));
  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / (111.32 * Math.cos((center[0] * Math.PI) / 180));
  const pts = [];
  const N = 24;
  for (let i = 0; i <= N; i++) {
    const ang = (2 * Math.PI * i) / N;
    pts.push([center[0] + dLat * Math.sin(ang), center[1] + dLng * Math.cos(ang)]);
  }
  return pts;
}

function buildBikewayGraph(routesById, recordsById) {
  const CELL = 0.001; // ~110m
  const grid = new Map();
  const samplePointsByTramo = new Map();

  const addGrid = (pt, tramoId) => {
    const cx = Math.floor(pt[0] / CELL);
    const cy = Math.floor(pt[1] / CELL);
    const k = `${cx},${cy}`;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push({ pt, tramoId });
  };

  for (const [idStr, route] of Object.entries(routesById)) {
    const tramoId = Number(idStr);
    const dense = densifyPath(route.coords, 0.045);
    samplePointsByTramo.set(tramoId, dense);
    for (const pt of dense) {
      addGrid(pt, tramoId);
    }
  }

  const candidates = [];
  const PROXIMITY_KM = 0.065; // 65m junction snap radius

  for (const [idStr, route] of Object.entries(routesById)) {
    const tramoId = Number(idStr);
    const dense = samplePointsByTramo.get(tramoId);
    // Check endpoints + every 4th interior sample point so T-junctions & crossings are captured
    const probeIndices = new Set([0, dense.length - 1]);
    for (let i = 3; i < dense.length - 1; i += 4) probeIndices.add(i);

    for (const idx of probeIndices) {
      const pt = dense[idx];
      const cx = Math.floor(pt[0] / CELL);
      const cy = Math.floor(pt[1] / CELL);
      const nearbyTramos = new Set([tramoId]);

      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const bucket = grid.get(`${cx + dx},${cy + dy}`);
          if (!bucket) continue;
          for (const item of bucket) {
            if (item.tramoId === tramoId) continue;
            if (haversineKm(pt, item.pt) <= PROXIMITY_KM) {
              nearbyTramos.add(item.tramoId);
            }
          }
        }
      }

      if (nearbyTramos.size >= 2) {
        candidates.push({
          lat: pt[0],
          lng: pt[1],
          tramoIds: nearbyTramos
        });
      }
    }
  }

  // Cluster candidates within 70m into junction nodes
  const junctions = [];
  for (const cand of candidates) {
    let matched = null;
    for (const j of junctions) {
      if (haversineKm([cand.lat, cand.lng], [j.lat, j.lng]) <= 0.07) {
        matched = j;
        break;
      }
    }
    if (matched) {
      const prevCount = matched.sampleCount;
      matched.lat = (matched.lat * prevCount + cand.lat) / (prevCount + 1);
      matched.lng = (matched.lng * prevCount + cand.lng) / (prevCount + 1);
      matched.sampleCount += 1;
      for (const tid of cand.tramoIds) matched.tramoSet.add(tid);
    } else {
      junctions.push({
        lat: cand.lat,
        lng: cand.lng,
        sampleCount: 1,
        tramoSet: new Set(cand.tramoIds)
      });
    }
  }

  // Filter valid junctions (2+ tramos) and sort by degree descending
  const rawNodes = junctions
    .filter((j) => j.tramoSet.size >= 2)
    .map((j) => ({
      lat: Math.round(j.lat * 1e5) / 1e5,
      lng: Math.round(j.lng * 1e5) / 1e5,
      tramoIds: Array.from(j.tramoSet).sort((a, b) => a - b)
    }))
    .sort((a, b) => b.tramoIds.length - a.tramoIds.length);

  // Union-find / BFS across tramos sharing junction nodes
  const adjTramos = new Map();
  for (const idStr of Object.keys(routesById)) {
    adjTramos.set(Number(idStr), new Set());
  }
  for (const jn of rawNodes) {
    for (let i = 0; i < jn.tramoIds.length; i++) {
      for (let k = i + 1; k < jn.tramoIds.length; k++) {
        adjTramos.get(jn.tramoIds[i]).add(jn.tramoIds[k]);
        adjTramos.get(jn.tramoIds[k]).add(jn.tramoIds[i]);
      }
    }
  }

  const visited = new Set();
  const components = [];
  for (const tid of adjTramos.keys()) {
    if (visited.has(tid)) continue;
    const queue = [tid];
    visited.add(tid);
    const compTramos = [];
    while (queue.length > 0) {
      const u = queue.shift();
      compTramos.push(u);
      for (const v of adjTramos.get(u)) {
        if (!visited.has(v)) {
          visited.add(v);
          queue.push(v);
        }
      }
    }
    const km = compTramos.reduce((s, id) => s + (recordsById.get(id)?.longitudKm || 0), 0);
    components.push({ tramoIds: compTramos, tramosCount: compTramos.length, km: Number(km.toFixed(2)) });
  }

  components.sort((a, b) => b.tramosCount - a.tramosCount || b.km - a.km);
  components.forEach((c, idx) => {
    c.id = idx + 1;
    for (const tid of c.tramoIds) {
      routesById[tid].componentId = c.id;
    }
  });

  const junctionNodes = rawNodes.map((jn, idx) => {
    const seenTokens = new Set();
    const uniqueNames = [];
    for (const tid of jn.tramoIds) {
      const r = recordsById.get(tid);
      if (!r) continue;
      // Strip "Ciclovía " prefix and trailing "- Distrito" (even without spaces around '-')
      const rawName = r.nombre.replace(/^ciclov[ií]a\s+/i, '').trim();
      const cleanedName = rawName.replace(/\s*-\s*[^-]+$/, '').trim() || rawName;
      const key = cleanTokens(cleanedName);
      if (key && !seenTokens.has(key)) {
        seenTokens.add(key);
        uniqueNames.push(cleanedName);
        if (uniqueNames.length >= 3) break;
      }
    }
    const district = recordsById.get(jn.tramoIds[0])?.distrito || '';
    return {
      id: `J-${idx + 1}`,
      lat: jn.lat,
      lng: jn.lng,
      degree: jn.tramoIds.length,
      tramoIds: jn.tramoIds,
      label: `${uniqueNames.join(' × ')}${district ? ` (${district})` : ''}`
    };
  });

  return {
    junctionNodes,
    components: components.map((c) => ({ id: c.id, tramosCount: c.tramosCount, km: c.km }))
  };
}

async function main() {
  ensureDir(CACHE_DIR);
  const bundle = loadBundleFromDataJs();
  const records = bundle.records;
  const districtCoords = bundle.districtCoords;
  const allDistrictNames = Object.keys(districtCoords);
  const recordsById = new Map(records.map((r) => [r.id, r]));

  const geocodeCache = loadJson(GEOCODE_CACHE_PATH, {});
  const routeCache = loadJson(ROUTE_CACHE_PATH, {});
  const bmRaw = await loadBmFeatures();
  const bmFeatures = preprocessBm(bmRaw);

  const geocoder = createGeocoder(geocodeCache);
  const bikeRouter = createBikeRouter(routeCache);

  const routesById = {};
  const unmapped = [];
  const sourceCounts = { bm_exact: 0, bm_sliced: 0, osm_bike_graph: 0, ovalo_loop: 0 };

  // Pre-group street candidates from BM for each row
  const corridorGraphCache = new Map();

  for (let idx = 0; idx < records.length; idx++) {
    const row = records[idx];
    const bias = districtCoords[row.distrito];
    const maxRadiusKm = PERIPHERAL_DISTRICTS.has(row.distrito) ? 18 : 9;
    const baseStreet = extractBaseStreet(row.nombre, allDistrictNames);
    const searchStreet = getStreetSearchAlias(baseStreet);
    const ep = parseTramoEndpoints(row.tramo);
    const rowDistNorm = normDistrict(row.distrito);

    // Find all plausible BM features for this street
    const bmCandidates = [];
    for (const bm of bmFeatures) {
      if (!bm.mid) continue;
      const distFromBias = haversineKm(bm.mid, [bias.lat, bias.lng]);
      if (distFromBias > maxRadiusKm + 3) continue;

      const bDistNorm = normDistrict(bm.distrito);
      const distOk = !bDistNorm || bDistNorm.includes(rowDistNorm) || rowDistNorm.includes(bDistNorm);
      const nameSim = Math.max(
        tokenSimilarity(searchStreet, bm.via),
        tokenSimilarity(searchStreet, bm.nombreDe),
        tokenSimilarity(searchStreet, bm.ciclovia),
        tokenSimilarity(baseStreet, bm.via),
        tokenSimilarity(baseStreet, bm.nombreDe)
      );
      if (nameSim < 0.55) continue;

      const epDir =
        (tokenSimilarity(ep.inicioLabel, bm.desde) + tokenSimilarity(ep.finLabel, bm.hasta)) / 2;
      const epRev =
        (tokenSimilarity(ep.inicioLabel, bm.hasta) + tokenSimilarity(ep.finLabel, bm.desde)) / 2;
      const epSim = Math.max(epDir, epRev);
      const lenRatio =
        bm.geomKm > 0 && row.longitudKm > 0
          ? Math.min(bm.geomKm, row.longitudKm) / Math.max(bm.geomKm, row.longitudKm)
          : 0;
      const lenDiff = Math.abs(bm.geomKm - row.longitudKm);

      bmCandidates.push({
        bm,
        distOk,
        nameSim,
        epDir,
        epRev,
        epSim,
        lenRatio,
        lenDiff,
        score: nameSim * 2.2 + (distOk ? 1.2 : 0) + epSim * 1.6 + lenRatio * 1.0
      });
    }
    bmCandidates.sort((a, b) => b.score - a.score);

    // Count how many CSV tramos share this base street in this district, and code across Lima
    const sameStreetInDistCount = records.filter(
      (r) => r.distrito === row.distrito && extractBaseStreet(r.nombre, allDistrictNames) === baseStreet
    ).length;
    const totalSameCodeInCsv = records.filter((r) => r.codigo === row.codigo).length;

    // TIER 1: Direct 1-to-1 BM match
    const strongBm = bmCandidates.filter((c) => c.distOk && c.nameSim >= 0.72);
    const lenMatchedStrongBm = strongBm.filter(
      (c) =>
        (c.bm.geomKm >= row.longitudKm * 0.55 && c.bm.geomKm <= row.longitudKm * 1.55) ||
        (row.longitudKm < 0.5 && c.lenDiff <= 0.28)
    );
    const top = bmCandidates[0];
    const lenOkTier1 =
      top &&
      ((top.bm.geomKm >= row.longitudKm * 0.55 && top.bm.geomKm <= row.longitudKm * 1.55) ||
        (row.longitudKm < 0.5 && top.lenDiff <= 0.28));
    if (
      top &&
      top.nameSim >= 0.7 &&
      top.distOk &&
      lenOkTier1 &&
      (top.epSim >= 0.35 ||
        (sameStreetInDistCount === 1 && strongBm.length === 1 && (totalSameCodeInCsv === 1 || top.lenRatio >= 0.88)) ||
        (totalSameCodeInCsv === 1 && top.lenRatio >= 0.7 && lenMatchedStrongBm.length === 1))
    ) {
      let coords = top.bm.coords.slice();
      let tier1Valid = true;
      if (top.epRev > top.epDir + 0.15) {
        coords.reverse();
      }
      if (top.epSim < 0.75 && !ep.isSinglePoint) {
        const xPt = await geocoder.geocodeIntersection(baseStreet, ep.inicioLabel, row.distrito, bias, maxRadiusKm);
        const yPt = await geocoder.geocodeIntersection(baseStreet, ep.finLabel, row.distrito, bias, maxRadiusKm);
        if (xPt && yPt) {
          const directErr = haversineKm(coords[0], xPt) + haversineKm(coords[coords.length - 1], yPt);
          const revErr = haversineKm(coords[coords.length - 1], xPt) + haversineKm(coords[0], yPt);
          if (revErr + 0.05 < directErr) coords.reverse();
          const endDistA = haversineKm(coords[0], xPt);
          const endDistB = haversineKm(coords[coords.length - 1], yPt);
          // Reject Tier 1 only if a multi-tramo corridor grabbed a neighboring wrong segment (>1.6km off at an endpoint)
          if (totalSameCodeInCsv > 1 && (endDistA > 1.6 || endDistB > 1.6)) {
            tier1Valid = false;
          }
        }
      }

      if (tier1Valid) {
        const simplified = roundCoords(simplifyDP(coords));
        routesById[row.id] = {
          coords: simplified,
          start: simplified[0],
          end: simplified[simplified.length - 1],
          inicioLabel: ep.inicioLabel,
          finLabel: ep.finLabel,
          geomKm: Number(polylineLengthKm(simplified).toFixed(2)),
          source: 'bm_exact'
        };
        sourceCounts.bm_exact++;
        continue;
      }
    }

    // TIER 1B: Contiguous multi-segment BM merge when street appears once in district
    if (sameStreetInDistCount === 1 && strongBm.length >= 2 && strongBm.length <= 5) {
      const mergedPaths = stitchPaths(
        strongBm.map((c) => c.bm.coords.map(([lat, lng]) => [lng, lat])),
        0.32
      );
      if (mergedPaths.length === 1) {
        let coords = mergedPaths[0];
        const mergedKm = polylineLengthKm(coords);
        if (mergedKm >= row.longitudKm * 0.65 && mergedKm <= row.longitudKm * 1.35) {
          if (!ep.isSinglePoint) {
            const xPt = await geocoder.geocodeIntersection(baseStreet, ep.inicioLabel, row.distrito, bias, maxRadiusKm);
            const yPt = await geocoder.geocodeIntersection(baseStreet, ep.finLabel, row.distrito, bias, maxRadiusKm);
            if (xPt && yPt) {
              const directErr = haversineKm(coords[0], xPt) + haversineKm(coords[coords.length - 1], yPt);
              const revErr = haversineKm(coords[coords.length - 1], xPt) + haversineKm(coords[0], yPt);
              if (revErr + 0.05 < directErr) coords.reverse();
            }
          }
          const simplified = roundCoords(simplifyDP(coords));
          routesById[row.id] = {
            coords: simplified,
            start: simplified[0],
            end: simplified[simplified.length - 1],
            inicioLabel: ep.inicioLabel,
            finLabel: ep.finLabel,
            geomKm: Number(polylineLengthKm(simplified).toFixed(2)),
            source: 'bm_exact'
          };
          sourceCounts.bm_exact++;
          continue;
        }
      }
    }

    // TIER 2: BM Corridor Graph Slicing
    const strongCorridorCands = bmCandidates.filter((c) => c.nameSim >= 0.65);
    let resolved = false;

    if (strongCorridorCands.length > 0 && !ep.isSinglePoint) {
      const xPt = await geocoder.geocodeIntersection(baseStreet, ep.inicioLabel, row.distrito, bias, maxRadiusKm);
      const yPt = await geocoder.geocodeIntersection(baseStreet, ep.finLabel, row.distrito, bias, maxRadiusKm);

      if (xPt && yPt) {
        const cacheKey = `${row.distrito}::${cleanTokens(searchStreet)}`;
        let cGraph = corridorGraphCache.get(cacheKey);
        if (!cGraph) {
          // Include all BM features across Lima matching this avenue within 25km of district bias
          const aveMatches = bmFeatures.filter(
            (bm) =>
              bm.mid &&
              haversineKm(bm.mid, [bias.lat, bias.lng]) <= 25 &&
              Math.max(
                tokenSimilarity(searchStreet, bm.via),
                tokenSimilarity(searchStreet, bm.nombreDe),
                tokenSimilarity(searchStreet, bm.ciclovia),
                tokenSimilarity(baseStreet, bm.via),
                tokenSimilarity(baseStreet, bm.nombreDe)
              ) >= 0.65
          );
          cGraph = buildCorridorGraph(aveMatches);
          corridorGraphCache.set(cacheKey, cGraph);
        }

        const startSnap = findNearestNode(cGraph, xPt, 0.72);
        const endSnap = findNearestNode(cGraph, yPt, 0.72);
        if (startSnap && endSnap && startSnap.idx !== endSnap.idx) {
          const pathRes = dijkstra(cGraph, startSnap.idx, endSnap.idx);
          const minAllowed = Math.max(0.02, row.longitudKm * 0.28);
          const maxAllowed = Math.max(row.longitudKm * 2.1, row.longitudKm + 0.65);
          if (pathRes && pathRes.km >= minAllowed && pathRes.km <= maxAllowed) {
            const simplified = roundCoords(simplifyDP(pathRes.coords));
            routesById[row.id] = {
              coords: simplified,
              start: simplified[0],
              end: simplified[simplified.length - 1],
              inicioLabel: ep.inicioLabel,
              finLabel: ep.finLabel,
              geomKm: Number(polylineLengthKm(simplified).toFixed(2)),
              source: 'bm_sliced'
            };
            sourceCounts.bm_sliced++;
            resolved = true;
          } else if (pathRes && pathRes.km > maxAllowed && pathRes.coords.length >= 2) {
            // Inter-district corridor where CSV names full endpoints but row covers this district's slice
            let closestIdx = 0;
            let closestDist = Infinity;
            for (let k = 0; k < pathRes.coords.length; k++) {
              const d = haversineKm(pathRes.coords[k], [bias.lat, bias.lng]);
              if (d < closestDist) { closestDist = d; closestIdx = k; }
            }
            if (closestDist <= maxRadiusKm * 0.6) {
              // Expand symmetrically (or along nearest end) up to target longitudKm
              let lo = closestIdx;
              let hi = closestIdx;
              let acc = 0;
              while (acc < row.longitudKm && (lo > 0 || hi < pathRes.coords.length - 1)) {
                const dLo = lo > 0 ? haversineKm(pathRes.coords[lo - 1], pathRes.coords[lo]) : Infinity;
                const dHi = hi < pathRes.coords.length - 1 ? haversineKm(pathRes.coords[hi], pathRes.coords[hi + 1]) : Infinity;
                if (lo > 0 && (dLo <= dHi || hi === pathRes.coords.length - 1)) {
                  lo--;
                  acc += dLo;
                } else if (hi < pathRes.coords.length - 1) {
                  hi++;
                  acc += dHi;
                } else {
                  break;
                }
              }
              const sub = pathRes.coords.slice(lo, hi + 1);
              if (sub.length >= 2) {
                const simplified = roundCoords(simplifyDP(sub));
                routesById[row.id] = {
                  coords: simplified,
                  start: simplified[0],
                  end: simplified[simplified.length - 1],
                  inicioLabel: ep.inicioLabel,
                  finLabel: ep.finLabel,
                  geomKm: Number(polylineLengthKm(simplified).toFixed(2)),
                  source: 'bm_sliced'
                };
                sourceCounts.bm_sliced++;
                resolved = true;
              }
            }
          }
        }
      }
    }
    if (resolved) continue;

    // TIER 3A: Single-point óvalo / plaza / circuito
    const isRoundaboutOrPark =
      ep.isSinglePoint || /^(ciclov[ií]a\s+)?([oó]valo|plaza|parque)\b/i.test(row.nombre);
    if (isRoundaboutOrPark && row.longitudKm <= 1.2) {
      const center =
        (await geocoder.geocodePlace(baseStreet, row.distrito, bias, maxRadiusKm)) ||
        (await geocoder.geocodePlace(ep.inicioLabel, row.distrito, bias, maxRadiusKm));
      if (center) {
        const loopCoords = roundCoords(makeLoopCoords(center, row.longitudKm));
        routesById[row.id] = {
          coords: loopCoords,
          start: loopCoords[0],
          end: loopCoords[loopCoords.length - 1],
          inicioLabel: ep.inicioLabel,
          finLabel: ep.finLabel,
          geomKm: Number(polylineLengthKm(loopCoords).toFixed(2)),
          source: 'ovalo_loop'
        };
        sourceCounts.ovalo_loop++;
        continue;
      }
    }

    // TIER 3B: OSM Bicycle Road Graph Routing (routed-bike + OSRM fallback)
    if (!ep.isSinglePoint) {
      const xPt = await geocoder.geocodeIntersection(baseStreet, ep.inicioLabel, row.distrito, bias, maxRadiusKm);
      const yPt = await geocoder.geocodeIntersection(baseStreet, ep.finLabel, row.distrito, bias, maxRadiusKm);
      if (xPt && yPt) {
        const straightKm = haversineKm(xPt, yPt);
        if (straightKm >= 0.01 && straightKm <= Math.max(row.longitudKm * 2.2, row.longitudKm + 1.5)) {
          const routed = await bikeRouter.routeBikeBidirectional(xPt, yPt, row.longitudKm);
          const minAllowed = Math.max(0.015, row.longitudKm * 0.32);
          const maxAllowed = Math.max(row.longitudKm * 2.4, row.longitudKm + 0.6);
          if (routed && routed.km >= minAllowed && routed.km <= maxAllowed) {
            const simplified = roundCoords(simplifyDP(routed.coords));
            routesById[row.id] = {
              coords: simplified,
              start: simplified[0],
              end: simplified[simplified.length - 1],
              inicioLabel: ep.inicioLabel,
              finLabel: ep.finLabel,
              geomKm: Number(polylineLengthKm(simplified).toFixed(2)),
              source: 'osm_bike_graph'
            };
            sourceCounts.osm_bike_graph++;
            continue;
          }
        }
      }
    }

    unmapped.push({
      id: row.id,
      codigo: row.codigo,
      nombre: row.nombre,
      tramo: row.tramo,
      distrito: row.distrito,
      longitudKm: row.longitudKm
    });

    if ((idx + 1) % 25 === 0) {
      saveJson(GEOCODE_CACHE_PATH, geocodeCache);
      saveJson(ROUTE_CACHE_PATH, routeCache);
      console.log(`Progreso: ${idx + 1}/${records.length}...`);
    }
  }

  saveJson(GEOCODE_CACHE_PATH, geocodeCache);
  saveJson(ROUTE_CACHE_PATH, routeCache);

  // Sanity check all coordinates
  for (const [idStr, r] of Object.entries(routesById)) {
    if (!r.coords || r.coords.length < 2) {
      throw new Error(`Ruta ${idStr} inválida (<2 puntos)`);
    }
    for (const pt of r.coords) {
      if (!isWithinLima(pt)) {
        throw new Error(`Ruta ${idStr} fuera de Lima: ${JSON.stringify(pt)}`);
      }
    }
  }

  const graph = buildBikewayGraph(routesById, recordsById);
  const totalMapped = Object.keys(routesById).length;
  const stats = {
    totalTramos: records.length,
    totalMapped,
    totalUnmapped: unmapped.length,
    coveragePct: Number(((totalMapped / records.length) * 100).toFixed(1)),
    sourceCounts,
    junctionCount: graph.junctionNodes.length,
    componentCount: graph.components.length,
    largestComponentTramos: graph.components[0]?.tramosCount || 0,
    largestComponentKm: graph.components[0]?.km || 0
  };

  const payload = { routesById, graph, stats };
  const jsOut = `// Generado automáticamente por scripts/build-geometries.mjs\nwindow.CICLOVIAS_GEOMETRIES = ${JSON.stringify(payload)};\n`;
  fs.writeFileSync(OUT_PATH, jsOut, 'utf8');

  const sizeKb = (fs.statSync(OUT_PATH).size / 1024).toFixed(1);
  console.log('\n=== RESUMEN DE TRAZADO ===');
  console.log(`Archivo generado: ${OUT_PATH} (${sizeKb} KB)`);
  console.log(`Mapeados: ${totalMapped} / ${records.length} (${stats.coveragePct}%)`);
  console.log('Por fuente:', sourceCounts);
  console.log(`Nodos de cruce (grafo): ${stats.junctionCount} | Componentes conexos: ${stats.componentCount} (red principal: ${stats.largestComponentTramos} tramos / ${stats.largestComponentKm} km)`);
  console.log(`Peticiones red en esta corrida -> Geocoder: ${geocoder.getNetworkCalls()}, Router: ${bikeRouter.getNetworkCalls()}`);
  if (unmapped.length > 0) {
    console.log(`\nNo mapeados (${unmapped.length}):`);
    unmapped.forEach((u) => console.log(`  #${u.id} | ${u.codigo} | ${u.nombre} | ${u.tramo} | ${u.distrito} | ${u.longitudKm} km`));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
