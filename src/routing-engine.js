import { isWithinLimaBounds } from './geocoder.js';

const PREFERENCE_WEIGHTS = {
  equilibrada: 0.26,
  maxima: 0.14,
  directa: 0.58
};

export function haversineKm(a, b) {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLon = (b[1] - a[1]) * rad;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * Build the in-memory hybrid ciclovía routing engine and Dijkstra solver.
 */
export function createRoutingEngine({ records, districtCoords, routesById, graph, stats }) {
  const recordsById = new Map(records.map((r) => [r.id, r]));
  const streetRouteCache = new Map();

  const nodes = [];
  const adj = [];
  let edgeCount = 0;

  const addNode = (lat, lng, tramoId, codigo, isEndpoint) => {
    const id = nodes.length;
    nodes.push({ lat, lng, tramoId, codigo, isEndpoint });
    adj.push([]);
    return id;
  };

  const addEdge = (u, v, distKm, kind, tramoId, codigo) => {
    adj[u].push({ to: v, distKm, kind, tramoId, codigo });
    adj[v].push({ to: u, distKm, kind, tramoId, codigo });
    edgeCount += 2;
  };

  // 1. Densify ciclovía polylines every ~100m so trips can enter/exit at any block
  for (const [idStr, rt] of Object.entries(routesById)) {
    const tid = Number(idStr);
    const rec = recordsById.get(tid);
    if (!rec || !rt.coords || rt.coords.length < 2) continue;

    const pts = [rt.coords[0]];
    for (let i = 1; i < rt.coords.length; i++) {
      const a = rt.coords[i - 1];
      const b = rt.coords[i];
      const d = haversineKm(a, b);
      if (d > 0.11) {
        const steps = Math.ceil(d / 0.10);
        for (let k = 1; k < steps; k++) {
          const t = k / steps;
          pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        }
      }
      pts.push(b);
    }

    let prev = -1;
    for (let i = 0; i < pts.length; i++) {
      const nid = addNode(pts[i][0], pts[i][1], tid, rec.codigo, i === 0 || i === pts.length - 1);
      if (prev !== -1) {
        addEdge(prev, nid, haversineKm(pts[i - 1], pts[i]), 'ciclovia', tid, rec.codigo);
      }
      prev = nid;
    }
  }

  // 2. Direct junction edges (<= 75m) via spatial grid
  const CELL = 0.002;
  const grid = new Map();
  for (let i = 0; i < nodes.length; i++) {
    const k = `${Math.floor(nodes[i].lat / CELL)},${Math.floor(nodes[i].lng / CELL)}`;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  }

  for (let i = 0; i < nodes.length; i++) {
    const ni = nodes[i];
    const cx = Math.floor(ni.lat / CELL);
    const cy = Math.floor(ni.lng / CELL);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = grid.get(`${cx + dx},${cy + dy}`);
        if (!bucket) continue;
        for (const j of bucket) {
          if (j <= i || nodes[j].tramoId === ni.tramoId) continue;
          const d = haversineKm([ni.lat, ni.lng], [nodes[j].lat, nodes[j].lng]);
          if (d <= 0.075) {
            addEdge(i, j, d, 'junction', 0, '');
          }
        }
      }
    }
  }

  // 3. Keypoint transfer bridges (75m < d <= 1.6km, top-8 nearest per keypoint)
  const keypoints = [];
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].isEndpoint || i % 3 === 0) keypoints.push(i);
  }

  for (let a = 0; a < keypoints.length; a++) {
    const i = keypoints[a];
    const ni = nodes[i];
    const near = [];
    for (let b = a + 1; b < keypoints.length; b++) {
      const j = keypoints[b];
      const nj = nodes[j];
      if (ni.tramoId === nj.tramoId) continue;
      if (Math.abs(ni.lat - nj.lat) > 0.016 || Math.abs(ni.lng - nj.lng) > 0.016) continue;
      const d = haversineKm([ni.lat, ni.lng], [nj.lat, nj.lng]);
      if (d > 0.075 && d <= 1.6) {
        near.push({ j, d });
      }
    }
    near.sort((x, y) => x.d - y.d);
    for (const item of near.slice(0, 8)) {
      addEdge(i, item.j, item.d * 1.32, 'calle', 0, '');
    }
  }

  function describePoint(latLng) {
    let bestStreet = null;
    let bestStreetDist = 0.09;
    for (const n of nodes) {
      const d = haversineKm(latLng, [n.lat, n.lng]);
      if (d < bestStreetDist) {
        bestStreetDist = d;
        bestStreet = recordsById.get(n.tramoId);
      }
    }
    if (bestStreet) {
      return `${bestStreet.nombre.split(' - ')[0].trim()} (${bestStreet.distrito})`;
    }

    let bestDist = '';
    let minD = Infinity;
    for (const [dName, c] of Object.entries(districtCoords || {})) {
      const d = haversineKm(latLng, [c.lat, c.lng]);
      if (d < minD) {
        minD = d;
        bestDist = dName;
      }
    }
    return `${bestDist ? `${bestDist} · ` : ''}${latLng[0].toFixed(4)}, ${latLng[1].toFixed(4)}`;
  }

  function recomputeMetrics(legs) {
    let bikeKm = 0;
    let streetKm = 0;
    for (const l of legs) {
      if (l.kind === 'ciclovia') bikeKm += l.km;
      else streetKm += l.km;
    }
    const totalKm = bikeKm + streetKm;
    const bikePct = totalKm > 0 ? Math.round((bikeKm / totalKm) * 100) : 0;
    const estMinutes = Math.max(1, Math.round((bikeKm / 15 + streetKm / 12) * 60));
    return {
      totalKm: Number(totalKm.toFixed(2)),
      bikeKm: Number(bikeKm.toFixed(2)),
      streetKm: Number(streetKm.toFixed(2)),
      bikePct,
      estMinutes
    };
  }

  function runDijkstra(origPt, destPt, preference) {
    const bikeWeight = PREFERENCE_WEIGHTS[preference] ?? PREFERENCE_WEIGHTS.equilibrada;
    const N = nodes.length + 2;
    const SRC = nodes.length;
    const DST = nodes.length + 1;

    const srcEdges = [];
    const dstMap = new Map();
    const oCands = [];
    const dCands = [];

    for (let i = 0; i < nodes.length; i++) {
      const doKm = haversineKm(origPt, [nodes[i].lat, nodes[i].lng]);
      if (doKm <= 3.5) oCands.push({ i, d: doKm });
      const ddKm = haversineKm(destPt, [nodes[i].lat, nodes[i].lng]);
      if (ddKm <= 3.5) dCands.push({ i, d: ddKm });
    }
    oCands.sort((a, b) => a.d - b.d);
    dCands.sort((a, b) => a.d - b.d);

    for (const c of oCands.slice(0, 35)) {
      srcEdges.push({ to: c.i, distKm: c.d * 1.32, kind: 'calle', tramoId: 0, codigo: '' });
    }
    for (const c of dCands.slice(0, 35)) {
      dstMap.set(c.i, c.d * 1.32);
    }
    srcEdges.push({
      to: DST,
      distKm: haversineKm(origPt, destPt) * 1.32,
      kind: 'calle',
      tramoId: 0,
      codigo: ''
    });

    const dist = new Float64Array(N).fill(Infinity);
    const prev = new Int32Array(N).fill(-1);
    const prevKind = new Array(N).fill('');
    const prevTramo = new Int32Array(N).fill(0);
    const prevDist = new Float64Array(N).fill(0);
    const vis = new Uint8Array(N);

    dist[SRC] = 0;
    const heap = [[0, SRC]];
    const pushHeap = (item) => {
      heap.push(item);
      let c = heap.length - 1;
      while (c > 0) {
        const p = (c - 1) >> 1;
        if (heap[p][0] <= heap[c][0]) break;
        [heap[p], heap[c]] = [heap[c], heap[p]];
        c = p;
      }
    };
    const popHeap = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length > 0) {
        heap[0] = last;
        let i = 0;
        while (true) {
          let s = i;
          const l = 2 * i + 1;
          const r = 2 * i + 2;
          if (l < heap.length && heap[l][0] < heap[s][0]) s = l;
          if (r < heap.length && heap[r][0] < heap[s][0]) s = r;
          if (s === i) break;
          [heap[i], heap[s]] = [heap[s], heap[i]];
          i = s;
        }
      }
      return top;
    };

    while (heap.length > 0) {
      const [cost, u] = popHeap();
      if (vis[u]) continue;
      vis[u] = 1;
      if (u === DST) break;

      const edges = u === SRC ? srcEdges : adj[u];
      for (const e of edges) {
        const w =
          e.kind === 'ciclovia' ? e.distKm * bikeWeight : e.kind === 'junction' ? e.distKm * 0.5 : e.distKm;
        const nc = cost + w;
        if (nc < dist[e.to]) {
          dist[e.to] = nc;
          prev[e.to] = u;
          prevKind[e.to] = e.kind;
          prevTramo[e.to] = e.tramoId;
          prevDist[e.to] = e.distKm;
          pushHeap([nc, e.to]);
        }
      }

      if (dstMap.has(u)) {
        const dKm = dstMap.get(u);
        const nc = cost + dKm;
        if (nc < dist[DST]) {
          dist[DST] = nc;
          prev[DST] = u;
          prevKind[DST] = 'calle';
          prevTramo[DST] = 0;
          prevDist[DST] = dKm;
          pushHeap([nc, DST]);
        }
      }
    }

    if (!Number.isFinite(dist[DST])) return null;

    const steps = [];
    let cur = DST;
    while (cur !== SRC && cur !== -1) {
      const p = prev[cur];
      const getCoord = (idx) => {
        if (idx === SRC) return origPt;
        if (idx === DST) return destPt;
        return [nodes[idx].lat, nodes[idx].lng];
      };
      steps.push({
        from: p,
        to: cur,
        fromPt: getCoord(p),
        toPt: getCoord(cur),
        kind: prevKind[cur],
        tramoId: prevTramo[cur],
        distKm: prevDist[cur]
      });
      cur = p;
    }
    steps.reverse();

    const legs = [];
    for (const st of steps) {
      if (st.kind === 'ciclovia') {
        const rec = recordsById.get(st.tramoId);
        const code = rec ? rec.codigo : '';
        const lastLeg = legs[legs.length - 1];
        if (lastLeg && lastLeg.kind === 'ciclovia' && lastLeg.codigo === code) {
          lastLeg.coords.push(st.toPt);
          lastLeg.km += st.distKm;
          if (rec && !lastLeg.districts.includes(rec.distrito)) {
            lastLeg.districts.push(rec.distrito);
          }
          if (rec && !lastLeg.tramoIds.includes(rec.id)) {
            lastLeg.tramoIds.push(rec.id);
          }
        } else {
          legs.push({
            kind: 'ciclovia',
            codigo: code,
            nombre: rec ? rec.nombre.split(' - ')[0].trim() : 'Ciclovía',
            tipoVia: rec ? rec.tipoVia : 'METROPOLITANA',
            districts: rec ? [rec.distrito] : [],
            tramoIds: rec ? [rec.id] : [],
            coords: [st.fromPt, st.toPt],
            km: st.distKm
          });
        }
      } else {
        const isInternal = st.from < nodes.length && st.to < nodes.length;
        const lastLeg = legs[legs.length - 1];
        if (lastLeg && lastLeg.kind === 'calle') {
          lastLeg.coords.push(st.toPt);
          lastLeg.endPt = st.toPt;
          lastLeg.km += st.distKm;
          lastLeg.estKm += st.distKm;
          if (isInternal) {
            lastLeg.bridgePairs.push({ u: st.from, v: st.to, estKm: st.distKm });
          }
        } else {
          legs.push({
            kind: 'calle',
            codigo: '',
            nombre: 'Enlace por calle',
            tipoVia: 'CALLE',
            districts: [],
            tramoIds: [],
            startPt: st.fromPt,
            endPt: st.toPt,
            bridgePairs: isInternal ? [{ u: st.from, v: st.to, estKm: st.distKm }] : [],
            coords: [st.fromPt, st.toPt],
            km: st.distKm,
            estKm: st.distKm
          });
        }
      }
    }

    const filtered = legs.filter((l) => l.kind === 'ciclovia' || l.km >= 0.025);
    return filtered.length ? filtered : legs;
  }

  async function fetchStreetConnector(p1, p2) {
    const key = `${p1[0].toFixed(5)},${p1[1].toFixed(5)}->${p2[0].toFixed(5)},${p2[1].toFixed(5)}`;
    if (streetRouteCache.has(key)) return streetRouteCache.get(key);

    const endpoints = [
      `https://routing.openstreetmap.de/routed-bike/route/v1/driving/${p1[1]},${p1[0]};${p2[1]},${p2[0]}?overview=full&geometries=geojson`,
      `https://router.project-osrm.org/route/v1/driving/${p1[1]},${p1[0]};${p2[1]},${p2[0]}?overview=full&geometries=geojson`
    ];

    for (const url of endpoints) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 5000);
        const res = await fetch(url, {
          signal: ctrl.signal,
          headers: { 'User-Agent': 'BikeMapsLima/1.0' }
        });
        clearTimeout(t);
        if (!res.ok) continue;
        const j = await res.json();
        const route = j.routes && j.routes[0];
        if (route && route.geometry?.coordinates?.length >= 2) {
          const coords = route.geometry.coordinates.map(([lng, lat]) => [
            Number(lat.toFixed(5)),
            Number(lng.toFixed(5))
          ]);
          const km = (route.distance || 0) / 1000;
          const result = { coords, km };
          streetRouteCache.set(key, result);
          return result;
        }
      } catch {
        // try fallback
      }
    }
    return null;
  }

  async function computeRoute({ origin, destination, preference = 'equilibrada', snapStreets = true }) {
    const oLat = Number(origin?.lat);
    const oLng = Number(origin?.lng);
    const dLat = Number(destination?.lat);
    const dLng = Number(destination?.lng);

    if (!isWithinLimaBounds(oLat, oLng) || !isWithinLimaBounds(dLat, dLng)) {
      const err = new Error('Las coordenadas de origen y destino deben estar dentro de Lima Metropolitana.');
      err.statusCode = 400;
      throw err;
    }

    const pref = preference in PREFERENCE_WEIGHTS ? preference : 'equilibrada';
    const origPt = [Number(oLat.toFixed(5)), Number(oLng.toFixed(5))];
    const destPt = [Number(dLat.toFixed(5)), Number(dLng.toFixed(5))];

    let legs = runDijkstra(origPt, destPt, pref);
    if (!legs) {
      const err = new Error('No se pudo calcular una ruta entre los puntos indicados.');
      err.statusCode = 422;
      throw err;
    }

    if (snapStreets) {
      const streetLegs = legs.filter((l) => l.kind === 'calle' && l.km > 0.04);
      let barrierUpdated = false;

      await Promise.all(
        streetLegs.map(async (leg) => {
          const snapped = await fetchStreetConnector(leg.startPt, leg.endPt);
          if (!snapped) return;

          if (
            leg.bridgePairs &&
            leg.bridgePairs.length === 1 &&
            snapped.km > Math.max(leg.estKm * 2.8, leg.estKm + 1.0)
          ) {
            const { u, v } = leg.bridgePairs[0];
            if (adj[u] && adj[v]) {
              const e1 = adj[u].find((e) => e.to === v && e.kind === 'calle');
              const e2 = adj[v].find((e) => e.to === u && e.kind === 'calle');
              if (e1) e1.distKm = snapped.km;
              if (e2) e2.distKm = snapped.km;
              barrierUpdated = true;
            }
          }

          leg.coords = snapped.coords;
          leg.km = snapped.km;
        })
      );

      if (barrierUpdated) {
        const retried = runDijkstra(origPt, destPt, pref);
        if (retried) {
          legs = retried;
          const retryStreetLegs = legs.filter((l) => l.kind === 'calle' && l.km > 0.04);
          await Promise.all(
            retryStreetLegs.map(async (leg) => {
              const snapped = await fetchStreetConnector(leg.startPt, leg.endPt);
              if (snapped) {
                leg.coords = snapped.coords;
                leg.km = snapped.km;
              }
            })
          );
        }
      }
    }

    const cleanLegs = legs.map((l) => ({
      kind: l.kind,
      codigo: l.codigo,
      nombre: l.nombre,
      tipoVia: l.tipoVia,
      districts: l.districts,
      tramoIds: l.tramoIds,
      km: Number(l.km.toFixed(2)),
      coords: l.coords
    }));

    const metrics = recomputeMetrics(cleanLegs);

    return {
      origin: {
        lat: origPt[0],
        lng: origPt[1],
        label: String(origin?.label || '').trim() || describePoint(origPt)
      },
      destination: {
        lat: destPt[0],
        lng: destPt[1],
        label: String(destination?.label || '').trim() || describePoint(destPt)
      },
      preference: pref,
      ...metrics,
      legs: cleanLegs
    };
  }

  return {
    computeRoute,
    getStats: () => ({
      tramos: records.length,
      mapped: Object.keys(routesById).length,
      graphNodes: nodes.length,
      graphEdges: edgeCount,
      junctions: graph?.junctionNodes?.length || 0,
      components: graph?.components?.length || 0,
      stats
    })
  };
}
