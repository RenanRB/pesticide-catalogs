// Writes data/<country>/products.json + manifest.json, only when the product list changed.
// The app reads the manifest (a few bytes) on start and downloads products.json by its SHA-256.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const ROOT = new URL('../data/', import.meta.url);

async function previous(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * @param {string} country folder under data/ ("us", "fr", "it")
 * @param {{name: string, url: string, license: string}} source credited in products.json
 * @param {object[]} products the catalog entries
 * @param {number} minProducts fewer than this = a broken source: fail and keep the published list
 */
export async function publish(country, source, products, minProducts) {
  if (products.length < minProducts) throw new Error(`[${country}] only ${products.length} products: keeping the published list`);
  const dir = new URL(`${country}/`, ROOT);
  const productsFile = new URL('products.json', dir);
  const old = await previous(productsFile);
  if (old && JSON.stringify(old.products) === JSON.stringify(products)) {
    console.log(`[${country}] unchanged (${products.length} products), nothing written`);
    return false;
  }
  const updatedAt = new Date().toISOString();
  const body = JSON.stringify({ version: 1, source: { ...source, updatedAt }, products }) + '\n';
  const sha256 = createHash('sha256').update(body).digest('hex');
  await mkdir(dir, { recursive: true });
  await writeFile(productsFile, body);
  await writeFile(new URL('manifest.json', dir), JSON.stringify({ version: 1, updatedAt, products: products.length, sha256, file: 'products.json' }, null, 2) + '\n');
  console.log(`[${country}] ${old ? old.products.length : 0} → ${products.length} products, updatedAt ${updatedAt}`);
  return true;
}

/** GET with a User-Agent naming the repository; throws on any non-2xx answer. */
export async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'pesticide-catalogs (github.com/RenanRB/pesticide-catalogs)' } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res;
}
