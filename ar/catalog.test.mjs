import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { activeIngredients, allRows, aptitudes, aptitudeUrl, createCatalog, functionsById, productsUrl, toxClass } from './catalog.mjs';

const row = (id, numeroInscripcion, over = {}) => ({
  id,
  numeroInscripcion,
  marca: `BRAND ${id}`,
  nombreFirma: 'HOLDER  S.A.',
  claseToxicologica: 'III',
  sustanciasActivas: 'ATRAZINA <b>90%</b>',
  ...over,
});

const hal = (rows, totalElements = rows.length, totalPages = 1) => ({
  _embedded: { productosAgroquimicosFormulados: rows },
  page: { size: 2000, totalElements, totalPages, number: 0 },
});

test('entries in the shared shape, functions joined by id, drone flag only for the VANT list', () => {
  const rows = [
    row(3, '42881', { marca: 'SEPHIRO SUPER', claseToxicologica: 'II', sustanciasActivas: 'CLORANTRANILIPROLE <b>10%</b>, LAMBDA-CIALOTRINA <b>5%</b>' }),
    row(1, '38954', { claseToxicologica: '5' }),
    row(2, '42811 BIO', { claseToxicologica: null }),
  ];
  const functions = functionsById([
    { name: 'Insecticida', rows: [rows[0], row(99, '1')] },
    { name: 'Acaricida', rows: [rows[0]] },
  ]);
  const list = createCatalog(rows, functions, new Set(['38954']));
  assert.deepEqual(
    list.map((e) => e.r),
    ['38954', '42811 BIO', '42881']
  );
  assert.deepEqual(list[2], {
    r: '42881',
    b: ['SEPHIRO SUPER'],
    f: '',
    a: 'CLORANTRANILIPROLE 10%; LAMBDA-CIALOTRINA 5%',
    h: 'HOLDER S.A.',
    c: 'Acaricida / Insecticida',
    t: 'II',
    e: '',
  });
  assert.equal(list[0].d, 1);
  assert.equal(list[0].t, 'III');
  assert.equal(list[0].c, '');
  assert.equal(list[1].t, '');
  assert.equal('d' in list[1], false);
});

test('active ingredients split after each closing tag, never on the commas inside names and contents', () => {
  assert.equal(activeIngredients('2,4 D <b>30%</b>'), '2,4 D 30%');
  assert.equal(activeIngredients('PARAQUAT DICLORURO <b>27,6%</b>, 2,4 D <b>1,5%</b>'), 'PARAQUAT DICLORURO 27,6%; 2,4 D 1,5%');
  assert.equal(activeIngredients(null), '');
});

test('toxicological classes: old WHO classes kept, new 1–5 scheme by band, unknown values empty', () => {
  assert.deepEqual(
    ['Ia', 'Ib', 'II', 'III', 'IV', '1', '2', '3', '4', '5', 'No Clasificado', 'S/D', null, ' III '].map(toxClass),
    ['Ia', 'Ib', 'II', 'III', 'IV', 'Ia', 'Ib', 'II', 'III', 'III', '', '', '', 'III']
  );
});

test('paged answers must add up to the announced total with no repeated id', () => {
  assert.equal(allRows([hal([row(1, '1')], 2, 2), hal([row(2, '2')], 2, 2)]).length, 2);
  assert.throws(() => allRows([hal([row(1, '1')], 3, 2), hal([row(2, '2')], 3, 2)]), /announced 3/);
  assert.throws(() => allRows([hal([row(1, '1')], 2, 2), hal([row(1, '1')], 2, 2)]), /repeated/);
  assert.throws(() => allRows([{ error: 'x' }]), /unexpected/);
});

test('function list without the tree nodes', () => {
  const list = Array.from({ length: 12 }, (_, i) => ({ id: i, descripcion: `F${i}`, enUso: true }));
  const json = { _embedded: { nomencladoresDeProductosRU: [...list, { id: 95, descripcion: 'Sustancias Activas', enUso: true }, { id: 96, descripcion: 'Formulados', enUso: true }] } };
  assert.equal(aptitudes(json).length, 12);
  assert.throws(() => aptitudes({ _embedded: { nomencladoresDeProductosRU: list.slice(0, 3) } }), /only 3/);
});

test('URLs sort by a unique key so pages never overlap', () => {
  assert.match(productsUrl(2), /publicSearchProductosFormuladosDTO\?page=2&size=2000&sort=id,asc$/);
  assert.match(aptitudeUrl(170, 1), /aptitudes=170&page=1&size=2000&sort=id,asc$/);
});

test('the VANT list holds 14 distinct registration numbers', () => {
  const vant = JSON.parse(readFileSync(new URL('./drone-vant.json', import.meta.url), 'utf8'));
  assert.equal(new Set(vant.registrations).size, 14);
  assert.deepEqual(vant.products.map((p) => p.r), vant.registrations);
});
