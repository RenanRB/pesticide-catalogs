// Turns the EPA Pesticide Product Information System (PPIS) download files into the app's
// product catalog: one entry per ACTIVE FIFRA section 3 registration with at least one
// agricultural use site. Pure: every function takes the files' lines, nothing is read here.
//
// The files are fixed-width ASCII. Positions below are the EPA's own data dictionary
// ("Introduction and Currently Offered File Structures with Data Dictionary", ppisdata.pdf),
// 1-based start and end columns as printed there.

export const BASE_URL = 'https://www3.epa.gov/pesticides/PPISdata/';

/** The download files the catalog needs (all inside `<name>.zip`). */
export const FILES = ['product', 'prodtype', 'typename', 'prodsite', 'formula', 'chemname', 'company', 'alt_prod_nm', 'formname', 'toxname'];

export const LAYOUT = {
  product: { reg: [1, 11], form: [12, 13], tox: [14, 14], canDate: [23, 30], ctCode: [31, 32], name: [33, 102], rup: [103, 103], length: 106 },
  prodtype: { reg: [1, 11], type: [12, 13] },
  typename: { type: [1, 2], desc: [3, 80] },
  prodsite: { reg: [1, 11], site: [12, 20] },
  formula: { reg: [1, 11], pc: [12, 17], pct: [18, 24] },
  chemname: { pc: [1, 6], kind: [7, 26], name: [27, 279] },
  company: { nr: [1, 6], name: [7, 66] },
  altName: { reg: [1, 11], name: [12, 81], status: [82, 91] },
  formname: { form: [1, 2], desc: [3, 80] },
  toxname: { tox: [1, 1], desc: [2, 80] },
};

/**
 * Site groups (first two digits of SITE_CODE, see SITENAME.TXT) that are crops or
 * agricultural land: 01–28 food, fibre, forage, grain, sugar, oil and specialty crops,
 * 30 forest trees and lands, 40 soil of unspecified crops, 66 uncultivated agricultural
 * areas. Ornamentals, turf, animals, buildings and disinfection sites are left out.
 */
export const AGRICULTURAL_SITE_GROUPS = new Set([...Array.from({ length: 28 }, (_, i) => String(i + 1).padStart(2, '0')), '30', '40', '66']);

/** Technical chemicals and formulation intermediates are for manufacturing, never sprayed. */
const MANUFACTURING_FORMS = new Set(['01', '02']);

/** Chemical name kinds, best first, for the active ingredient label. */
const NAME_PREFERENCE = ['ISO', 'ANSI', 'BSI', 'Other Common', 'WASSA', 'Other Systematic', 'IUPAC'];

export function field(line, [start, end]) {
  return line.slice(start - 1, end).trim();
}

/** "00010001652" → "100-1652" (EPA edit mask ZZZZZ9-ZZZZ9). */
export function formatRegNr(reg) {
  if (!/^\d{11}$/.test(reg)) return null;
  return `${Number(reg.slice(0, 6))}-${Number(reg.slice(6))}`;
}

/** "0439000" (7 digits, 4 decimals) → "43.9". */
export function formatPercent(raw) {
  if (!/^\d{1,7}$/.test(raw)) return '';
  return String(Number(raw) / 10000);
}

/** "HERBICIDE TERRESTRIAL" → "Herbicide terrestrial". */
export function sentenceCase(text) {
  const lower = text.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Active registrations (no cancellation date, not a manufacturing-use form): reg → product. */
export function activeProducts(lines) {
  const products = new Map();
  for (const line of lines) {
    if (line.length < LAYOUT.product.rup[0]) continue;
    const reg = field(line, LAYOUT.product.reg);
    const canDate = field(line, LAYOUT.product.canDate);
    const form = field(line, LAYOUT.product.form);
    if (!/^\d{11}$/.test(reg) || (canDate !== '' && canDate !== '00000000') || MANUFACTURING_FORMS.has(form)) continue;
    products.set(reg, {
      reg,
      name: field(line, LAYOUT.product.name),
      form,
      tox: field(line, LAYOUT.product.tox),
      rup: field(line, LAYOUT.product.rup) === 'T',
    });
  }
  return products;
}

/** Registrations with at least one agricultural use site. */
export function agriculturalRegs(lines, active) {
  const regs = new Set();
  for (const line of lines) {
    const reg = field(line, LAYOUT.prodsite.reg);
    if (active.has(reg) && AGRICULTURAL_SITE_GROUPS.has(field(line, LAYOUT.prodsite.site).slice(0, 2))) regs.add(reg);
  }
  return regs;
}

/** Simple code → description vocabularies (TYPENAME, FORMNAME, TOXNAME). */
export function vocabulary(lines, layout, codeKey) {
  const map = new Map();
  for (const line of lines) {
    const code = field(line, layout[codeKey]);
    const desc = field(line, layout.desc);
    if (code && desc) map.set(code, desc);
  }
  return map;
}

/** PC_CODE → the preferred common name (ISO first, then the other common names). */
export function chemicalNames(lines) {
  const best = new Map();
  for (const line of lines) {
    const pc = field(line, LAYOUT.chemname.pc);
    const rank = NAME_PREFERENCE.indexOf(field(line, LAYOUT.chemname.kind));
    const name = field(line, LAYOUT.chemname.name);
    if (!pc || rank < 0 || !name) continue;
    const current = best.get(pc);
    if (!current || rank < current.rank) best.set(pc, { rank, name });
  }
  return new Map([...best].map(([pc, { name }]) => [pc, name]));
}

/** reg → values of `valueKey`, only for the wanted registrations, in file order, without repeats. */
export function groupByReg(lines, layout, valueKey, wanted, filter = () => true) {
  const map = new Map();
  for (const line of lines) {
    const reg = field(line, layout.reg);
    if (!wanted.has(reg) || !filter(line)) continue;
    const value = field(line, layout[valueKey]);
    if (!value) continue;
    const list = map.get(reg) ?? [];
    if (!list.includes(value)) list.push(value);
    map.set(reg, list);
  }
  return map;
}

/** reg → "Glyphosate (41%); Diquat dibromide (0.73%)". */
export function ingredients(lines, wanted, chemNames) {
  const map = new Map();
  for (const line of lines) {
    const reg = field(line, LAYOUT.formula.reg);
    if (!wanted.has(reg)) continue;
    const pc = field(line, LAYOUT.formula.pc);
    const pct = formatPercent(field(line, LAYOUT.formula.pct));
    const name = chemNames.get(pc) ?? `PC ${pc}`;
    const list = map.get(reg) ?? [];
    list.push(pct && pct !== '0' ? `${name} (${pct}%)` : name);
    map.set(reg, list);
  }
  return new Map([...map].map(([reg, list]) => [reg, list.join('; ')]));
}

export function companies(lines) {
  const map = new Map();
  for (const line of lines) {
    const nr = field(line, LAYOUT.company.nr);
    if (nr) map.set(nr, field(line, LAYOUT.company.name));
  }
  return map;
}

/**
 * The catalog entries, in the AGROFIT catalog's compact shape so the app reads both the
 * same way: r registration, b brand names, f formulation, a active ingredients, h
 * registrant, c product types, t signal word, e environmental class (none in the US),
 * plus u = 1 for Restricted Use Pesticides.
 */
export function createCatalog(files) {
  const active = activeProducts(files.product);
  const regs = agriculturalRegs(files.prodsite, active);
  const typeNames = vocabulary(files.typename, LAYOUT.typename, 'type');
  const formNames = vocabulary(files.formname, LAYOUT.formname, 'form');
  const toxNames = vocabulary(files.toxname, LAYOUT.toxname, 'tox');
  const types = groupByReg(files.prodtype, LAYOUT.prodtype, 'type', regs);
  const alt = groupByReg(files.alt_prod_nm, LAYOUT.altName, 'name', regs, (line) => /^(active|alternate)$/i.test(field(line, LAYOUT.altName.status)));
  const ai = ingredients(files.formula, regs, chemicalNames(files.chemname));
  const registrants = companies(files.company);

  return [...regs]
    .sort()
    .map((reg) => {
      const product = active.get(reg);
      const names = [product.name, ...(alt.get(reg) ?? [])].filter((n, i, all) => n && all.indexOf(n) === i);
      const entry = {
        r: formatRegNr(reg),
        b: names,
        f: formNames.get(product.form) ?? '',
        a: ai.get(reg) ?? '',
        h: registrants.get(reg.slice(0, 6)) ?? '',
        c: (types.get(reg) ?? []).map((t) => typeNames.get(t)).filter(Boolean).map(sentenceCase).join(' / '),
        t: toxNames.get(product.tox) ?? '',
        e: '',
      };
      return product.rup ? { ...entry, u: 1 } : entry;
    })
    .filter((e) => e.r && e.b.length);
}
