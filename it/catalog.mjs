// Turns the Italian Ministry of Health open data on plant protection products
// (dati.salute.gov.it, weekly) into the app's product catalog: one entry per product a
// professional may use in Italy today. Pure: every function takes the parsed CSV records.

/** Dataset page; the CSV's name carries its date (PROD_FTS_6_YYYYMMDD.csv). */
export const DATASET_PAGE = 'https://www.dati.salute.gov.it/it/dataset/fitosanitari';

/** No longer usable: revoked, expired, suspended. */
const GONE = new Set(['Revocato', 'Scaduto', 'Sospeso']);

/** The newest dated CSV linked from the dataset page. */
export function latestCsv(html) {
  const links = [...String(html).matchAll(/["'](https?:\/\/[^"']*?PROD_FTS_6_(\d{8})\.csv|\/[^"']*?PROD_FTS_6_(\d{8})\.csv)["']/g)].map((m) => ({
    url: m[1].startsWith('/') ? `https://www.dati.salute.gov.it${m[1]}` : m[1],
    date: m[2] ?? m[3],
  }));
  links.sort((a, b) => b.date.localeCompare(a.date));
  return links[0]?.url ?? null;
}

function dmy(text) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(text ?? '').trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

/**
 * Some names arrive encoded twice ("COÃ\u0096PERATIEF" for "COÖPERATIEF"): UTF-8 bytes read
 * as Latin-1 and encoded again. Undo it only when the result is clean UTF-8.
 */
export function repair(text) {
  if (!/[\u00c2\u00c3][\u0080-\u00bf]/.test(text)) return text;
  const fixed = Buffer.from(text, 'latin1').toString('utf8');
  return fixed.includes('\ufffd') ? text : fixed;
}

const dash = (text) => {
  const value = repair(String(text ?? '').trim());
  return value === '-' ? '' : value;
};

/** "MCPA|2,4-D" + "25.0 g|29.0 g" → "MCPA (25.0 g/100 g); 2,4-D (29.0 g/100 g)". */
export function substances(names, contents) {
  const list = dash(names).split('|').map((s) => s.trim());
  const amounts = dash(contents).split('|').map((s) => s.trim());
  return list
    .filter(Boolean)
    .map((name, i) => (amounts[i] ? `${name} (${amounts[i]}/100 g)` : name))
    .join('; ');
}

/** "INSETTICIDA-ACARICIDA" → "Insetticida / Acaricida". */
function activity(text) {
  return dash(text)
    .split('-')
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' / ');
}

/**
 * The catalog entries in the shared compact shape: r registration number, b product name,
 * f formulation, a active substances with content per 100 g, h holder, c activity. `t` and
 * `e` stay empty: the dataset still gives the pre-CLP classes (Xn, N…), not a signal word.
 * Products for non-professional use (PFnPO / PFnPE = "SI") are left out.
 *
 * @param {object[]} rows the CSV records
 * @param {string} today ISO date: an authorisation that expired before it is left out
 */
export function createCatalog(rows, today) {
  const byNumber = new Map();
  for (const p of rows) {
    const nr = p['num_registrazione'];
    if (!/^\d{1,6}$/.test(nr) || GONE.has(p['stato_amministrativo'])) continue;
    if (p['PFnPO'] === 'SI' || p['PFnPE'] === 'SI') continue;
    const expiry = dmy(p['data_scadenza_autorizzazione']);
    if (expiry && expiry < today) continue;
    byNumber.set(nr, {
      r: nr,
      b: [dash(p['denominazione_prodotto'])].filter(Boolean),
      f: dash(p['descrizione_formulazione']),
      a: substances(p['sostanze_attive'], p['contenuto_per_100g_di_prodotto']),
      h: dash(p['ragione_sociale']),
      c: activity(p['attivita']),
      t: '',
      e: '',
    });
  }
  return [...byNumber.values()].filter((e) => e.b.length).sort((a, b) => a.r.localeCompare(b.r));
}
