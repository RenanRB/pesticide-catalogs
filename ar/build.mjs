// node ar/build.mjs [<folder with saved answers>] [--save <folder>]
// Reads SENASA's Vademecum page by page (one request at a time, with a pause: it is a public
// service, not a data dump) and the provincial distance dataset, then writes data/ar/ only when
// something changed. A folder argument replays answers saved earlier with --save, offline.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { records } from '../lib/csv.mjs';
import { get, publish } from '../lib/publish.mjs';
import { APTITUDES_URL, allRows, aptitudes, aptitudeUrl, createCatalog, functionsById, page, productsUrl } from './catalog.mjs';
import { CLASSES, DATASET_API, DATASET_PAGE, createDistances, csvResource } from './distances.mjs';

const MIN_PRODUCTS = 6000;
const PAUSE_MS = 3000;
const SOURCE = {
  name: 'SENASA, Registro Nacional de Terapéutica Vegetal (Vademecum, aps2.senasa.gov.ar/vademecum)',
  url: 'https://aps2.senasa.gov.ar/vademecum/app/publico',
  license: 'Public SENASA registry; no licence stated on the Vademecum. Drone list: CC BY 4.0 (argentina.gob.ar)',
};

const args = process.argv.slice(2);
const saveAt = args.includes('--save') ? args[args.indexOf('--save') + 1] : null;
const replay = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--save') ?? null;

let requests = 0;
const started = Date.now();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** One answer, live (polite: sequential, paused) or from the replay folder. */
async function fetchText(name, url) {
  if (replay) return readFile(path.join(replay, name), 'utf8');
  if (requests > 0) await sleep(PAUSE_MS);
  requests++;
  const text = await (await get(url)).text();
  if (saveAt) {
    await mkdir(saveAt, { recursive: true });
    await writeFile(path.join(saveAt, name), text);
  }
  return text;
}

/** Every page of a paged search. */
async function pages(prefix, urlOf) {
  const first = JSON.parse(await fetchText(`${prefix}-0.json`, urlOf(0)));
  const list = [first];
  for (let p = 1; p < page(first).totalPages; p++) list.push(JSON.parse(await fetchText(`${prefix}-${p}.json`, urlOf(p))));
  return list;
}

/** data/ar/distances.json, written only when its content changed (no build timestamp inside). */
async function writeDistances() {
  const resource = csvResource(JSON.parse(await fetchText('package.json', DATASET_API)));
  if (!resource) throw new Error('distances: no regulacion_provincial_fitosanitarios.csv in the dataset');
  const provinces = createDistances(records(await fetchText('distances.csv', resource.url)));
  if (provinces.length < 20) throw new Error(`distances: only ${provinces.length} provinces`);
  const body =
    JSON.stringify(
      {
        version: 1,
        source: {
          name: 'Secretaría de Agricultura, Ganadería y Pesca, Regulaciones sobre aplicación de fitosanitarios (datos.gob.ar)',
          url: DATASET_PAGE,
          file: resource.url,
          license: 'Creative Commons Attribution 4.0 (CC BY 4.0)',
          modified: resource.modified,
        },
        note: 'Minimum distance in metres from towns (centros urbanos) set by each province\'s base law, per toxicological class. rule: distance | none (no distance set) | banned | no_law. m[class]: metres, 0 = no restriction, null = not stated. Municipal ordinances and newer drone rules can be stricter.',
        classes: CLASSES,
        provinces,
      },
      null,
      1
    ) + '\n';
  const file = new URL('../data/ar/distances.json', import.meta.url);
  const old = await readFile(file, 'utf8').catch(() => null);
  if (old === body) return console.log(`[ar] distances unchanged (${provinces.length} provinces)`);
  await mkdir(new URL('./', file), { recursive: true });
  await writeFile(file, body);
  console.log(`[ar] distances written (${provinces.length} provinces)`);
}

await writeDistances();

const rows = allRows(await pages('products', productsUrl));
const byFunction = [];
for (const { id, name } of aptitudes(JSON.parse(await fetchText('aptitudes.json', APTITUDES_URL)))) {
  byFunction.push({ name, rows: allRows(await pages(`aptitude-${id}`, (p) => aptitudeUrl(id, p))) });
}
const vant = JSON.parse(await readFile(new URL('./drone-vant.json', import.meta.url), 'utf8'));
const catalog = createCatalog(rows, functionsById(byFunction), new Set(vant.registrations));
const missingVant = vant.registrations.filter((r) => !catalog.some((e) => e.r === r));
if (missingVant.length) console.warn(`[ar] VANT registrations not in the list: ${missingVant.join(', ')}`);
await publish('ar', SOURCE, catalog, MIN_PRODUCTS);
console.log(`[ar] ${catalog.length} products, ${catalog.filter((e) => !e.c).length} without a function, ${requests} requests in ${Math.round((Date.now() - started) / 1000)} s`);
