// Turns the Greek Ministry of Rural Development and Food (YPAAT) database dbSYSPEST
// (1click.minagric.gr, updated almost daily) into the app's product catalog: one entry per
// plant protection product a professional may buy and use in Greece today.
// Pure: every function takes the tables exported from the .mdb as parsed CSV records.

/** The 1Click page that offers the database ("Κατεβάστε από εδώ το αρχείο"). */
export const PORTAL = 'https://1click.minagric.gr/oneClickUI/frmFytoPro.zul';

/** Tables build.mjs exports with mdb-export. */
export const TABLES = {
  professional: 'SKEYASMATA-professional',
  products: 'FARMAKO',
  composition: 'FARM_DRO',
  substances: 'SYSTATIK',
  companies: 'COMPANY',
  hazards: 'FARMAKA_FEK',
  parallel: 'PARALLEL-IMPORT',
  forms: 'MORFH_SK',
  categories: 'KATHGORI',
};

/** Stock-disposal date of SKEYASMATA-professional ("end of stock disposal"). */
const STOCK_UNTIL = 'ΛΗΞΗ ΔΙΑΘΕΣΗΣ ΑΠΟΘΕΜΑΤΩΝ';

/**
 * ZK renders the page as a widget tree; the download link is the Label with id "down2".
 * Clicking it posts an "onClick" AU event for that widget's uuid inside the desktop (dtid)
 * of the session that loaded the page. Returns null when the page no longer has the link.
 */
export function downloadWidget(html) {
  const dtid = /\bdt:'([^']+)'/.exec(html)?.[1];
  const uuid = /\['zul\.wgt\.Label','([^']+)',\{id:'down2'/.exec(html)?.[1];
  return dtid && uuid ? { dtid, uuid } : null;
}

/** The AU answer to that click: {"rs":[["download",["/oneClickUI/zkau/view/…/dbSYSPEST.zip"]]]}. */
export function downloadPath(au) {
  const command = (au?.rs ?? []).find((c) => c?.[0] === 'download');
  const path = command?.[1]?.[0];
  return typeof path === 'string' && /^\/oneClickUI\/zkau\/view\/.+\.zip$/i.test(path) ? path : null;
}

/**
 * "2026-11-15" or "2026-11-15 00:00:00" (mdb-export -D/-T '%Y-%m-%d') → "2026-11-15"; empty
 * stays "". Any other text throws: a date read as "" would silently drop every product in its
 * stock-disposal period.
 */
function isoDate(text) {
  const value = String(text ?? '').trim();
  if (!value) return '';
  const m = /^(\d{4}-\d{2}-\d{2})(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/.exec(value);
  if (!m) throw new Error(`dbSYSPEST: unexpected date "${value}" (run mdb-export with -D and -T '%Y-%m-%d')`);
  return m[1];
}

const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();

function unique(list) {
  return list.filter((v, i, all) => v && all.indexOf(v) === i);
}

/** First letter upper case ("εντομοκτόνο" → "Εντομοκτόνο"). */
function capital(text) {
  const value = clean(text);
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : ''; // keeps the tonos (ά → Ά)
}

// CLP signal word of each hazard statement (Regulation (EC) 1272/2008, Annex I and the
// label elements of each hazard class). Danger always prevails (art. 20(3)).
// Statements whose word depends on the category (H228 flammable solid 1/2, H261 water
// reactive 2/3, H272 oxidising 2/3) are left out: the database does not give the category.
// Statements without a signal word (H362, H411-H413, EUH…) or outside the EU CLP (H316,
// H320, H401, H402, the "H208" written for EUH208) are ignored.
const DANGER = new Set([
  'H200', 'H201', 'H202', 'H203', 'H220', 'H222', 'H224', 'H225', 'H240', 'H241', 'H250', 'H251',
  'H260', 'H270', 'H271', 'H300', 'H301', 'H304', 'H310', 'H311', 'H314', 'H318', 'H330', 'H331', 'H334', 'H340',
  'H350', 'H360', 'H370', 'H372',
]);
const WARNING = new Set([
  'H204', 'H223', 'H226', 'H229', 'H252', 'H280', 'H281', 'H290', 'H302', 'H312', 'H315', 'H317', 'H319', 'H332',
  'H335', 'H336', 'H341', 'H351', 'H361', 'H371', 'H373', 'H400', 'H410', 'H420',
]);
const NO_WORD = new Set(['H208', 'H316', 'H320', 'H362', 'H401', 'H402', 'H411', 'H412', 'H413']);

/**
 * The CLP signal word derived from the product's hazard statements. The database keeps a
 * signal word column (FARMAKO.code_signal) but it is empty for every product, so the word is
 * derived from the H statements in FARMAKA_FEK, only when that is unambiguous:
 * - a Danger statement → "DANGER";
 * - otherwise any statement whose word is unknown or depends on the category → "";
 * - otherwise a Warning statement → "WARNING"; nothing (old R phrases only) → "".
 * The GHS pictograms (FARMAKO.CODE_TOXIK, "GHS07+GHS09") are a cross-check: GHS06 always
 * comes with Danger, GHS05 with Danger unless it stands for H290 (corrosive to metals), and
 * Danger always comes with GHS05, GHS06 or GHS08 (or GHS01/02/03 for physical hazards); a
 * disagreement means the H list is incomplete, so the word is "".
 *
 * @param {string} statements FARMAKA_FEK.CODE ("EUH401, H302, H410, P273, …")
 * @param {string} pictograms FARMAKO.CODE_TOXIK ("GHS07+GHS09", "Xn/N" before CLP, or "")
 */
export function signalWord(statements, pictograms = '') {
  const codes = [...String(statements ?? '').toUpperCase().matchAll(/(?<![A-Z])H(\d{3})/g)].map((m) => `H${m[1]}`);
  let word = '';
  if (codes.some((c) => DANGER.has(c))) word = 'DANGER';
  else if (codes.some((c) => !WARNING.has(c) && !NO_WORD.has(c))) return '';
  else if (codes.some((c) => WARNING.has(c))) word = 'WARNING';
  const ghs = new Set(String(pictograms ?? '').toUpperCase().match(/GHS0\d/g) ?? []);
  if (!word || !ghs.size) return word;
  if (word === 'WARNING' && (ghs.has('GHS06') || (ghs.has('GHS05') && !codes.includes('H290')))) return '';
  if (word === 'DANGER' && !['GHS01', 'GHS02', 'GHS03', 'GHS05', 'GHS06', 'GHS08'].some((g) => ghs.has(g))) return '';
  return word;
}

/** 99.09999999999999 → "99.1". */
function amount(value) {
  const n = Number(value);
  return value !== '' && Number.isFinite(n) && n > 0 ? String(Number(n.toPrecision(6))) : '';
}

/** FARMAKO.FYS_KATAST: 2 = content per volume (β/ο, w/v), 4 = per weight (β/β, w/w). */
const BASIS = { 2: ' β/ο', 4: ' β/β' };

/** "lambda-Cyhalothrin 10% β/ο; …": active substances only (no safeners or synergists). */
function substances(rows, names, basis) {
  return rows
    .filter((d) => !d.substanceType || d.substanceType === 'active substance')
    .map((d) => {
      const name = clean(names.get(d.KODIKOS));
      const value = amount(d.SYNTHESH);
      return name && value ? `${name} ${value}%${basis}` : name;
    })
    .filter(Boolean)
    .join('; ');
}

/** "BASAGRAN 48 SL 116913" → "BASAGRAN 48 SL": a parallel import's name carries its permit protocol number. */
function withoutPermit(name, permits) {
  const m = /^(.*\S)\s+(\d+)$/.exec(name);
  return m && permits.has(m[2]) ? m[1] : name;
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
  if (!rows.length || missing.length) throw new Error(`dbSYSPEST: table ${table} is empty or lost ${missing.join(', ')}`);
}

/**
 * The catalog entries in the shared compact shape: r Greek authorisation number (αριθμός
 * έγκρισης = KOD_FARMAK), b names (current, the Latin and Greek spellings, a former name,
 * and the names of the parallel imports of that product), f formulation, a active substances
 * with content, h authorisation holder, c action category, t CLP signal word derived from the
 * H statements (see signalWord), e "". No drone flag: aerial spraying, drones included, is
 * banned in Greece (law 4036/2012 art. 23).
 *
 * The filter follows the ministry's own instructions shipped in the zip ("ΟΔΗΓΙΕΣ ΓΙΑ ΤΗ
 * ΧΡΗΣΗ ΤΗΣ ΒΑΣΗΣ ΔΕΔΟΜΕΝΩΝ ΣΕ ΨΗΦΙΑΚΗ ΜΟΡΦΗ"): table SKEYASMATA-professional holds every
 * product shops must have in the electronic record of retail sales, and its APOSYRSH says
 * - "" (empty): authorised and on the market, even when its expiry date (TELOS_EGRI) has
 *   passed: "products listed with an expiry date before today, without a ministerial
 *   revocation decision, are in force and under evaluation" → kept whatever TELOS_EGRI says;
 * - "-": revoked, but the date until which shops may still sell the stock has not passed →
 *   kept while that date (ΛΗΞΗ ΔΙΑΘΕΣΗΣ ΑΠΟΘΕΜΑΤΩΝ) is today or later;
 * - "P": parallel import from another member state, its name added to the reference
 *   product's entry (same number) when PARALLEL-IMPORT does not say it was withdrawn
 *   (DELREC "in force", LIXI_EGR expiry);
 * - "O": the former name of a renamed product (the same number has a row with the current
 *   name) → added to that entry's names;
 * - "E": approved for amateur use only → left out.
 *
 * @param {Record<keyof TABLES, object[]>} tables the exported tables as CSV records
 * @param {string} today ISO date
 */
export function createCatalog(tables, today) {
  requireColumns(tables.professional, TABLES.professional, ['KOD_FARMAK', 'EMPORIKHON', 'APOSYRSH', STOCK_UNTIL]);
  requireColumns(tables.products, TABLES.products, ['KOD_FARMAK', 'EMPORIKHON', 'GBONOMA', 'MORFHSKEYA', 'EDR_COD_KAT', 'ANTIPROSOP', 'PARASKEYAS', 'FYS_KATAST', 'CODE_TOXIK']);
  requireColumns(tables.composition, TABLES.composition, ['KOD_FARMAK', 'KODIKOS', 'SYNTHESH']);
  requireColumns(tables.substances, TABLES.substances, ['KODIKOS', 'ONOMADRON']);
  requireColumns(tables.companies, TABLES.companies, ['KOD_COMPAN', 'NAMECOMPAN']);
  requireColumns(tables.hazards, TABLES.hazards, ['KOD_FARMAK', 'CODE']);
  requireColumns(tables.parallel, TABLES.parallel, ['KOD_FARMAK', 'NUM_PROTOK', 'DELREC', 'LIXI_EGR']);

  const products = new Map(tables.products.map((p) => [clean(p.KOD_FARMAK), p]));
  const composition = groupBy(tables.composition, 'KOD_FARMAK');
  const parallel = groupBy(tables.parallel, 'KOD_FARMAK');
  const names = new Map(tables.substances.map((s) => [clean(s.KODIKOS), s.ONOMADRON]));
  const companies = new Map(tables.companies.map((c) => [clean(c.KOD_COMPAN), clean(c.NAMECOMPAN) || clean(c.ENAME)]));
  const hazards = new Map(tables.hazards.map((h) => [clean(h.KOD_FARMAK), h.CODE]));
  const forms = new Map((tables.forms ?? []).map((f) => [clean(f.MORFHSKEYA), clean(f.PERIGR1)]));
  const categories = new Map((tables.categories ?? []).map((k) => [clean(k.EDR_COD_KAT), capital(k.HKATHGORIA) || clean(k.KATHGORIA)]));

  const catalog = [];
  for (const [nr, rows] of groupBy(tables.professional, 'KOD_FARMAK')) {
    const product = products.get(nr);
    if (!/^\d{1,6}$/.test(nr) || !product) continue;
    const permits = parallel.get(nr) ?? [];
    const onSale = rows.filter((p) => p.APOSYRSH === '' || (p.APOSYRSH === '-' && isoDate(p[STOCK_UNTIL]) >= today));
    const imports = rows.filter((p) => {
      if (p.APOSYRSH !== 'P') return false;
      const name = clean(p.EMPORIKHON);
      const permit = permits.find((q) => name.endsWith(` ${clean(q.NUM_PROTOK)}`) || clean(q['EMPORIKO ONOMA']) === name);
      if (!permit) return true;
      const expiry = isoDate(permit.LIXI_EGR);
      return permit.DELREC === '1' && (!expiry || expiry >= today);
    });
    if (!onSale.length && !imports.length) continue;
    const protocols = new Set(permits.map((q) => clean(q.NUM_PROTOK)).filter(Boolean));
    const formerNames = rows.filter((p) => p.APOSYRSH === 'O').map((p) => clean(p.EMPORIKHON));
    const b = unique([
      ...onSale.map((p) => clean(p.EMPORIKHON)),
      // The FARMAKO spellings belong to the product itself, sold only when it is on the list.
      ...(onSale.length ? [clean(product.EMPORIKHON), clean(product.GBONOMA), ...formerNames] : []),
      ...imports.map((p) => withoutPermit(clean(p.EMPORIKHON), protocols)),
    ]);
    const holder = clean(product.ANTIPROSOP) && clean(product.ANTIPROSOP) !== '0' ? product.ANTIPROSOP : product.PARASKEYAS;
    catalog.push({
      r: nr,
      b,
      f: capital(forms.get(clean(product.MORFHSKEYA))) || clean(product.MORFHSKEYA),
      a: substances(composition.get(nr) ?? [], names, BASIS[clean(product.FYS_KATAST)] ?? ''),
      h: companies.get(clean(holder)) ?? '',
      c: categories.get(clean(product.EDR_COD_KAT)) || clean(product.EDR_COD_KAT),
      t: signalWord(hazards.get(nr), product.CODE_TOXIK),
      e: '',
    });
  }
  return catalog.filter((e) => e.b.length).sort((x, y) => Number(x.r) - Number(y.r));
}
