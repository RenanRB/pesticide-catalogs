// node de/build.mjs [<folder with <table>.json files saved from the API>]
// Downloads the BVL PSM-API tables the catalog needs (paged, one request at a time) and writes
// data/de/ only when the product list changed. The BVL updates the data monthly; the weekly
// run is cheap (a few MB) and simply finds nothing new most weeks.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { get, publish } from '../lib/publish.mjs';
import { API, TABLES, createCatalog, standDate } from './catalog.mjs';

const MIN_PRODUCTS = 3000;
const PAGE = 10000;
const SOURCE = {
  name: 'BVL (Bundesamt für Verbraucherschutz und Lebensmittelsicherheit), PSM-API (psm-api.bvl.bund.de)',
  url: API,
  license: 'No licence stated for the API; permission requested from the BVL (200@bvl.bund.de)',
};

async function table(name, folder) {
  if (folder) return JSON.parse(await readFile(path.join(folder, `${name}.json`), 'utf8'));
  const rows = [];
  for (let offset = 0; ; ) {
    const page = await (await get(`${API}${name}/?limit=${PAGE}&offset=${offset}`)).json();
    if (!Array.isArray(page?.items)) throw new Error(`BVL ${name}: unexpected answer`);
    rows.push(...page.items);
    if (!page.hasMore || !page.items.length) break;
    offset += page.items.length;
  }
  return rows;
}

const folder = process.argv[2];
const tables = {};
for (const name of TABLES) tables[name] = await table(name, folder);
console.log(`[de] BVL data of ${standDate(tables.stand)}`);
const list = JSON.parse(await readFile(new URL('./drone-kennr.json', import.meta.url), 'utf8'));
const today = new Date().toISOString().slice(0, 10);
await publish('de', SOURCE, createCatalog(tables, today, new Set(list.kennr)), MIN_PRODUCTS);
