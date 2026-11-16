import { test } from 'node:test';
import assert from 'node:assert/strict';
import { records } from '../lib/csv.mjs';
import { createDistances, csvResource } from './distances.mjs';

const HEADER =
  'pais_id;pais;provincia_id;provincia;ley;anio;decreto;restriccion_aerea;restriccion_terrestre;unidad_medida;distancia_a_centros_urbanos_restriccion_aerea;restriccion_aerea_Clase_agroquimico_Ia_Ib;restriccion_aerea_Clase_agroquimico_Ia_Ib_II;restriccion_aerea_Clase_agroquimico_III_IV;restriccion_aerea_Clase_agroquimico_IV;distancia_a_centros_urbanos_restriccion_terrestre;restriccion_terrestre_Clase_agroquimico_Ia_Ib;restriccion_terrestre_Clase_agroquimico_Ia_Ib_II;restriccion_terrestre_Clase_agroquimico_III_IV;sanciones;receta_agronomica_obligatoria;sitio_ley;sitio_decreto';

// Rows as published (Formosa's aerial cell carries a line break inside quotes).
const CSV = [
  HEADER,
  '32;Argentina;14;Cordoba;Ley 9164;2004;Decreto 132/05;si;si;metros;;;1500;500;;;;;500;multas;si;;',
  '32;Argentina;34;Formosa;Ley 1163;1995;;si;si;metros;"3000 \n";;;;;;;500;100;multas;si;;',
  '32;Argentina;82;Santa Fe;Ley 11.273;1995;;si;si;metros;;3000;;500;;;500;;sin restriccion;multas;si;;',
  '32;Argentina;54;Misiones;Ley;;;prohibida;no;;;;;;;;;;;x;si;;',
  '32;Argentina;94;Tierra del Fuego;Sin Ley;Sin Ley;;Sin Ley;Sin Ley;Sin Ley;Sin Ley;;Sin Ley;Sin Ley;;;;;;;no;;',
].join('\r\n');

test('per class distances, specific columns over general ones, unstated classes left null', () => {
  const list = createDistances(records(CSV));
  assert.deepEqual(
    list.map((p) => p.id),
    ['14', '34', '54', '82', '94']
  );
  const [cordoba, formosa, misiones, santaFe, tdf] = list;
  assert.deepEqual(cordoba.aerial, { rule: 'distance', m: { Ia: 1500, Ib: 1500, II: 1500, III: 500, IV: 500 } });
  // Transcribed as the dataset has it (the law puts the 500 m on Ia/Ib/II).
  assert.deepEqual(cordoba.ground.m, { Ia: null, Ib: null, II: null, III: 500, IV: 500 });
  assert.deepEqual(formosa.aerial.m, { Ia: 3000, Ib: 3000, II: 3000, III: 3000, IV: 3000 });
  assert.deepEqual(formosa.ground.m, { Ia: 500, Ib: 500, II: 500, III: 100, IV: 100 });
  assert.deepEqual(santaFe.aerial.m, { Ia: 3000, Ib: 3000, II: null, III: 500, IV: 500 });
  assert.deepEqual(santaFe.ground.m, { Ia: 500, Ib: 500, II: null, III: 0, IV: 0 });
  assert.equal(misiones.aerial.rule, 'banned');
  assert.equal(misiones.ground.rule, 'none');
  assert.equal(tdf.aerial.rule, 'no_law');
  assert.equal(tdf.prescription, false);
  assert.equal(cordoba.prescription, true);
  assert.equal(santaFe.law, 'Ley 11.273');
});

test('an unknown cell or a changed layout fails instead of guessing', () => {
  assert.throws(() => createDistances(records(CSV.replace(';1500;500;', ';1500 m;500;'))), /unexpected distance/);
  assert.throws(() => createDistances(records(CSV.replace(';prohibida;', ';quizas;'))), /unknown restriction/);
  assert.throws(() => createDistances(records(CSV.replace('restriccion_terrestre_Clase_agroquimico_III_IV', 'x'))), /layout changed/);
  assert.throws(() => createDistances([]), /layout changed/);
});

test('CSV resource resolved from the CKAN package', () => {
  const pkg = { result: { resources: [{ url: 'http://pic.int/' }, { url: 'https://x/download/regulacion_provincial_fitosanitarios.csv', last_modified: '2019-01-23T12:34:56' }] } };
  assert.deepEqual(csvResource(pkg), { url: 'https://x/download/regulacion_provincial_fitosanitarios.csv', modified: '2019-01-23' });
  assert.equal(csvResource({ result: { resources: [] } }), null);
});
