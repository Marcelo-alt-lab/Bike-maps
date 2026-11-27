import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');

const RAW_BASE =
  process.env.BIKEMAPS_DATA_BASE_URL ||
  'https://raw.githubusercontent.com/Marcelo-alt-lab/Bike-maps/main/data';

const REQUIRED_FILES = ['ciclovias.json', 'geometries.json'];

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(PUBLIC_DIR, { recursive: true });
fs.writeFileSync(path.join(PUBLIC_DIR, 'robots.txt'), 'User-agent: *\nAllow: /\n');

for (const name of REQUIRED_FILES) {
  const target = path.join(DATA_DIR, name);
  if (fs.existsSync(target) && fs.statSync(target).size > 0) {
    console.log(`[ensure-data] ${name} already present.`);
    continue;
  }
  const url = `${RAW_BASE}/${name}`;
  console.log(`[ensure-data] Fetching ${url} ...`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(target, buf);
  console.log(`[ensure-data] Saved ${name} (${buf.length} bytes).`);
}
