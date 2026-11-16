import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCatalog, latestCsv, repair, substances } from './catalog.mjs';

const row = (nr, over = {}) => ({
  num_registrazione: nr,
  denominazione_prodotto: `P${nr}`,
  ragione_sociale: 'HOLDER',
  data_scadenza_autorizzazione: '31/12/2030',
  attivita: 'INSETTICIDA-ACARICIDA',
  descrizione_formulazione: 'CONCENTRATO SOLUBILE',
  sostanze_attive: 'MCPA|2,4-D',
  'contenuto_per_100g_di_prodotto': '25.0 g|29.0 g',
  PFnPO: 'NO',
  PFnPE: 'NO',
  stato_amministrativo: 'Autorizzato',
  ...over,
});

test('valid professional products only', () => {
  const list = createCatalog(
    [
      row('000017'),
      row('000018', { stato_amministrativo: 'Revocato' }),
      row('000019', { stato_amministrativo: 'Scaduto' }),
      row('000020', { data_scadenza_autorizzazione: '01/01/2026' }),
      row('000021', { PFnPO: 'SI' }),
      row('000022', { stato_amministrativo: 'Autorizzato con procedura zonale', data_scadenza_autorizzazione: '-' }),
    ],
    '2026-11-15'
  );
  assert.deepEqual(
    list.map((e) => e.r),
    ['000017', '000022']
  );
  assert.deepEqual(list[0], {
    r: '000017',
    b: ['P000017'],
    f: 'CONCENTRATO SOLUBILE',
    a: 'MCPA (25.0 g/100 g); 2,4-D (29.0 g/100 g)',
    h: 'HOLDER',
    c: 'Insetticida / Acaricida',
    t: '',
    e: '',
  });
});

test('helpers', () => {
  assert.equal(substances('-', '-'), '');
  assert.equal(substances('SULPHUR', '-'), 'SULPHUR');
  assert.equal(repair('COÃ\u0096PERATIEF'), 'COÖPERATIEF');
  assert.equal(repair('SÃO'), 'SÃO');
  assert.equal(
    latestCsv('<a href="/sites/default/files/opendata/PROD_FTS_6_20261102.csv">a</a><a href="https://www.dati.salute.gov.it/sites/default/files/opendata/PROD_FTS_6_20261109.csv">b</a>'),
    'https://www.dati.salute.gov.it/sites/default/files/opendata/PROD_FTS_6_20261109.csv'
  );
});
