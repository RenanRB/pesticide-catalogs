import { test } from 'node:test';
import assert from 'node:assert/strict';
import { category, content, createCatalog, ingredients, isAgricultural, productFunction, isTechnical, mentionsDrone, pageUrl, parsePage, tradeNames, useCode, validity } from './catalog.mjs';

const dialog = (fields) => `
  <div class="modal-body">
    <p align="left">
      ${Object.entries(fields)
        .map(([label, value]) => `<strong>${label}: </strong><br>${value}<br><br>`)
        .join('\n')}
    </p>
  </div>
  <div class="modal-footer"></div>`;

const page = `<span style="float: right;">Registros 1 a 20 de 11701</span>
  <table><tr><th><small>RSCO-HEDE-0230-X0229-013-41.00</small></td></tr></table>
  ${dialog({
    Registro: 'RSCO-HEDE-0230-X0229-013-41.00',
    Empresa: 'AGRICULTURA NACIONAL, S.A. DE C.V.',
    'Ingrediente activo': 'SAL ISOPROPILAMINA DE GLIFOSATO',
    'Categoría toxicológica': '5',
    'Nombre comercial': 'LAFAM / GLIFOPAAK / LABOR 360',
    Usos: 'APLICACIÓN POST-EMERGENCIA A LA MALEZA EN LOS CULTIVOS DE: ACELGA &amp; VID.****',
    Vigencia: '04/04/2029',
  })}`;

test('parses a results page', () => {
  const parsed = parsePage(page);
  assert.equal(parsed.total, 11701);
  assert.equal(parsed.first, 1);
  assert.deepEqual(parsed.rows, [
    {
      registro: 'RSCO-HEDE-0230-X0229-013-41.00',
      empresa: 'AGRICULTURA NACIONAL, S.A. DE C.V.',
      ingrediente: 'SAL ISOPROPILAMINA DE GLIFOSATO',
      categoria: '5',
      nombre: 'LAFAM / GLIFOPAAK / LABOR 360',
      usos: 'APLICACIÓN POST-EMERGENCIA A LA MALEZA EN LOS CULTIVOS DE: ACELGA & VID.****',
      vigencia: '04/04/2029',
    },
  ]);
  assert.throws(() => parsePage('<html>error</html>'), /layout changed/);
  assert.match(pageUrl(40), /TipoRegPlafest=1&.*&offset=40$/);
});

const row = (registro, over = {}) => ({
  registro,
  empresa: 'HOLDER, S.A. DE C.V.',
  ingrediente: 'CLORPIRIFOS ETIL',
  categoria: 'III',
  nombre: `NAME ${registro.slice(-4)}`,
  usos: 'APLICACIÓN FOLIAR EN LOS CULTIVOS DE: MAÍZ Y SORGO.*****',
  vigencia: 'INDETERMINADA',
  ...over,
});

test('valid agricultural registrations only', () => {
  const list = createCatalog(
    [
      row('RSCO-INAC-0103-301-002-044'),
      row('RSCO-INAC-0104-301-002-045', { vigencia: 'Cancelado' }),
      row('RSCO-INAC-0105-301-002-046', { vigencia: 'Revocado' }),
      row('RSCO-INAC-0106-301-002-047', { vigencia: '01/01/2026' }),
      row('RSCO-INAC-0107-301-002-048', { vigencia: '20' }),
      row('RSCO-URB-INAC-0103-301-002-044'),
      row('RSCO-DOM-INAC-0103-301-002-044'),
      row('RSCO-PEC-INAC-0103-301-002-044'),
      row('RSCO-IND-INAC-0103-301-002-044'),
      row('RSCO-FUNG-0398F-X0642-019-97.0', { usos: 'PARA USO EXCLUSIVO EN PLANTAS FORMULADORAS DE PLAGUICIDAS.*****' }),
      row('RSCO-MEZC-HEDE-1297-X0088-420-62.33', {
        ingrediente: 'PICLORAM / 2,4-D',
        categoria: '4',
        nombre: 'PASTAR XT',
        usos: 'APLICACIÓN FOLIAR AÉREA CON DRON EN EL CULTIVO DE: PASTIZALES ESTABLECIDOS EN POTREROS',
        vigencia: '19/02/2030',
      }),
    ],
    '2026-11-16'
  );
  assert.deepEqual(
    list.map((e) => e.r),
    ['RSCO-INAC-0103-301-002-044', 'RSCO-MEZC-HEDE-1297-X0088-420-62.33']
  );
  assert.deepEqual(list[1], {
    r: 'RSCO-MEZC-HEDE-1297-X0088-420-62.33',
    b: ['PASTAR XT'],
    f: '',
    a: 'PICLORAM / 2,4-D',
    h: 'HOLDER, S.A. DE C.V.',
    c: 'Herbicida',
    t: '4',
    e: '',
    d: 1,
  });
  assert.equal(list[0].c, 'Insecticida');
  assert.equal(list[0].t, 'III');
  assert.equal(list[0].d, undefined);
});

test('a number listed twice keeps every trade name', () => {
  const list = createCatalog([row('RSCO-HEDE-0230-X0229-013-41.00', { nombre: 'A / B' }), row('RSCO-HEDE-0230-X0229-013-41.00', { nombre: 'B / C' })], '2026-11-16');
  assert.equal(list.length, 1);
  assert.deepEqual(list[0].b, ['A', 'B', 'C']);
  assert.equal(list[0].a, 'CLORPIRIFOS ETIL (41.00 %)');
});

test('helpers', () => {
  assert.equal(useCode('RSCO-INAC-0103E-X0725-019-96.0'), 'INAC');
  assert.equal(useCode('RSCO-MEZC-HEDE-1297-X0088-420-62.33'), 'HEDE');
  assert.equal(useCode('RSCO-MEZC-1219-301-013-026'), '');
  assert.equal(useCode('RSCO-URB MEZC-1101-X0002-064-26.93'), 'URB');
  assert.equal(validity('30 DE MARZO DE 2016'), '2016-03-30');
  assert.equal(validity('9 SEPTIEMBRE 2031'), '2031-09-09');
  assert.equal(validity('2030-01-31'), '2030-01-31');
  assert.equal(validity(''), '');
  assert.equal(validity('INDETERMINADA'), 'indefinite');
  assert.equal(validity('4/4/2029'), '2029-04-04');
  assert.equal(validity('Cancelado'), '');
  assert.equal(validity('20'), '');
  assert.equal(category(' 2 '), '2');
  assert.equal(category('iv'), 'IV');
  assert.equal(category('6'), '');
  assert.equal(category('V'), '');
  assert.equal(content('RSCO-HEDE-0230-X0229-013-41.00'), '41.00 %');
  assert.equal(content('RSCO-INAC-0103-301-002-044'), '');
  assert.equal(content('RSCO-INAC-0103-301-002-'), '');
  assert.deepEqual(tradeNames('LAFAM / GLIFOPAAK / LAFAM'), ['LAFAM', 'GLIFOPAAK']);
  assert.ok(isTechnical('PARA USO EXCLUSIVO EN PLANTAS FORMULADORAS DE PLAGUICIDAS.*****'));
  assert.ok(isTechnical('PARA USO EXCLUSIVO EN PLANTAS FORMUALDORAS DE PLAGUICIDAS. ***'));
  assert.ok(isTechnical('USO EXCLUSIVO EN PALANTAS FORMULADORAS DE PLAGUICIDAS*****'));
  assert.ok(isTechnical('PLANTAS FORMULADORAS EXCLUSIVAMENTE.***'));
  assert.ok(isTechnical('FORMULACION EXCLUSIVAMENTE PARA EXPORTACION.'));
  assert.ok(!isTechnical('APLICACIÓN FOLIAR EN EL CULTIVO DE: MAÍZ'));
  assert.ok(mentionsDrone('APLICACIÓN FOLIAR AÉREA CON DRON EN EL CULTIVO DE: PASTIZALES'));
  assert.ok(mentionsDrone('APLICACIÓN CON DRONES'));
  assert.ok(mentionsDrone('MEDIANTE AERONAVE NO TRIPULADA'));
  assert.ok(mentionsDrone('USO DE VANT'));
  assert.ok(!mentionsDrone('APLICACION FOLIAR VIA AEREA EN EL CULTIVO DE: BANANO'));
  assert.ok(!mentionsDrone('ANDRONICO'));
});

test('agricultural = no non-farm code, not technical, a farm use in the text (real examples)', () => {
  const yes = [
    ['RSCO-HEDE-0230-X0229-013-41.00', 'APLICACIÓN POST-EMERGENCIA A LA MALEZA EN LOS CULTIVOS DE: ACELGA, AGAVE Y VID.****'],
    ['RSCO-MEZC-1397-0052-64-4.15', 'APLICACION FOLIAR EN LOS CULTIVOS DE: PEPINO, MELON.***'],
    ['RSCO-MEZC-INAC-0940C-X0213-375-60.0', 'APLICACIÓN FOLIAR EN LOS CUTIVOS DE: ZARZAMORA, FRAMBUESA'],
    ['RSCO-INAC-0111-313-001-001', 'APLICACION ESPOLVOREADA, DIRIGIDO A NINFAS DE LANGOSTA EN: PASTIZALES ESTABLECIDOS EN POTREROS *****'],
    ['RSCO-INAC-0143-137-001-004', 'TRATAMIENTO DE GRANOS ALMACENADOS Y SEMILLAS. ARROZ, AVENA, CEBADA'],
    ['RSCO-COAD-0680-301-013-030', 'APLICACION EN MEZCLA CON INSECTICIDAS, ACARICIDAS, FUNGICIDAS Y HERBICIDAS.'],
    ['RSCO-FUMI-0409-311-013-033', 'TRATAMIENTO DE SUELO EN VIVEROS, SEMILLEROS, TABACO, MACETAS Y AREAS DE CULTIVO.'],
  ];
  const no = [
    ['RSCO-URB-MEZC-1101N-X0002-064-26.93', 'CONTROL DE ... EN LUGARES COMO: INTERIORES DE CASAS'],
    ['RSCO-PEC-INAC-0103-301-002-044', 'BAÑOS DE INMERSION EN BOVINOS'],
    ['RSCO-BIO-0338-X0003-009-030', 'BIOCIDA PARA SISTEMAS DE AGUA *****'],
    ['RSCO-INAC-0199-0482-382-2.15', 'INSECTICIDA DE USO DOMESTICO PARA EL CONTROL DE CUCARACHAS **********'],
    ['RSCO-INAC-0150-0537-005-1.0', 'ÚSESE EXCLUSIVAMENTE EN JARDINERÍA PARA EL CONTROL DE: HORMIGAS'],
    ['RSCO-FUNG-0302D-X0692-009-12.5', 'FUNGICIDA DE USO URBANO PARA USO EXCLUSIVO DE APLICADORES DE PLAGUICIDAS EN LOS SIGUIENTES CULTIVOS'],
    ['RSCO-INAC-0119-396-323-000', 'PARA EL CONTROL DE ACAROS, GARRAPATAS, PIOJOS Y PULGAS EN PERROS Y GATOS ***'],
    ['RSCO-FUNG-0398F-X0642-019-97.0', 'PARA USO EXCLUSIVO EN PLANTAS FORMULADORAS DE PLAGUICIDAS.*****'],
    ['RSCO-RODE-514-0682-314-4.0', 'SE AUTORIZA EL USO PARA COMBATIR A RATONES EN: LUGARES DE PASO Y EN EDIFICIOS*****'],
  ];
  for (const [r, usos] of yes) assert.ok(isAgricultural(r, usos), r);
  for (const [r, usos] of no) assert.ok(!isAgricultural(r, usos), r);
});

test('function and ingredients', () => {
  assert.equal(productFunction('RSCO-MEZC-1397-0052-64-4.15'), 'Fungicida');
  assert.equal(productFunction('RSCO-MEZC-1219-301-013-026'), 'Herbicida');
  assert.equal(productFunction('RSCO-MEZC-1101G-301-409-009'), 'Insecticida');
  assert.equal(productFunction('RSCO-MEZC-0910-0651-013-20'), '');
  assert.equal(productFunction('RSCO-COAD-0680-301-013-030'), 'Coadyuvante');
  assert.equal(ingredients('PIRIPROXIFEN+ Beauveria bassiana cepa GHA'), 'PIRIPROXIFEN; Beauveria bassiana cepa GHA');
});
