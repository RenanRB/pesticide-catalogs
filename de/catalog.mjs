// Turns the BVL plant protection product database (PSM-API, psm-api.bvl.bund.de, updated
// monthly) into the app's product catalog: one entry per plant protection product a
// professional may use in Germany today.
// Pure: every function takes the API tables as arrays of rows.

/** BVL PSM-API (Oracle REST Data Services): <API>/<table>/?limit=&offset= */
export const API = 'https://psm-api.bvl.bund.de/ords/psm/api-v1/';

/** Tables build.mjs downloads. */
export const TABLES = [
  'stand',
  'mittel',
  'mittel_abgelaufen',
  'parallelimport_gueltig',
  'wirkstoff',
  'wirkstoff_gehalt',
  'antrag',
  'adresse',
  'ghs_signalwoerter',
  'mittel_wirkbereich',
  'awg',
  'kode',
];

/** Code lists of table `kode` the catalog reads (German texts). */
const LIST = { country: 3, functions: 21, formulations: 22, units: 25, signalWords: 76 };

/** ghs_signalwoerter: S1 "Achtung" = CLP Warning, S2 "Gefahr" = Danger. */
const SIGNAL_WORDS = { S1: 'WARNING', S2: 'DANGER' };

const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();

/** "2027-08-14T22:00:00Z" → "2027-08-14T22:00:00Z" compared as text with "2026-11-16" works; null → "". */
const day = (value) => clean(value).slice(0, 10);

function unique(list) {
  return list.filter((v, i, all) => v && all.indexOf(v) === i);
}

function groupBy(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const k = clean(row[key]);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(row);
  }
  return map;
}

function requireColumns(rows, table, columns) {
  const missing = columns.filter((c) => rows.length && !(c in rows[0]));
  if (!rows.length || missing.length) throw new Error(`BVL: table ${table} is empty or lost ${missing.join(', ')}`);
}

/** code → German text of one code list ("EC" → "Emulgierbares Konzentrat (Emulsionskonzentrat)"). */
function codeList(kode, list) {
  const map = new Map();
  for (const k of kode) {
    if (Number(k.kodeliste) === list && k.sprache === 'DE' && !map.has(k.kode)) map.set(k.kode, clean(k.kodetext));
  }
  return map;
}

/** 375 → "375", 0.05 → "0.05", 99.09999999999999 → "99.1". */
function amount(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? String(Number(n.toPrecision(6))) : '';
}

/** "Folpet 800 g/kg; …": active substances with content (gehalt_rein, else the base structure's). */
function substances(rows, names, units) {
  return rows
    .map((g) => {
      const name = clean(names.get(clean(g.wirknr)));
      const value = amount(g.gehalt_rein) || amount(g.gehalt_rein_grundstruktur);
      const unit = units.get(clean(g.gehalt_einheit)) ?? '';
      return name && value ? `${name} ${value}${unit ? ' ' + unit : ''}` : name;
    })
    .filter(Boolean)
    .join('; ');
}

/** The applicant of the lowest application number: the authorisation holder ("Mitsui …," → no trailing comma). */
function holders(antrag, adresse) {
  const firms = new Map(adresse.map((a) => [Number(a.adresse_nr), clean(a.firmenname).replace(/[,;]+$/, '')]));
  const map = new Map();
  for (const a of [...antrag].sort((x, y) => clean(x.antragnr).localeCompare(clean(y.antragnr)))) {
    const kennr = clean(a.kennr);
    if (!map.has(kennr)) map.set(kennr, firms.get(Number(a.antragsteller_nr)) ?? '');
  }
  return map;
}

/**
 * The catalog entries in the shared compact shape: r Zulassungsnummer ("024459-00"; "-6x" are
 * the same product under a distributor's name, listed by the BVL as their own number), b
 * name, f formulation, a active substances with content, h authorisation holder, c functions
 * (Fungizid, Herbizid…), t CLP signal word (DANGER for "Gefahr", WARNING for "Achtung", ""
 * when not classified), e "", d = 1 when the number is on the BVL's list of products approved
 * for application by drone (§ 18 Abs. 3 Nr. 2 PflSchG, steep-slope vineyards only).
 *
 * What is kept:
 * - every row of `mittel` (only products whose authorisation runs today), unless every use
 *   (`awg`) is for non-professional users (home and garden);
 * - expired products still in their use-up period (`mittel_abgelaufen.aufbrauchfrist` today or
 *   later), with the same professional filter when their uses are still listed;
 * - valid parallel-trade permits (`parallelimport_gueltig`, `gueltig` today or later), each its
 *   own entry numbered "<reference number>/<PI number>" (the API's key for the permit), named
 *   after the imported product, held by the importer, with the reference product's label
 *   (formulation, substances, functions, signal word: § 47 PflSchG applies the reference's
 *   uses and conditions to it). The drone flag is never inherited.
 *
 * @param {Record<string, object[]>} t the downloaded tables by name
 * @param {string} today ISO date
 * @param {Set<string>} drone Zulassungsnummern on the BVL's drone list
 */
export function createCatalog(t, today, drone = new Set()) {
  requireColumns(t.mittel, 'mittel', ['kennr', 'mittelname', 'formulierung_art', 'zul_ende']);
  requireColumns(t.mittel_abgelaufen, 'mittel_abgelaufen', ['kennr', 'mittelname', 'formulierung_art', 'aufbrauchfrist']);
  requireColumns(t.parallelimport_gueltig, 'parallelimport_gueltig', ['pi_referenz_kennr', 'pi_kennziffer', 'pi_mittelname', 'importeur_txt', 'gueltig']);
  requireColumns(t.wirkstoff, 'wirkstoff', ['wirknr', 'wirkstoffname']);
  requireColumns(t.wirkstoff_gehalt, 'wirkstoff_gehalt', ['kennr', 'wirknr', 'gehalt_rein', 'gehalt_rein_grundstruktur', 'gehalt_einheit']);
  requireColumns(t.antrag, 'antrag', ['kennr', 'antragnr', 'antragsteller_nr']);
  requireColumns(t.adresse, 'adresse', ['adresse_nr', 'firmenname']);
  requireColumns(t.ghs_signalwoerter, 'ghs_signalwoerter', ['kennr', 'signalwort']);
  requireColumns(t.mittel_wirkbereich, 'mittel_wirkbereich', ['kennr', 'wirkungsbereich']);
  requireColumns(t.awg, 'awg', ['kennr', 'anwenderkategorie']);
  requireColumns(t.kode, 'kode', ['kode', 'kodeliste', 'sprache', 'kodetext']);

  const formulations = codeList(t.kode, LIST.formulations);
  const functionNames = codeList(t.kode, LIST.functions);
  const units = codeList(t.kode, LIST.units);
  const names = new Map(t.wirkstoff.map((w) => [clean(w.wirknr), w.wirkstoffname]));
  const content = groupBy(t.wirkstoff_gehalt, 'kennr');
  const holder = holders(t.antrag, t.adresse);
  const words = new Map(t.ghs_signalwoerter.map((s) => [clean(s.kennr), SIGNAL_WORDS[clean(s.signalwort)] ?? '']));
  const functions = groupBy(t.mittel_wirkbereich, 'kennr');
  const users = new Map();
  for (const a of t.awg) {
    const kennr = clean(a.kennr);
    if (!users.has(kennr)) users.set(kennr, new Set());
    users.get(kennr).add(clean(a.anwenderkategorie));
  }
  // A distributor's number ("-6x") or an expired product may lack rows the base product has:
  // same product, same label, so its own rows win and the base number's fill the gap.
  const base = (kennr) => `${kennr.slice(0, 6)}-00`;
  const own = (map, kennr) => map.get(kennr) ?? map.get(base(kennr));
  const homeAndGardenOnly = (kennr) => {
    const set = users.get(kennr) ?? users.get(base(kennr));
    return !!set && set.size > 0 && [...set].every((u) => u === 'Nichtberuflich');
  };

  const label = (kennr, row) => ({
    f: formulations.get(clean(row.formulierung_art)) || clean(row.formulierung_art),
    a: substances(own(content, kennr) ?? [], names, units),
    c: unique((own(functions, kennr) ?? []).map((w) => functionNames.get(clean(w.wirkungsbereich)) || clean(w.wirkungsbereich))).join(', '),
    t: words.get(kennr) || words.get(base(kennr)) || '',
  });

  const byNr = new Map();
  const add = (kennr, row) => {
    const name = clean(row.mittelname);
    if (!/^[0-9A-Z]{6}-\d{2}$/.test(kennr) || !name || homeAndGardenOnly(kennr)) return;
    const { f, a, c, t: word } = label(kennr, row);
    const entry = { r: kennr, b: [name], f, a, h: holder.get(kennr) || holder.get(base(kennr)) || '', c, t: word, e: '' };
    byNr.set(kennr, drone.has(kennr) ? { ...entry, d: 1 } : entry);
  };
  for (const row of t.mittel) add(clean(row.kennr), row);
  for (const row of t.mittel_abgelaufen) {
    const kennr = clean(row.kennr);
    if (!byNr.has(kennr) && day(row.aufbrauchfrist) >= today) add(kennr, row);
  }

  const reference = new Map([...t.mittel_abgelaufen, ...t.mittel].map((row) => [clean(row.kennr), row]));
  for (const p of t.parallelimport_gueltig) {
    const ref = clean(p.pi_referenz_kennr);
    const nr = `${ref}/${clean(p.pi_kennziffer)}`;
    const name = clean(p.pi_mittelname) || clean(p.mittelname);
    if (!/^[0-9A-Z]{6}-\d{2}$/.test(ref) || !clean(p.pi_kennziffer) || !name || day(p.gueltig) < today || byNr.has(nr)) continue;
    const refRow = reference.get(ref);
    const { f, a, c, t: word } = refRow ? label(ref, refRow) : { f: '', a: substances(content.get(ref) ?? [], names, units), c: '', t: words.get(ref) ?? '' };
    byNr.set(nr, { r: nr, b: unique([name, clean(p.mittelname)]), f, a, h: clean(p.importeur_txt), c, t: word, e: '' });
  }

  return [...byNr.values()].sort((x, y) => x.r.localeCompare(y.r));
}

/** The BVL's own date of the data ("stand"), "2026-11-04". */
export function standDate(stand) {
  return day(stand?.[0]?.datum);
}
