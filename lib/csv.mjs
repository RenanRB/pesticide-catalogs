// Delimited text (";" in the French and Italian files) with RFC 4180 quoting, no dependencies.

/** Rows of cells; a quoted cell may hold the delimiter, doubled quotes and line breaks. */
export function parseCsv(text, delimiter = ';') {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c !== '')) rows.push(row);
  return rows;
}

/**
 * Rows as objects keyed by the trimmed header. A repeated header name keeps its FIRST
 * column (E-Phy repeats "mentions autorisees"); the others are reachable by index.
 */
export function records(text, delimiter = ';') {
  const [header = [], ...rows] = parseCsv(text, delimiter);
  const keys = header.map((h) => h.trim());
  return rows.map((cells) => {
    const record = {};
    keys.forEach((key, i) => {
      if (key && !(key in record)) record[key] = (cells[i] ?? '').trim();
    });
    return record;
  });
}

/** "dd/mm/yyyy" → "yyyy-mm-dd" ("" when it is not a date). */
export function isoDate(text) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(text).trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}
