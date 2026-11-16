// Turns COFEPRIS's "Consulta de Registros Sanitarios de Plaguicidas" (siipris03) into the
// app's product catalog: one entry per agricultural pesticide registration that is valid
// today. The registry has no download, no API and a fixed page of 20 rows, so the build
// pages through the HTML; everything here is pure and works on the page text.

/** The public search form (plaguicidas = TipoRegPlafest 1, empty search = every registration). */
export const SEARCH_PAGE = 'https://siipris03.cofepris.gob.mx/Resoluciones/Consultas/ConWebRegPlaguicida.asp';

/** The registry's fixed page size: no parameter changes it. */
export const PAGE_SIZE = 20;

/** URL of the page whose first row is registration number `offset + 1`. */
export function pageUrl(offset) {
  return `${SEARCH_PAGE}?TipoRegPlafest=1&TxtBuscar=&button=Buscar&MM_Buscar=FrmBuscar&offset=${offset}`;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decode(text) {
  return String(text ?? '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, code) => {
      if (code[0] === '#') {
        const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : all;
      }
      return ENTITIES[code.toLowerCase()] ?? all;
    })
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const LABELS = {
  Registro: 'registro',
  Empresa: 'empresa',
  'Ingrediente activo': 'ingrediente',
  'Categoría toxicológica': 'categoria',
  'Nombre comercial': 'nombre',
  Usos: 'usos',
  Vigencia: 'vigencia',
};

/**
 * One results page → the total the registry reports and the rows of its "Detalle del registro"
 * dialogs. Throws when the page does not look like a results page (the layout changed).
 */
export function parsePage(html) {
  const text = String(html);
  const count = /Registros\s+(\d+)\s+a\s+(\d+)\s+de\s+(\d+)/.exec(text);
  if (!count) throw new Error('No "Registros x a y de n" on the page: layout changed?');
  const rows = [];
  for (const block of text.split('class="modal-body"').slice(1)) {
    const body = block.split('</p>')[0];
    const row = {};
    for (const m of body.matchAll(/<strong>\s*([^<:]+?)\s*:\s*<\/strong>\s*<br\s*\/?>([\s\S]*?)(?=<strong>|$)/g)) {
      const key = LABELS[m[1].trim()];
      if (key) row[key] = decode(m[2]);
    }
    if (!row.registro) throw new Error('A detail dialog without "Registro": layout changed?');
    rows.push(row);
  }
  return { first: Number(count[1]), last: Number(count[2]), total: Number(count[3]), rows };
}

/**
 * Registration numbers look like RSCO-<use>-…, RSCO-MEZC-<use>-… (mixtures) or
 * RSCO-<use>-MEZC-…. COFEPRIS publishes no list of the use codes. Read against the "Usos"
 * text of every registration (2026-11-16), URB (urban pest control), DOM (household), PEC
 * (livestock), IND (industrial), USP (public health), JAR (home gardens) and BIO (material
 * preservation biocides) never hold a crop use, so a number carrying one of them is left out.
 * The other codes (INAC, HEDE, FUNG…) do NOT guarantee a farm product: INAC also holds
 * household insecticides, and many mixtures carry a number instead of a use code. So a
 * registration is kept only when its "Usos" text names a farm use as well (see isAgricultural).
 */
export const NON_AGRICULTURAL_CODES = new Set(['URB', 'DOM', 'PEC', 'IND', 'USP', 'JAR', 'JARD', 'BIO']);

/** The letter codes before the first number: "RSCO-MEZC-HEDE-1297-…" → ["RSCO","MEZC","HEDE"]. */
function prefixCodes(registro) {
  const codes = [];
  for (const part of String(registro).toUpperCase().split(/[-\s]+/)) {
    if (!/^[A-Z]+$/.test(part)) break;
    codes.push(part);
  }
  return codes;
}

/** "RSCO-MEZC-HEDE-1297-…" → "HEDE"; "RSCO-INAC-0103E-…" → "INAC"; "" without one. */
export function useCode(registro) {
  return prefixCodes(registro).find((code, i) => i > 0 && code !== 'MEZC') ?? '';
}

/**
 * Not for sale to growers: technical-grade material for formulating plants (with the
 * registry's own typos: "FORMUALDORAS", "PALANTAS"…), product made only for export, or the
 * technical's impurity profile.
 */
export function isTechnical(usos) {
  return /FORMU[A-Z]*D[A-Z]*S?\s+(DE\s+)?PLAGU|P?A?LANTAS?\s+FORMU|FORMULADORAS?\s+EXCLUSIVAMENTE|EXPORTACI[OÓ]N|IMPUREZAS/i.test(usos);
}

/** Household, urban, garden, animal or industrial wording: those are other registrations. */
const OTHER_USE = /USO\s+(DOM[EÉ]STICO|URBANO)|EN\s+JARDINER[IÍ]A|PERROS|GATOS|INSTALACIONES\s+AV[IÍ]COLAS/i;

/**
 * A use on crops, pastures, seed, nurseries, field soil, crop traps or stored grain, or an
 * adjuvant for tank mixes ("mezcla con herbicidas…").
 */
const FARM_USE =
  /\bCU?L?TIVOS?\b|POTREROS?|PASTIZAL|GRANOS?\b|SEMILLAS?|VIVEROS?|ALM[AÁ]CIGOS?|SIEMBRA|FOLIAR|AGR[IÍ]COLA|FORESTAL|PLANTACI[OÓ]N|HUERT|FRUTALES|ALGOD|TABACO|MEZCLA\s+(DE\s+TANQUE\s+)?CON\s+(HERBICIDAS|INSECTICIDAS|FUNGICIDAS|ACARICIDAS|PLAGUICIDAS)/i;

/** Agricultural registration: no non-farm use code, not technical, and the uses name a farm use. */
export function isAgricultural(registro, usos) {
  if (prefixCodes(registro).some((code) => NON_AGRICULTURAL_CODES.has(code))) return false;
  if (isTechnical(usos) || OTHER_USE.test(usos)) return false;
  return FARM_USE.test(usos);
}

/** Spanish function names of the use codes, shown as `c`. */
const FUNCTION = {
  INAC: 'Insecticida',
  HEDE: 'Herbicida',
  FUNG: 'Fungicida',
  ACAR: 'Acaricida',
  NEMA: 'Nematicida',
  BACT: 'Bactericida',
  MOLU: 'Molusquicida',
  RODE: 'Rodenticida',
  FUMI: 'Fumigante',
  COAD: 'Coadyuvante',
  REGU: 'Regulador de crecimiento',
  ATRA: 'Atrayente',
  DEFO: 'Defoliante',
  REP: 'Repelente',
};

/**
 * A mixture numbered without a use code ("RSCO-MEZC-1397-…") still starts its number with the
 * class of its ingredients: in the registry 11xx sits under INAC, 12xx under HEDE and 13xx
 * under FUNG (01xx/02xx/03xx for single ingredients). Inferred from the data, not published.
 */
const CLASS_DIGITS = { '01': 'Insecticida', '02': 'Herbicida', '03': 'Fungicida', 11: 'Insecticida', 12: 'Herbicida', 13: 'Fungicida' };

/** Function of the product: its use code, else the class digits of a numbered mixture. */
export function productFunction(registro) {
  const use = useCode(registro);
  if (use) return FUNCTION[use] ?? '';
  const m = /^[A-Z\s-]*?-(\d{2})\d/.exec(String(registro).toUpperCase());
  return (m && CLASS_DIGITS[m[1]]) ?? '';
}

/** "IMIDACLOPRID+ DELTAMETRINA" → "IMIDACLOPRID; DELTAMETRINA". */
export function ingredients(text) {
  return String(text ?? '')
    .split('+')
    .map((s) => s.trim())
    .filter(Boolean)
    .join('; ');
}

/**
 * "4" → "4"; "IV" → "IV"; anything else "". The registry mixes the NOM-232-SSA1-2009 scale
 * (1–5) with the old one (I–IV) and keeps whatever the registration was issued with.
 */
export function category(text) {
  const value = String(text ?? '').trim().toUpperCase();
  return /^[1-5]$/.test(value) || /^(I|II|III|IV)$/.test(value) ? value : '';
}

const MONTHS = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

/**
 * "INDETERMINADA" → "indefinite"; "dd/mm/yyyy", "30 DE MARZO DE 2016" or "yyyy-mm-dd" →
 * "yyyy-mm-dd"; "Cancelado", "Revocado", empty or malformed → "" (not valid).
 */
export function validity(text) {
  const value = String(text ?? '').trim().toUpperCase();
  if (/^INDETERMINAD[AO]$/.test(value)) return 'indefinite';
  const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (m) return iso(m[3], m[2], m[1]);
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (m) return iso(m[1], m[2], m[3]);
  m = /^(\d{1,2})\s+(?:DE\s+)?([A-Z]+)\s+(?:DE(?:L)?\s+)?(\d{4})$/.exec(value);
  const month = m ? MONTHS.indexOf(m[2]) + 1 : 0;
  return month ? iso(m[3], month, m[1]) : '';
}

/**
 * The "usos" text says the product may be applied by drone. Only explicit wording counts
 * (DRON, DRONE, VANT, "aeronave no tripulada", RPAS); an aerial use without it does not. The
 * registry cuts long texts (they end in "*****"), so a missing mention proves nothing.
 */
export function mentionsDrone(usos) {
  return /\bDRON(?:E|ES)?\b|\bVANTS?\b|\bRPAS\b|AERONAVES? NO TRIPULADAS?|VEH[IÍ]CULOS? A[EÉ]REOS? NO TRIPULADOS?/i.test(usos);
}

/** "LAFAM / GLIFOPAAK / LABOR 360" → ["LAFAM", "GLIFOPAAK", "LABOR 360"]. */
export function tradeNames(text) {
  return [...new Set(String(text ?? '').split(/\s+\/\s+/).map((s) => s.trim()).filter(Boolean))];
}

/**
 * "…-019-96.0" → "96.0 %". The last part of the number is the active content in % (w/w);
 * the registry gives no other concentration. Only read for a single active ingredient.
 */
export function content(registro) {
  const m = /-(\d{1,3}\.\d+)$/.exec(String(registro));
  if (!m) return '';
  const value = Number(m[1]);
  return value > 0 && value <= 100 ? `${m[1]} %` : '';
}

/**
 * The catalog entries in the shared compact shape: r RSCO registration, b trade names,
 * f formulation (not in the registry: ""), a active ingredients, h holder, c function from the
 * use code, t toxicological category as published (1–5 or I–IV), e "", d 1 when the uses
 * mention a drone. Valid = "INDETERMINADA" or a date ≥ today (empty, cancelled, revoked or
 * unreadable = not valid); agricultural = see isAgricultural.
 *
 * @param {object[]} rows parsed detail rows of every page
 * @param {string} today ISO date
 */
export function createCatalog(rows, today) {
  const byNumber = new Map();
  for (const row of rows) {
    const r = String(row.registro ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
    if (!r || !isAgricultural(r, row.usos ?? '')) continue;
    const until = validity(row.vigencia);
    if (!until || (until !== 'indefinite' && until < today)) continue;
    const active = ingredients(row.ingrediente);
    const single = active && !/[/;]| Y /.test(active);
    const entry = {
      r,
      b: tradeNames(row.nombre),
      f: '',
      a: single && content(r) ? `${active} (${content(r)})` : active,
      h: String(row.empresa ?? '').trim(),
      c: productFunction(r),
      t: category(row.categoria),
      e: '',
    };
    if (mentionsDrone(row.usos ?? '')) entry.d = 1;
    const seen = byNumber.get(r);
    if (seen) seen.b = [...new Set([...seen.b, ...entry.b])];
    else byNumber.set(r, entry);
  }
  return [...byNumber.values()].filter((e) => e.b.length).sort((a, b) => a.r.localeCompare(b.r));
}
