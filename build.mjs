// node build.mjs [<folder with the unzipped .txt files>]
// Downloads the EPA PPIS files and writes, only when the product list changed:
//   data/products.json  one entry per active agricultural registration (what the app downloads)
//   data/manifest.json  a few bytes the app checks on start: updatedAt, product count, sha256 of products.json
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { BASE_URL, FILES, createCatalog } from './catalog.mjs';
import { unzip } from './zip.mjs';

const PRODUCTS = new URL('./data/products.json', import.meta.url);
const MANIFEST = new URL('./data/manifest.json', import.meta.url);
const MIN_PRODUCTS = 3000;
const SOURCE = { name: 'U.S. EPA Pesticide Product Information System (PPIS)', url: 'https://www.epa.gov/pesticides/PPISdata', license: 'U.S. Government work (EPA open data)' };

/** The files are ASCII; latin1 keeps any stray byte instead of failing. */
function lines(buffer) {
  return buffer.toString('latin1').split(/\r?\n/).filter((l) => l.trim());
}

async function download(name) {
  const res = await fetch(`${BASE_URL}${name}.zip`, { headers: { 'User-Agent': 'epa-catalog (github.com/RenanRB/epa-catalog)' } });
  if (!res.ok) throw new Error(`${name}.zip: HTTP ${res.status}`);
  const entries = unzip(Buffer.from(await res.arrayBuffer())).filter((f) => /\.txt$/i.test(f.name));
  if (entries.length !== 1) throw new Error(`${name}.zip: expected one .txt file, found ${entries.length}`);
  return entries[0].data;
}

async function local(folder, name) {
  const all = await readdir(folder, { recursive: true });
  const match = all.find((f) => path.basename(f).toLowerCase() === `${name}.txt`);
  if (!match) throw new Error(`${name}.txt not found under ${folder}`);
  return readFile(path.join(folder, match));
}

async function previous() {
  try {
    return JSON.parse(await readFile(PRODUCTS, 'utf8'));
  } catch {
    return null;
  }
}

const folder = process.argv[2];
const files = {};
for (const name of FILES) files[name] = lines(folder ? await local(folder, name) : await download(name));

const products = createCatalog(files);
if (products.length < MIN_PRODUCTS) throw new Error(`Only ${products.length} active agricultural products: keeping the published list`);

const old = await previous();
if (old && JSON.stringify(old.products) === JSON.stringify(products)) {
  console.log(`[epa] unchanged (${products.length} products), nothing written`);
  process.exit(0);
}

const updatedAt = new Date().toISOString();
const body = JSON.stringify({ version: 1, source: { ...SOURCE, updatedAt }, products }) + '\n';
const sha256 = createHash('sha256').update(body).digest('hex');
await writeFile(PRODUCTS, body);
await writeFile(MANIFEST, JSON.stringify({ version: 1, updatedAt, products: products.length, sha256, file: 'products.json' }, null, 2) + '\n');
console.log(`[epa] ${old ? old.products.length : 0} → ${products.length} products (${products.filter((p) => p.u).length} restricted use), updatedAt ${updatedAt}`);
