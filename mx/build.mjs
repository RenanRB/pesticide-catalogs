// node mx/build.mjs [<folder>]
// Pages through COFEPRIS's registry (≈590 pages of 20, one request at a time with a pause)
// and writes data/mx/ only when the product list changed. With a folder, every page is kept
// there as page-<offset>.html and a page already there is not downloaded again: a run that
// stopped halfway resumes where it was, and a folder of saved pages rebuilds offline.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { publish } from '../lib/publish.mjs';
import { PAGE_SIZE, SEARCH_PAGE, createCatalog, pageUrl, parsePage } from './catalog.mjs';

const MIN_PRODUCTS = 4000;
/** Every page must answer; fewer rows than the registry's own total means a broken run. */
const MAX_MISSING_ROWS = 40;
const PAUSE_MS = Number(process.env.MX_PAUSE_MS ?? 1000);
const SOURCE = {
  name: 'COFEPRIS, Consulta de Registros Sanitarios de Plaguicidas, Nutrientes Vegetales y LMR (siipris03)',
  url: SEARCH_PAGE,
  license: 'Public information of the Government of Mexico (no open-data licence stated)',
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** One page takes 3–20 s; a request the server never answers must not hang the run. */
const REQUEST_TIMEOUT_MS = 90000;
/** The server stalls now and then for minutes; a page is tried this many times, 15 s × n apart. */
const MAX_ATTEMPTS = 6;

/** lib/publish.mjs get() with the same User-Agent, plus a timeout (that one has none). */
async function get(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'pesticide-catalogs (github.com/RenanRB/pesticide-catalogs)' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res;
}

async function download(offset) {
  for (let attempt = 1; ; attempt++) {
    try {
      const html = new TextDecoder('utf-8', { fatal: true }).decode(await (await get(pageUrl(offset))).arrayBuffer());
      parsePage(html);
      return html;
    } catch (error) {
      if (attempt >= MAX_ATTEMPTS) throw error;
      console.warn(`offset ${offset}: ${error.message}; retry ${attempt}`);
      await sleep(15000 * attempt);
    }
  }
}

async function page(folder, offset) {
  const file = folder && join(folder, `page-${offset}.html`);
  if (file) {
    try {
      return { html: await readFile(file, 'utf8'), cached: true };
    } catch {}
  }
  const html = await download(offset);
  if (file) await writeFile(file, html);
  return { html, cached: false };
}

const folder = process.argv[2];
if (folder) await mkdir(folder, { recursive: true });
const started = Date.now();
let requests = 0;
const rows = [];
let total = Infinity;
for (let offset = 0; offset < total; offset += PAGE_SIZE) {
  const { html, cached } = await page(folder, offset);
  const parsed = parsePage(html);
  total = Math.min(total === Infinity ? parsed.total : total, parsed.total);
  rows.push(...parsed.rows);
  if (!cached) {
    requests++;
    if (requests % 25 === 0) console.log(`${offset + PAGE_SIZE}/${total} rows, ${requests} requests, ${Math.round((Date.now() - started) / 1000)} s`);
    await sleep(PAUSE_MS);
  }
}
const unique = new Set(rows.map((r) => r.registro)).size;
console.log(`${rows.length} rows (${unique} distinct numbers) of ${total}, ${requests} requests in ${Math.round((Date.now() - started) / 1000)} s`);
if (rows.length < total - MAX_MISSING_ROWS) throw new Error(`only ${rows.length} of ${total} rows: keeping the published list`);

const today = new Date().toISOString().slice(0, 10);
await publish('mx', SOURCE, createCatalog(rows, today), MIN_PRODUCTS);
