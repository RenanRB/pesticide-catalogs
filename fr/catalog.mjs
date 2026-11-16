// Turns ANSES's E-Phy open data (data.gouv.fr, weekly) into the app's product catalog:
// one entry per plant protection product a professional may use in France today.
// Pure: every function takes the parsed CSV records.

/** data.gouv.fr dataset "Données ouvertes du catalogue E-Phy" (Licence Ouverte / Etalab). */
export const DATASET_API = 'https://www.data.gouv.fr/api/1/datasets/575e9fac88ee38072a640390/';

/** Product kinds a sprayer applies (MFSC = fertilisers and growing media, out of scope). */
const KINDS = new Set(['PPP', 'ADJUVANT', 'PRODUIT-MIXTE', 'MELANGE']);

/** CLP signal word codes of produits_classe_et_mention_danger ("DA" Danger, "AT" Attention). */
const SIGNAL_WORDS = { DA: 'DANGER', AT: 'WARNING' };

/** The UTF-8 CSV zip of the newest weekly publication (its file name changes every week). */
export function latestZip(dataset) {
  const zips = (dataset?.resources ?? []).filter((r) => /format-csv-\d{8}-utf8\.zip$/i.test(r.url ?? ''));
  zips.sort((a, b) => String(b.url).localeCompare(String(a.url)));
  return zips[0]?.url ?? null;
}

function dmy(text) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(text ?? '').trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

function unique(list) {
  return list.filter((v, i, all) => v && all.indexOf(v) === i);
}

/** "a | b | a" → ["a", "b"]. */
function split(text) {
  return unique(String(text ?? '').split('|').map((s) => s.trim()));
}

/** AMM → the last date any of its uses may still be applied (withdrawn products keep a use-up period). */
function useUntil(usages) {
  const until = new Map();
  for (const u of usages) {
    const date = dmy(u['date fin utilisation']);
    const amm = u['numero AMM'];
    if (date && (!until.has(amm) || date > until.get(amm))) until.set(amm, date);
  }
  return until;
}

/** AMM → signal word ("DANGER" wins over "WARNING"). */
function signalWords(hazards) {
  const words = new Map();
  for (const h of hazards) {
    const word = SIGNAL_WORDS[h['Libellé court']];
    if (word && words.get(h['numero AMM']) !== 'DANGER') words.set(h['numero AMM'], word);
  }
  return words;
}

/**
 * The catalog entries in the shared compact shape: r AMM / permit number, b names, f
 * formulation, a active substances with content, h holder, c functions, t CLP signal word
 * (DANGER / WARNING / ""), e "" (no environmental class), d = 1 when the product is on the
 * official list of products approved for spraying by drone.
 *
 * @param {{products: object[], usages: object[], hazards: object[], permits: object[]}} files
 * @param {string} today ISO date: withdrawn products still in their use-up period stay in
 * @param {Set<string>} drone AMM numbers of the drone list
 */
export function createCatalog(files, today, drone = new Set()) {
  const until = useUntil(files.usages);
  const words = signalWords(files.hazards);
  const byAmm = new Map();
  for (const p of files.products) {
    const amm = p['numero AMM'];
    if (!/^\d{7}$/.test(amm) || !KINDS.has(p['type produit'])) continue;
    if (p['gamme usage'].startsWith('Amateur')) continue;
    const authorised = p['Etat d’autorisation'] === 'AUTORISE';
    if (!authorised && !(p['Etat d’autorisation'] === 'RETIRE' && (until.get(amm) ?? '') >= today)) continue;
    const entry = {
      r: amm,
      b: unique([p['nom produit'], ...split(p['seconds noms commerciaux'])]),
      f: split(p['formulations']).join(' / '),
      a: split(p['Substances actives']).join('; '),
      h: p['titulaire'],
      c: split(p['fonctions']).join(' / '),
      t: words.get(amm) ?? '',
      e: '',
    };
    byAmm.set(amm, drone.has(amm) ? { ...entry, d: 1 } : entry);
  }
  // Parallel-trade permits carry the French reference product's label.
  for (const pcp of files.permits) {
    const nr = pcp['N° Permis'];
    const ref = byAmm.get(pcp['N° AMM de référence français']);
    if (!/^\d{7}$/.test(nr) || pcp['Etat d’autorisation'] !== 'AUTORISE' || !ref || byAmm.has(nr)) continue;
    byAmm.set(nr, { ...ref, r: nr, b: unique([pcp['Nom du produit']]), h: pcp['Détenteur PCP'] });
  }
  return [...byAmm.values()].filter((e) => e.b.length).sort((a, b) => a.r.localeCompare(b.r));
}
