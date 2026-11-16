import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCatalog, latestZip } from './catalog.mjs';

const product = (amm, over = {}) => ({
  'type produit': 'PPP',
  'numero AMM': amm,
  'nom produit': `P${amm}`,
  'seconds noms commerciaux': '',
  titulaire: 'HOLDER',
  'gamme usage': 'Professionnel',
  'Substances actives': 'soufre (Sulphur) 800.0 g/kg | soufre (Sulphur) 800.0 g/kg',
  fonctions: 'Fongicide | Acaricide',
  formulations: 'Granulé dispersable',
  'Etat d’autorisation': 'AUTORISE',
  ...over,
});

const files = {
  products: [
    product('2000001', { 'seconds noms commerciaux': 'ALT ONE | ALT TWO' }),
    product('2000002', { 'Etat d’autorisation': 'RETIRE' }),
    product('2000003', { 'Etat d’autorisation': 'RETIRE' }),
    product('2000004', { 'gamme usage': 'Amateur / emploi autorisé dans les jardins' }),
    product('2000005', { 'type produit': 'MFSC' }),
  ],
  usages: [
    { 'numero AMM': '2000002', 'date fin utilisation': '31/12/2026' },
    { 'numero AMM': '2000003', 'date fin utilisation': '31/03/2026' },
  ],
  hazards: [
    { 'numero AMM': '2000001', 'Libellé court': 'AT' },
    { 'numero AMM': '2000001', 'Libellé court': 'DA' },
    { 'numero AMM': '2000002', 'Libellé court': 'AA' },
  ],
  permits: [
    { 'N° Permis': '2150001', 'Etat d’autorisation': 'AUTORISE', 'N° AMM de référence français': '2000001', 'Nom du produit': 'IMPORTED', 'Détenteur PCP': 'IMPORTER' },
    { 'N° Permis': '2150002', 'Etat d’autorisation': 'RETIRE', 'N° AMM de référence français': '2000001', 'Nom du produit': 'OLD', 'Détenteur PCP': 'X' },
  ],
};

test('authorised professional products, withdrawn ones only during their use-up period', () => {
  const list = createCatalog(files, '2026-11-15', new Set(['2000001']));
  assert.deepEqual(
    list.map((e) => e.r),
    ['2000001', '2000002', '2150001']
  );
  assert.deepEqual(list[0], {
    r: '2000001',
    b: ['P2000001', 'ALT ONE', 'ALT TWO'],
    f: 'Granulé dispersable',
    a: 'soufre (Sulphur) 800.0 g/kg',
    h: 'HOLDER',
    c: 'Fongicide / Acaricide',
    t: 'DANGER',
    e: '',
    d: 1,
  });
  assert.equal(list[1].t, '');
  // A parallel-trade permit carries its reference product's label, drone approval included.
  assert.deepEqual({ ...list[2] }, { ...list[0], r: '2150001', b: ['IMPORTED'], h: 'IMPORTER' });
});

test('the newest weekly UTF-8 CSV zip is picked', () => {
  const url = latestZip({
    resources: [
      { url: 'https://x/decisionamm-intrant-format-csv-20261103-utf8.zip' },
      { url: 'https://x/decisionamm-intrant-format-csv-20261110-windows-1252.zip' },
      { url: 'https://x/decisionamm-intrant-format-csv-20261110-utf8.zip' },
      { url: 'https://x/decisionamm-intrant-format-xml-20261110.zip' },
    ],
  });
  assert.equal(url, 'https://x/decisionamm-intrant-format-csv-20261110-utf8.zip');
  assert.equal(latestZip({}), null);
});
