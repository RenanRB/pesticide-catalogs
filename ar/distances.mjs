// Turns the national dataset "Regulaciones sobre aplicación de fitosanitarios" (Secretaría de
// Agricultura, Ganadería y Pesca, datos.gob.ar, CC BY 4.0) into the minimum distance to towns
// each province's law sets, per toxicological class, for aerial and for ground spraying.
// Pure: takes the parsed CSV records.
//
// The dataset summarises each province's base law and decree as of 2019: municipal ordinances
// are often stricter and newer rules (drones: Santa Fe Res. 199/2026, Córdoba 2026) are not in it.
// It is transcribed as published, even where it disagrees with the law text (Córdoba's ground
// 500 m sits in the III/IV column while Ley 9164 art. 59 puts it on Ia/Ib/II).

/** datos.gob.ar (CKAN) dataset that holds the CSV; its resource URL is resolved at build time. */
export const DATASET_API = 'https://datos.gob.ar/api/3/action/package_show?id=regulaciones-sobre-aplicacion-de-agroquimicos';
export const DATASET_PAGE = 'https://datos.gob.ar/dataset/regulaciones-sobre-aplicacion-de-agroquimicos';
const CSV_NAME = /regulacion_provincial_fitosanitarios\.csv$/i;

export const CLASSES = ['Ia', 'Ib', 'II', 'III', 'IV'];

/** The CSV resource of the dataset: {url, modified}. */
export function csvResource(packageJson) {
  const resource = (packageJson?.result?.resources ?? []).find((r) => CSV_NAME.test(r.url ?? ''));
  if (!resource) return null;
  return { url: resource.url, modified: String(resource.last_modified ?? resource.modified ?? '').slice(0, 10) };
}

/**
 * The columns of one kind of spraying, general first and then the more specific ones, so a
 * column naming fewer classes overrides a broader one. A class no column names stays null:
 * the dataset did not state it (Santa Fe aerial II, Salta aerial III), never filled by guess.
 */
const COLUMNS = {
  aerial: {
    rule: 'restriccion_aerea',
    columns: [
      ['distancia_a_centros_urbanos_restriccion_aerea', CLASSES],
      ['restriccion_aerea_Clase_agroquimico_Ia_Ib_II', ['Ia', 'Ib', 'II']],
      ['restriccion_aerea_Clase_agroquimico_Ia_Ib', ['Ia', 'Ib']],
      ['restriccion_aerea_Clase_agroquimico_III_IV', ['III', 'IV']],
      ['restriccion_aerea_Clase_agroquimico_IV', ['IV']],
    ],
  },
  ground: {
    rule: 'restriccion_terrestre',
    columns: [
      ['distancia_a_centros_urbanos_restriccion_terrestre', CLASSES],
      ['restriccion_terrestre_Clase_agroquimico_Ia_Ib_II', ['Ia', 'Ib', 'II']],
      ['restriccion_terrestre_Clase_agroquimico_Ia_Ib', ['Ia', 'Ib']],
      ['restriccion_terrestre_Clase_agroquimico_III_IV', ['III', 'IV']],
    ],
  },
};

function clean(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

function fold(text) {
  return clean(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * "si" = the law sets distances; "no" = it sets none for this kind of spraying;
 * "prohibida" = this kind of spraying is banned; "Sin Ley" = the province has no law.
 */
function rule(text) {
  const value = fold(text);
  if (value === 'si') return 'distance';
  if (value === 'no') return 'none';
  if (value === 'prohibida') return 'banned';
  if (value === 'sin ley') return 'no_law';
  throw new Error(`distances: unknown restriction "${clean(text)}"`);
}

/** Metres, 0 for "sin restriccion", null when the cell is empty. */
function metres(text) {
  const value = fold(text).replace(/\./g, '');
  if (!value || value === 'sin ley') return null;
  if (value === 'sin restriccion') return 0;
  if (/^\d+$/.test(value)) return Number(value);
  throw new Error(`distances: unexpected distance "${clean(text)}"`);
}

function kind(record, { rule: ruleColumn, columns }) {
  const r = rule(record[ruleColumn]);
  const m = Object.fromEntries(CLASSES.map((c) => [c, null]));
  if (r === 'distance' || r === 'none') {
    for (const [column, classes] of columns) {
      const value = metres(record[column]);
      if (value !== null) for (const c of classes) m[c] = value;
    }
  }
  return { rule: r, m };
}

function yesNo(text) {
  const value = fold(text);
  return value === 'si' ? true : value === 'no' ? false : null;
}

/**
 * @param {object[]} records the CSV rows (lib/csv.mjs records(text))
 * @returns {{id, province, law, decree, aerial: {rule, m}, ground: {rule, m}, prescription}[]}
 */
export function createDistances(records) {
  const needed = ['provincia_id', 'provincia', 'unidad_medida', ...Object.values(COLUMNS).flatMap((k) => [k.rule, ...k.columns.map(([c]) => c)])];
  const missing = needed.filter((column) => records.length && !(column in records[0]));
  if (!records.length || missing.length) throw new Error(`distances: layout changed (missing ${missing.join(', ') || 'rows'})`);
  return records
    .filter((record) => clean(record.provincia_id))
    .map((record) => {
      const aerial = kind(record, COLUMNS.aerial);
      const ground = kind(record, COLUMNS.ground);
      const unit = fold(record.unidad_medida);
      const stated = [aerial, ground].some((k) => Object.values(k.m).some((v) => v));
      if (stated && unit !== 'metros') throw new Error(`distances: unit "${record.unidad_medida}" in ${record.provincia}`);
      return {
        id: clean(record.provincia_id),
        province: clean(record.provincia),
        law: clean(record.ley),
        decree: clean(record.decreto),
        aerial,
        ground,
        prescription: yesNo(record.receta_agronomica_obligatoria),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}
