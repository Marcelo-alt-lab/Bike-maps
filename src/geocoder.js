const LIMA_BOUNDS = {
  minLat: -12.55,
  maxLat: -11.70,
  minLng: -77.25,
  maxLng: -76.60
};

const geocodeCache = new Map();

export function isWithinLimaBounds(lat, lng) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= LIMA_BOUNDS.minLat &&
    lat <= LIMA_BOUNDS.maxLat &&
    lng >= LIMA_BOUNDS.minLng &&
    lng <= LIMA_BOUNDS.maxLng
  );
}

/**
 * Geocode a place, street, or intersection inside Lima Metropolitana.
 * Uses ArcGIS World Geocoder with Photon fallback and in-memory caching.
 */
export async function geocodeLima(queryText) {
  const q = String(queryText || '').trim();
  if (!q) return [];

  const cacheKey = q.toLowerCase();
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey);
  }

  let results = [];
  try {
    const url =
      'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?' +
      new URLSearchParams({
        SingleLine: `${q}, Lima, Peru`,
        f: 'json',
        maxLocations: '5',
        location: '-77.03,-12.08',
        distance: '38000'
      }).toString();

    const res = await fetch(url);
    if (res.ok) {
      const json = await res.json();
      results = (json.candidates || [])
        .filter((c) => c.location && isWithinLimaBounds(c.location.y, c.location.x))
        .map((c) => ({
          label: c.address || q,
          lat: Number(c.location.y.toFixed(6)),
          lng: Number(c.location.x.toFixed(6)),
          score: Number(c.score || 0)
        }));
    }
  } catch {
    results = [];
  }

  if (results.length === 0) {
    try {
      const url =
        'https://photon.komoot.io/api/?' +
        new URLSearchParams({
          q: `${q}, Lima, Peru`,
          lat: '-12.08',
          lon: '-77.03',
          limit: '5'
        }).toString();

      const res = await fetch(url, {
        headers: { 'User-Agent': 'BikeMapsLima/1.0' }
      });
      if (res.ok) {
        const json = await res.json();
        results = (json.features || [])
          .filter(
            (f) =>
              f.geometry?.coordinates &&
              isWithinLimaBounds(f.geometry.coordinates[1], f.geometry.coordinates[0])
          )
          .map((f) => ({
            label: [f.properties?.name, f.properties?.district, f.properties?.city]
              .filter(Boolean)
              .join(', ') || q,
            lat: Number(f.geometry.coordinates[1].toFixed(6)),
            lng: Number(f.geometry.coordinates[0].toFixed(6)),
            score: 80
          }));
      }
    } catch {
      results = [];
    }
  }

  geocodeCache.set(cacheKey, results);
  return results;
}
