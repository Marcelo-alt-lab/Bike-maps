import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { geocodeLima } from './geocoder.js';
import { createRoutingEngine } from './routing-engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function loadData() {
  const ciclovias = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'data', 'ciclovias.json'), 'utf8'));
  const geometries = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'data', 'geometries.json'), 'utf8'));
  return { ciclovias, geometries };
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(body);
}

function readJsonBody(req, maxBytes = 1024 * 1024) {
  if (req.body !== undefined) {
    if (typeof req.body === 'object' && req.body !== null) {
      return Promise.resolve(req.body);
    }
    if (typeof req.body === 'string') {
      if (!req.body.trim()) return Promise.resolve({});
      try {
        return Promise.resolve(JSON.parse(req.body));
      } catch {
        const err = new Error('JSON inválido en el cuerpo de la petición.');
        err.statusCode = 400;
        return Promise.reject(err);
      }
    }
  }
  return new Promise((resolve, reject) => {
    let raw = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        const err = new Error('Payload demasiado grande.');
        err.statusCode = 413;
        reject(err);
        req.destroy();
        return;
      }
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        const err = new Error('JSON inválido en el cuerpo de la petición.');
        err.statusCode = 400;
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function buildCorridors(records) {
  const byCode = new Map();
  for (const r of records) {
    if (!byCode.has(r.codigo)) byCode.set(r.codigo, []);
    byCode.get(r.codigo).push(r);
  }
  return Array.from(byCode.entries())
    .filter(([, segs]) => segs.length >= 2)
    .map(([codigo, segs]) => ({
      codigo,
      codigoNum: segs[0].codigoNum,
      nombre: segs[0].nombre.split(' - ')[0].trim(),
      totalKm: Number(segs.reduce((s, x) => s + x.longitudKm, 0).toFixed(2)),
      tramosCount: segs.length,
      districts: Array.from(new Set(segs.map((x) => x.distrito))),
      tramoIds: segs.map((x) => x.id)
    }))
    .sort((a, b) => a.codigoNum - b.codigoNum);
}

/**
 * Create the BikeMaps HTTP request handler (shared by local Node server and Vercel Functions).
 */
export function createRequestHandler() {
  const { ciclovias, geometries } = loadData();
  const engine = createRoutingEngine({
    records: ciclovias.records,
    districtCoords: ciclovias.districtCoords,
    routesById: geometries.routesById,
    graph: geometries.graph,
    stats: geometries.stats
  });
  const corridors = buildCorridors(ciclovias.records);

  return async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      res.end();
      return;
    }

    const urlObj = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const rewrittenPath = urlObj.searchParams.get('__path');
    const rawPath = rewrittenPath
      ? (rewrittenPath.startsWith('/') ? rewrittenPath : `/${rewrittenPath}`)
      : urlObj.pathname;
    const pathname = rawPath.length > 1 ? rawPath.replace(/\/+$/, '') : rawPath;

    try {
      if (req.method === 'GET' && (pathname === '/' || pathname === '/api/health')) {
        sendJson(res, 200, {
          ok: true,
          service: 'bikemaps-backend',
          ...engine.getStats()
        });
        return;
      }

      if (req.method === 'GET' && pathname === '/api/ciclovias') {
        const distrito = (urlObj.searchParams.get('distrito') || '').trim().toUpperCase();
        const tipoVia = (urlObj.searchParams.get('tipoVia') || '').trim().toUpperCase();
        const q = normalizeText(urlObj.searchParams.get('q') || '');

        const filtered = ciclovias.records.filter((r) => {
          if (distrito && r.distrito !== distrito) return false;
          if (tipoVia && tipoVia !== 'ALL' && r.tipoVia !== tipoVia) return false;
          if (q) {
            const hay = normalizeText(`${r.codigo} ${r.nombre} ${r.tramo} ${r.distrito} ${r.tipoVia}`);
            if (!hay.includes(q)) return false;
          }
          return true;
        });

        sendJson(res, 200, {
          total: filtered.length,
          records: filtered,
          metadata: ciclovias.metadata,
          dataDictionary: ciclovias.dataDictionary,
          districtCoords: ciclovias.districtCoords
        });
        return;
      }

      if (req.method === 'GET' && pathname === '/api/geometries') {
        sendJson(res, 200, geometries);
        return;
      }

      if (req.method === 'GET' && pathname === '/api/corridors') {
        sendJson(res, 200, {
          total: corridors.length,
          corridors
        });
        return;
      }

      if (req.method === 'GET' && pathname === '/api/geocode') {
        const q = urlObj.searchParams.get('q') || '';
        if (!q.trim()) {
          sendJson(res, 400, { error: 'Parámetro "q" requerido.' });
          return;
        }
        const results = await geocodeLima(q);
        sendJson(res, 200, { query: q.trim(), results });
        return;
      }

      if (req.method === 'GET' && pathname === '/api/route') {
        const origin = {
          lat: Number(urlObj.searchParams.get('originLat')),
          lng: Number(urlObj.searchParams.get('originLng')),
          label: urlObj.searchParams.get('originLabel') || ''
        };
        const destination = {
          lat: Number(urlObj.searchParams.get('destLat')),
          lng: Number(urlObj.searchParams.get('destLng')),
          label: urlObj.searchParams.get('destLabel') || ''
        };
        const preference = urlObj.searchParams.get('preference') || 'equilibrada';
        const snapStreets = urlObj.searchParams.get('snapStreets') !== 'false';
        const route = await engine.computeRoute({ origin, destination, preference, snapStreets });
        sendJson(res, 200, route);
        return;
      }

      if (req.method === 'POST' && pathname === '/api/route') {
        const body = await readJsonBody(req);
        const route = await engine.computeRoute({
          origin: body.origin,
          destination: body.destination,
          preference: body.preference || 'equilibrada',
          snapStreets: body.snapStreets !== false
        });
        sendJson(res, 200, route);
        return;
      }

      sendJson(res, 404, { error: 'Ruta no encontrada.' });
    } catch (err) {
      const status = err.statusCode || 500;
      sendJson(res, status, { error: err.message || 'Error interno del servidor.' });
    }
  };
}

/**
 * Create the BikeMaps HTTP API server instance.
 */
export function createServer() {
  return http.createServer(createRequestHandler());
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const host = process.env.HOST || '0.0.0.0';
  const port = Number(process.env.PORT || 4000);
  const server = createServer();
  server.listen(port, host, () => {
    console.log(`BikeMaps Backend API escuchando en http://${host}:${port}`);
  });
}
