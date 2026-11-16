// node us/build.mjs [<folder with the unzipped .txt files>]
// Downloads the EPA PPIS files and writes data/us/ (one entry per active agricultural
// registration) only when the product list changed.
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { get, publish } from '../lib/publish.mjs';
import { unzip } from '../lib/zip.mjs';
import { BASE_URL, FILES, createCatalog } from './catalog.mjs';

const MIN_PRODUCTS = 3000;
const SOURCE = { name: 'U.S. EPA Pesticide Product Information System (PPIS)', url: 'https://www.epa.gov/pesticides/PPISdata', license: 'U.S. Government work (EPA open data)' };

/** The files are ASCII; latin1 keeps any stray byte instead of failing. */
function lines(buffer) {
  return buffer.toString('latin1').split(/\r?\n/).filter((l) => l.trim());
}

async function download(name) {
  const res = await get(`${BASE_URL}${name}.zip`);
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

const folder = process.argv[2];
const files = {};
for (const name of FILES) files[name] = lines(folder ? await local(folder, name) : await download(name));

await publish('us', SOURCE, createCatalog(files), MIN_PRODUCTS);
