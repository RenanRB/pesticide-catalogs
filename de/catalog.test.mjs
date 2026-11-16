import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCatalog, standDate } from './catalog.mjs';

// Invented rows in the PSM-API's shape (field names and codes as the API returns them).
const tables = () => ({
  stand: [{ datum: '2026-11-04T07:00:48Z' }],
  mittel: [
    { kennr: '024459-00', mittelname: 'Folpan 80 WDG', formulierung_art: 'WG', zul_ende: '2028-02-14T23:00:00Z' },
    { kennr: '024459-60', mittelname: 'FLOVINE', formulierung_art: 'WG', zul_ende: '2028-02-14T23:00:00Z' },
    { kennr: '006867-63', mittelname: 'Garten Pilzfrei', formulierung_art: 'AL', zul_ende: '2027-08-14T22:00:00Z' },
    { kennr: '00A480-00', mittelname: 'Belanty', formulierung_art: 'SC', zul_ende: '2030-01-01T00:00:00Z' },
  ],
  mittel_abgelaufen: [
    { kennr: '007547-00', mittelname: 'Kumar', formulierung_art: 'SP', zul_ende: '2026-08-30T22:00:00Z', aufbrauchfrist: '2028-02-28T23:00:00Z' },
    { kennr: '033401-60', mittelname: 'Rapsan 500 SC', formulierung_art: 'SC', zul_ende: '2020-10-30T23:00:00Z', aufbrauchfrist: '2022-04-29T22:00:00Z' },
  ],
  parallelimport_gueltig: [
    { pi_referenz_kennr: '024459-00', pi_kennziffer: '011', pi_mittelname: 'FOLPET IMPORT', importeur_txt: 'Agrimex UK Ltd.', gueltig: '2027-12-14T23:00:00Z', mittelname: 'Folpan 80 WDG' },
    { pi_referenz_kennr: '024459-00', pi_kennziffer: '012', pi_mittelname: 'OLD IMPORT', importeur_txt: 'X', gueltig: '2025-01-01T00:00:00Z', mittelname: 'Folpan 80 WDG' },
  ],
  wirkstoff: [
    { wirknr: '0400', wirkstoffname: 'Folpet' },
    { wirknr: '0500', wirkstoffname: 'Kaliumhydrogencarbonat' },
    { wirknr: '0600', wirkstoffname: 'Fluopyram' },
  ],
  wirkstoff_gehalt: [
    { kennr: '024459-00', wirknr: '0400', gehalt_rein: 0, gehalt_rein_grundstruktur: 800, gehalt_einheit: 'GK' },
    { kennr: '006867-63', wirknr: '0500', gehalt_rein: 4.99999999, gehalt_rein_grundstruktur: 0, gehalt_einheit: 'GL' },
    { kennr: '00A480-00', wirknr: '0600', gehalt_rein: 200, gehalt_rein_grundstruktur: 0, gehalt_einheit: 'GL' },
    { kennr: '007547-00', wirknr: '0500', gehalt_rein: 850, gehalt_rein_grundstruktur: 0, gehalt_einheit: 'GK' },
  ],
  antrag: [
    { kennr: '024459-00', antragnr: '01', antragsteller_nr: 2 },
    { kennr: '024459-00', antragnr: '00', antragsteller_nr: 1 },
    { kennr: '00A480-00', antragnr: '00', antragsteller_nr: 2 },
  ],
  adresse: [
    { adresse_nr: 1, firmenname: 'ADAMA Deutschland GmbH' },
    { adresse_nr: 2, firmenname: 'BASF SE,' },
  ],
  ghs_signalwoerter: [
    { kennr: '024459-00', signalwort: 'S2' },
    { kennr: '00A480-00', signalwort: 'S1' },
  ],
  mittel_wirkbereich: [
    { kennr: '024459-00', wirkungsbereich: 'F' },
    { kennr: '00A480-00', wirkungsbereich: 'F' },
    { kennr: '00A480-00', wirkungsbereich: 'I' },
  ],
  awg: [
    { kennr: '024459-00', anwenderkategorie: 'Beruflich' },
    { kennr: '006867-63', anwenderkategorie: 'Nichtberuflich' },
    { kennr: '00A480-00', anwenderkategorie: 'Beruflich' },
    { kennr: '00A480-00', anwenderkategorie: 'Nichtberuflich' },
  ],
  kode: [
    { kode: 'WG', kodeliste: 22, sprache: 'DE', kodetext: 'Wasserdispergierbares Granulat' },
    { kode: 'WG', kodeliste: 22, sprache: 'GB', kodetext: 'Water dispersible granules' },
    { kode: 'SC', kodeliste: 22, sprache: 'DE', kodetext: 'Suspensionskonzentrat' },
    { kode: 'SC', kodeliste: 25, sprache: 'DE', kodetext: 'Stück je 50 m³' },
    { kode: 'GK', kodeliste: 25, sprache: 'DE', kodetext: 'g/kg' },
    { kode: 'GL', kodeliste: 25, sprache: 'DE', kodetext: 'g/l' },
    { kode: 'GL', kodeliste: 22, sprache: 'DE', kodetext: 'Emulgierbares Gel' },
    { kode: 'F', kodeliste: 21, sprache: 'DE', kodetext: 'Fungizid' },
    { kode: 'I', kodeliste: 21, sprache: 'DE', kodetext: 'Insektizid' },
  ],
});

const byNr = (list) => Object.fromEntries(list.map((e) => [e.r, e]));

test('an authorised professional product carries its label', () => {
  const c = byNr(createCatalog(tables(), '2026-11-16', new Set(['024459-00'])));
  assert.deepEqual(c['024459-00'], {
    r: '024459-00',
    b: ['Folpan 80 WDG'],
    f: 'Wasserdispergierbares Granulat',
    a: 'Folpet 800 g/kg',
    h: 'ADAMA Deutschland GmbH',
    c: 'Fungizid',
    t: 'DANGER',
    e: '',
    d: 1,
  });
  assert.equal(c['00A480-00'].t, 'WARNING');
  assert.equal(c['00A480-00'].c, 'Fungizid, Insektizid');
  assert.equal(c['00A480-00'].h, 'BASF SE');
  assert.equal(c['00A480-00'].d, undefined);
});

test("a distributor's number takes the base product's missing rows, but never its drone flag", () => {
  const c = byNr(createCatalog(tables(), '2026-11-16', new Set(['024459-00'])));
  assert.deepEqual(c['024459-60'], {
    r: '024459-60',
    b: ['FLOVINE'],
    f: 'Wasserdispergierbares Granulat',
    a: 'Folpet 800 g/kg',
    h: 'ADAMA Deutschland GmbH',
    c: 'Fungizid',
    t: 'DANGER',
    e: '',
  });
});

test('home-and-garden-only products are left out; mixed ones stay', () => {
  const c = byNr(createCatalog(tables(), '2026-11-16'));
  assert.equal(c['006867-63'], undefined);
  assert.ok(c['00A480-00']);
});

test('an expired product stays only during its use-up period', () => {
  const c = byNr(createCatalog(tables(), '2026-11-16'));
  assert.equal(c['007547-00'].a, 'Kaliumhydrogencarbonat 850 g/kg');
  assert.equal(c['007547-00'].f, 'SP');
  assert.equal(c['033401-60'], undefined);
});

test('a valid parallel-trade permit is its own entry with the reference label and the importer', () => {
  const c = byNr(createCatalog(tables(), '2026-11-16', new Set(['024459-00'])));
  assert.deepEqual(c['024459-00/011'], {
    r: '024459-00/011',
    b: ['FOLPET IMPORT', 'Folpan 80 WDG'],
    f: 'Wasserdispergierbares Granulat',
    a: 'Folpet 800 g/kg',
    h: 'Agrimex UK Ltd.',
    c: 'Fungizid',
    t: 'DANGER',
    e: '',
  });
  assert.equal(c['024459-00/012'], undefined);
});

test('content is rounded and units come from the unit code list only', () => {
  const t = tables();
  t.awg = t.awg.filter((a) => a.kennr !== '006867-63');
  const c = byNr(createCatalog(t, '2026-11-16'));
  assert.equal(c['006867-63'].a, 'Kaliumhydrogencarbonat 5 g/l');
});

test('a table that lost a column fails instead of publishing a broken list', () => {
  const t = tables();
  t.mittel = t.mittel.map(({ zul_ende: _gone, ...rest }) => rest);
  assert.throws(() => createCatalog(t, '2026-11-16'), /mittel/);
});

test('the BVL data date', () => {
  assert.equal(standDate(tables().stand), '2026-11-04');
});
