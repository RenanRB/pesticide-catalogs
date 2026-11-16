// node fr/build.mjs [<folder with the unzipped *_utf8.csv files>]
// Downloads the newest E-Phy CSV zip (resolved through the data.gouv.fr API: its name changes
// every week) and writes data/fr/ only when the product list changed.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { records } from '../lib/csv.mjs';
import { get, publish } from '../lib/publish.mjs';
import { unzip } from '../lib/zip.mjs';
import { DATASET_API, createCatalog, latestZip } from './catalog.mjs';

const MIN_PRODUCTS = 1500;
const SOURCE = { name: 'ANSES, E-Phy (data.gouv.fr)', url: 'https://www.data.gouv.fr/datasets/575e9fac88ee38072a640390', license: 'Licence Ouverte / Open Licence (Etalab)' };
const FILES = { products: 'produits_utf8.csv', usages: 'produits_usages_utf8.csv', hazards: 'produits_classe_et_mention_danger_utf8.csv', permits: 'permis_de_commerce_parallele_utf8.csv' };

async function texts(folder) {
  if (folder) return Object.fromEntries(await Promise.all(Object.entries(FILES).map(async ([k, f]) => [k, await readFile(path.join(folder, f), 'utf8')])));
  const url = latestZip(await (await get(DATASET_API)).json());
  if (!url) throw new Error('E-Phy: no UTF-8 CSV zip in the dataset');
  const entries = unzip(Buffer.from(await (await get(url)).arrayBuffer()));
  const out = {};
  for (const [key, name] of Object.entries(FILES)) {
    const entry = entries.find((e) => path.basename(e.name) === name);
    if (!entry) throw new Error(`E-Phy: ${name} missing from ${url}`);
    out[key] = entry.data.toString('utf8');
  }
  return out;
}

const raw = await texts(process.argv[2]);
const files = Object.fromEntries(Object.entries(raw).map(([k, text]) => [k, records(text)]));
const list = JSON.parse(await readFile(new URL('./drone-amm.json', import.meta.url), 'utf8'));
const drone = new Set([...list.amm, ...list.pcp]);
const today = new Date().toISOString().slice(0, 10);
await publish('fr', SOURCE, createCatalog(files, today, drone), MIN_PRODUCTS);
