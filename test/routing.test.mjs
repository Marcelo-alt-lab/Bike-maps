import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createRoutingEngine } from '../src/routing-engine.js';
import { createServer } from '../src/server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

function loadFixtures() {
  const ciclovias = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'data', 'ciclovias.json'), 'utf8'));
  const geometries = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'data', 'geometries.json'), 'utf8'));
  return { ciclovias, geometries };
}

test('routing engine initializes full Lima ciclovía graph', () => {
  const { ciclovias, geometries } = loadFixtures();
  const engine = createRoutingEngine({
    records: ciclovias.records,
    districtCoords: ciclovias.districtCoords,
    routesById: geometries.routesById,
    graph: geometries.graph,
    stats: geometries.stats
  });

  const stats = engine.getStats();
  assert.equal(stats.tramos, 335);
  assert.equal(stats.mapped, 324);
  assert.ok(stats.graphNodes > 4000, `Expected >4000 nodes, got ${stats.graphNodes}`);
  assert.ok(stats.graphEdges > 10000, `Expected >10000 edges, got ${stats.graphEdges}`);
});

test('computes ciclovía-preferring route Paseo Colón -> Parque Kennedy via Av. Arequipa', async () => {
  const { ciclovias, geometries } = loadFixtures();
  const engine = createRoutingEngine({
    records: ciclovias.records,
    districtCoords: ciclovias.districtCoords,
    routesById: geometries.routesById,
    graph: geometries.graph,
    stats: geometries.stats
  });

  const route = await engine.computeRoute({
    origin: { lat: -12.0600, lng: -77.0375, label: 'Paseo Colón' },
    destination: { lat: -12.1215, lng: -77.0290, label: 'Parque Kennedy' },
    preference: 'equilibrada',
    snapStreets: false
  });

  assert.ok(route.bikePct >= 80, `Expected >=80% ciclovía, got ${route.bikePct}%`);
  assert.ok(route.legs.some((l) => l.kind === 'ciclovia' && l.codigo === 'C-14'));
  assert.ok(route.totalKm > 5 && route.totalKm < 10);
});

test('computes ciclovía-preferring route Campo de Marte -> Pentagonito', async () => {
  const { ciclovias, geometries } = loadFixtures();
  const engine = createRoutingEngine({
    records: ciclovias.records,
    districtCoords: ciclovias.districtCoords,
    routesById: geometries.routesById,
    graph: geometries.graph,
    stats: geometries.stats
  });

  const route = await engine.computeRoute({
    origin: { lat: -12.0685, lng: -77.0415, label: 'Campo de Marte' },
    destination: { lat: -12.1005, lng: -76.9940, label: 'Pentagonito' },
    preference: 'equilibrada',
    snapStreets: false
  });

  assert.ok(route.bikePct >= 80, `Expected >=80% ciclovía, got ${route.bikePct}%`);
  assert.ok(route.legs.length >= 2);
});

test('HTTP server exposes health, ciclovias, geometries, and route endpoints', async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());

  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  const healthRes = await fetch(`${base}/api/health`);
  assert.equal(healthRes.status, 200);
  const health = await healthRes.json();
  assert.equal(health.ok, true);
  assert.equal(health.tramos, 335);

  const sbRes = await fetch(`${base}/api/ciclovias?distrito=SAN%20BORJA`);
  assert.equal(sbRes.status, 200);
  const sb = await sbRes.json();
  assert.equal(sb.total, 33);

  const geomRes = await fetch(`${base}/api/geometries`);
  assert.equal(geomRes.status, 200);
  const geom = await geomRes.json();
  assert.equal(Object.keys(geom.routesById).length, 324);

  const routeRes = await fetch(`${base}/api/route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origin: { lat: -12.0600, lng: -77.0375 },
      destination: { lat: -12.1215, lng: -77.0290 },
      preference: 'maxima',
      snapStreets: false
    })
  });
  assert.equal(routeRes.status, 200);
  const route = await routeRes.json();
  assert.ok(route.totalKm > 0);
  assert.ok(route.legs.length >= 1);

  const badRes = await fetch(`${base}/api/route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ origin: {}, destination: {} })
  });
  assert.equal(badRes.status, 400);
});
