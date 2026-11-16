// Turns SENASA's Vademecum (Registro Nacional de Terapéutica Vegetal) into the app's product catalog:
// one entry per plant protection product registered in Argentina today.
// Pure: every function takes the parsed JSON answers.
//
// The Vademecum (aps2.senasa.gov.ar/vademecum) has no open-data file. Its front end calls an
// undocumented Spring Data REST API; only the light public searches are used here:
// - publicSearchProductosFormuladosDTO: every product with registration number, brand, holder,
//   toxicological class and active ingredients. It lists ACTIVO products only: on 2026-11-15
//   the text search (which shows the state) had 7,553 products, the 25 extra ones BAJA, and
//   every BAJA product sampled was missing from this list while every one sampled from it was
//   ACTIVO. Registration numbers absent from it are absent from the public search too.
// - publicSearchAdvanceProductosFormuladosDTO?aptitudes=<id>: the same rows filtered by function
//   (herbicida…); the only light source of `c`.
// - nomencladoresDeProductosRU/.../publicSearchByDescripcionAndPadreAptitudes: the function list.
// The detailed projections carry user names and other personal fields: never used.

export const API = 'https://aps2.senasa.gov.ar/adt_api/api/';
export const PAGE_SIZE = 2000;

/** Every listed product, sorted by id (unique) so pages never overlap. */
export function productsUrl(page) {
  return `${API}productosAgroquimicosFormulados/search/publicSearchProductosFormuladosDTO?page=${page}&size=${PAGE_SIZE}&sort=id,asc`;
}

/** The products of one function (aptitud). */
export function aptitudeUrl(id, page) {
  return `${API}productosAgroquimicosFormulados/search/publicSearchAdvanceProductosFormuladosDTO?aptitudes=${id}&page=${page}&size=${PAGE_SIZE}&sort=id,asc`;
}

/** The function list (31 rows in 2026). */
export const APTITUDES_URL = `${API}nomencladoresDeProductosRU/search/publicSearchByDescripcionAndPadreAptitudes?descripcion=&size=500&sort=descripcion,asc`;

/** Tree nodes of the nomenclature, not functions. */
const NOT_FUNCTIONS = new Set(['Formulados', 'Sustancias Activas']);

/**
 * SENASA's toxicological classes → the app's Ia / Ib / II / III / IV.
 * The old WHO classes are used as they are. The new scheme (Res. SENASA 458/2025, rows 1–5 and
 * "No Clasificado" of the clasesToxicologicas table) lines up by warning text and band colour:
 * 1 Extremadamente peligroso (red) = Ia, 2 Altamente (red) = Ib, 3 Moderadamente (yellow) = II,
 * 4 Poco peligroso (blue) = III. 5 "Improbable de causar daño agudo" also carries the BLUE band,
 * so it takes III, the stricter of the two it could mean. "No Clasificado" (green band), S/D
 * (sin datos) and anything else stay unknown.
 */
const TOX_CLASSES = { Ia: 'Ia', Ib: 'Ib', II: 'II', III: 'III', IV: 'IV', 1: 'Ia', 2: 'Ib', 3: 'II', 4: 'III', 5: 'III' };

export function toxClass(raw) {
  return TOX_CLASSES[String(raw ?? '').trim()] ?? '';
}

function clean(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * "CLORANTRANILIPROLE <b>10%</b>, 2,4 D <b>30%</b>" → "CLORANTRANILIPROLE 10%; 2,4 D 30%".
 * Split after each closing tag: names and contents carry commas themselves.
 */
export function activeIngredients(text) {
  return String(text ?? '')
    .split(/<\/b>\s*,\s*/i)
    .map((part) => clean(part.replace(/<\/?b>/gi, ' ')))
    .filter(Boolean)
    .join('; ');
}

/** One HAL page → its rows and paging info; throws when the layout is not the expected one. */
export function page(json) {
  const rows = json?._embedded?.productosAgroquimicosFormulados ?? [];
  const info = json?.page;
  if (!info || !Number.isInteger(info.totalElements) || !Array.isArray(rows)) throw new Error('Vademecum: unexpected answer (no page / _embedded)');
  return { rows, totalElements: info.totalElements, totalPages: info.totalPages };
}

/** All rows of a paged search, checking nothing was lost or repeated between pages. */
export function allRows(pages) {
  const rows = pages.flatMap((p) => page(p).rows);
  const expected = pages.length ? page(pages[0]).totalElements : 0;
  if (rows.length !== expected) throw new Error(`Vademecum: ${rows.length} rows, the API announced ${expected}`);
  if (new Set(rows.map((r) => r.id)).size !== rows.length) throw new Error('Vademecum: repeated ids between pages');
  return rows;
}

/** The functions worth querying: [{id, name}]. */
export function aptitudes(json) {
  const rows = json?._embedded?.nomencladoresDeProductosRU ?? Object.values(json?._embedded ?? {})[0] ?? [];
  const list = rows.filter((a) => a.enUso !== false && a.descripcion && !NOT_FUNCTIONS.has(a.descripcion.trim()));
  if (list.length < 10) throw new Error(`Vademecum: only ${list.length} functions in the nomenclature`);
  return list.map((a) => ({ id: a.id, name: clean(a.descripcion) }));
}

/** [{name, rows}] per function → product id → its function names, alphabetical. */
export function functionsById(byFunction) {
  const map = new Map();
  for (const { name, rows } of byFunction) {
    for (const row of rows) {
      if (!map.has(row.id)) map.set(row.id, new Set());
      map.get(row.id).add(name);
    }
  }
  return new Map([...map].map(([id, names]) => [id, [...names].sort((a, b) => a.localeCompare(b, 'es'))]));
}

/**
 * The catalog entries in the shared compact shape: r registration number (as SENASA writes it,
 * "42811 BIO" included), b brand, f "" (formulation is only in the detailed projection),
 * a active ingredients with content, h holder, c functions, t toxicological class
 * (Ia / Ib / II / III / IV / ""), e "", d = 1 when the product is on SENASA's VANT (drone) list.
 *
 * @param {object[]} rows the publicSearchProductosFormuladosDTO rows
 * @param {Map<number, string[]>} functions product id → function names
 * @param {Set<string>} drone registration numbers of the VANT list
 */
export function createCatalog(rows, functions = new Map(), drone = new Set()) {
  const byNumber = new Map();
  for (const row of rows) {
    const r = clean(row.numeroInscripcion);
    const brand = clean(row.marca);
    if (!r || !brand || byNumber.has(r)) continue;
    const entry = {
      r,
      b: [brand],
      f: '',
      a: activeIngredients(row.sustanciasActivas),
      h: clean(row.nombreFirma),
      c: (functions.get(row.id) ?? []).join(' / '),
      t: toxClass(row.claseToxicologica),
      e: '',
    };
    byNumber.set(r, drone.has(r) ? { ...entry, d: 1 } : entry);
  }
  return [...byNumber.values()].sort((a, b) => a.r.localeCompare(b.r));
}
