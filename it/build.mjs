// node it/build.mjs [<the PROD_FTS_6_*.csv file>]
// Downloads the newest CSV linked from the dataset page and writes data/it/ only when the
// product list changed.
import { readFile } from 'node:fs/promises';
import { records } from '../lib/csv.mjs';
import { get, publish } from '../lib/publish.mjs';
import { DATASET_PAGE, createCatalog, latestCsv } from './catalog.mjs';

const MIN_PRODUCTS = 2000;
const SOURCE = { name: 'Ministero della Salute, banca dati prodotti fitosanitari (dati.salute.gov.it)', url: DATASET_PAGE, license: 'Italian Open Data License v2.0' };

async function text(file) {
  if (file) return readFile(file, 'utf8');
  const url = latestCsv(await (await get(DATASET_PAGE)).text());
  if (!url) throw new Error('No PROD_FTS_6_*.csv link on the dataset page');
  return (await get(url)).text();
}

const today = new Date().toISOString().slice(0, 10);
await publish('it', SOURCE, createCatalog(records(await text(process.argv[2])), today), MIN_PRODUCTS);
