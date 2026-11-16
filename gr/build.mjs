// node gr/build.mjs [<dbSYSPEST.zip or the .mdb inside it>]
// Downloads the ministry's dbSYSPEST database from the 1Click portal, exports the tables it
// needs with mdb-export (mdbtools: `brew install mdbtools`, `sudo apt-get install mdbtools`)
// and writes data/gr/ only when the product list changed.
//
// The portal is a ZK application: the zip has no fixed URL. A plain HTTP replay of the click
// works without a browser: load the page (session cookie + desktop id), post the "onClick" AU
// event of the "εδώ" link to /zkau, and download the one-time path the answer names.
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { records } from '../lib/csv.mjs';
import { publish } from '../lib/publish.mjs';
import { unzip } from '../lib/zip.mjs';
import { PORTAL, TABLES, createCatalog, downloadPath, downloadWidget } from './catalog.mjs';

const MIN_PRODUCTS = 1500;
const MIN_ZIP_BYTES = 20e6;
const SOURCE = {
  name: 'ΥΠΑΑΤ (Hellenic Ministry of Rural Development and Food), plant protection products database dbSYSPEST (1click.minagric.gr)',
  url: PORTAL,
  license: 'No licence found on the portal or in the download; the ministry site says "Με την επιφύλαξη παντός δικαιώματος" (all rights reserved)',
};
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64)', 'Accept-Language': 'el,en;q=0.8' };

async function fetchOk(url, init = {}) {
  const res = await fetch(url, { ...init, headers: { ...HEADERS, ...init.headers }, signal: AbortSignal.timeout(300_000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res;
}

async function download() {
  const page = await fetchOk(PORTAL);
  const cookie = page.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const widget = downloadWidget(await page.text());
  if (!cookie || !widget) throw new Error('dbSYSPEST: the portal page has no session or no download link (layout changed?)');
  const origin = new URL(PORTAL).origin;
  const au = await fetchOk(`${origin}/oneClickUI/zkau`, {
    method: 'POST',
    headers: { Cookie: cookie, 'ZK-SID': '1', 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', Referer: PORTAL },
    body: new URLSearchParams({ dtid: widget.dtid, cmd_0: 'onClick', uuid_0: widget.uuid, data_0: JSON.stringify({ pageX: 1, pageY: 1, which: 1, x: 1, y: 1 }) }),
  });
  const link = downloadPath(await au.json());
  if (!link) throw new Error('dbSYSPEST: the click did not answer with a download');
  const zip = Buffer.from(await (await fetchOk(origin + link, { headers: { Cookie: cookie } })).arrayBuffer());
  if (zip.length < MIN_ZIP_BYTES || zip.readUInt32LE(0) !== 0x04034b50) throw new Error(`dbSYSPEST: ${zip.length} bytes, not the database zip`);
  console.log(`[gr] downloaded ${zip.length} bytes from ${link}`);
  return zip;
}

/** The .mdb on disk: the argument itself, or extracted from the zip (its other names are not UTF-8). */
async function mdbFile(input, dir) {
  if (input && /\.mdb$/i.test(input)) return input;
  const zip = input ? await readFile(input) : await download();
  const entry = unzip(zip).find((e) => /\.mdb$/i.test(e.name));
  if (!entry) throw new Error('dbSYSPEST: no .mdb in the zip');
  const file = path.join(dir, 'dbSYSPEST.mdb');
  await writeFile(file, entry.data);
  return file;
}

function exportTable(mdb, table) {
  const csv = execFileSync('mdb-export', ['-D', '%Y-%m-%d', '-T', '%Y-%m-%d', mdb, table], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, MDBICONV: 'UTF-8' },
  });
  return records(csv, ',');
}

const dir = await mkdtemp(path.join(tmpdir(), 'dbsyspest-'));
try {
  const mdb = await mdbFile(process.argv[2], dir);
  const tables = Object.fromEntries(Object.entries(TABLES).map(([key, table]) => [key, exportTable(mdb, table)]));
  const today = new Date().toISOString().slice(0, 10);
  await publish('gr', SOURCE, createCatalog(tables, today), MIN_PRODUCTS);
} finally {
  await rm(dir, { recursive: true, force: true });
}
