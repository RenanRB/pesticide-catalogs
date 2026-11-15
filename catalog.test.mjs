import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { createCatalog, formatPercent, formatRegNr, sentenceCase } from './catalog.mjs';
import { unzip } from './zip.mjs';

const pad = (text, width) => String(text).padEnd(width).slice(0, width);

/** PRODUCT.TXT: REG_NR 1-11, FORM 12-13, TOX 14, APPR 15-22, CAN 23-30, CT 31-32, NAME 33-102, RUP 103, PM 104-105, COND 106. */
function product(reg, { form = '15', tox = '3', can = '00000000', ct = '  ', name = 'PRODUCT', rup = 'F' } = {}) {
  return `${reg}${pad(form, 2)}${tox}20200101${can}${pad(ct, 2)}${pad(name, 70)}${rup}25N`;
}

const files = {
  product: [
    product('00010001652', { form: '  ', tox: '1', name: 'GRAMOXONE 3LB', rup: 'T' }),
    product('00052400549', { form: '15', tox: '3', name: 'WEED KILLER CONCENTRATE' }),
    product('00052400550', { name: 'CANCELLED ONE', can: '20190101', ct: '32' }),
    product('00052400551', { form: '01', name: 'TECHNICAL GRADE' }),
    product('00052400552', { name: 'HOSPITAL DISINFECTANT' }),
  ],
  prodsite: ['00010001652240000000', '00052400549340000000', '00052400549660000000', '00052400550240000000', '00052400551240000000', '00052400552740000000'],
  prodtype: ['0001000165234', '0005240054934', '0005240054939', '0005240055220'],
  typename: ['34HERBICIDE', '39HERBICIDE TERRESTRIAL', '20DISINFECTANT'],
  formula: ['000100016520616010439000', '000524005494173000410000', '000524005490290010007300'],
  chemname: [
    `061601${pad('Other Common', 20)}1,1'-Dimethyl-4,4'-bipyridinium dichloride`,
    `061601${pad('ISO', 20)}Paraquat dichloride`,
    `061601${pad('Trade', 20)}Gramoxone`,
    `417300${pad('Other Common', 20)}Glyphosate`,
  ],
  company: [`000100${pad('SYNGENTA CROP PROTECTION, LLC', 60)}`, `000524${pad('BAYER CROPSCIENCE, LLC', 60)}`],
  alt_prod_nm: [
    `00010001652${pad('GRAMOXONE 3LB', 70)}Active    `,
    `00010001652${pad('CYCLONE SL 3.0', 70)}Alternate `,
    `00010001652${pad('OLD NAME', 70)}Inactive  `,
  ],
  formname: ['15Soluble Concentrate'],
  toxname: ['0NO SIGNAL WORD', '1DANGER', '2WARNING', '3CAUTION'],
};

test('formats registration numbers and percentages as EPA prints them', () => {
  assert.equal(formatRegNr('00010001652'), '100-1652');
  assert.equal(formatRegNr('10521100091'), '105211-91');
  assert.equal(formatRegNr('123'), null);
  assert.equal(formatPercent('0439000'), '43.9');
  assert.equal(formatPercent('0007300'), '0.73');
  assert.equal(sentenceCase('HERBICIDE TERRESTRIAL'), 'Herbicide terrestrial');
});

test('keeps active agricultural registrations only, one entry each', () => {
  const catalog = createCatalog(files);
  assert.deepEqual(
    catalog.map((e) => e.r),
    ['100-1652', '524-549']
  );
});

test('builds the entry the app reads', () => {
  const [gramoxone, weedKiller] = createCatalog(files);
  assert.deepEqual(gramoxone, {
    r: '100-1652',
    b: ['GRAMOXONE 3LB', 'CYCLONE SL 3.0'],
    f: '',
    a: 'Paraquat dichloride (43.9%)',
    h: 'SYNGENTA CROP PROTECTION, LLC',
    c: 'Herbicide',
    t: 'DANGER',
    e: '',
    u: 1,
  });
  assert.equal(weedKiller.u, undefined);
  assert.equal(weedKiller.f, 'Soluble Concentrate');
  assert.equal(weedKiller.c, 'Herbicide / Herbicide terrestrial');
  assert.equal(weedKiller.a, 'Glyphosate (41%); PC 029001 (0.73%)');
  assert.equal(weedKiller.t, 'CAUTION');
});

test('reads a deflated zip entry', () => {
  const data = Buffer.from('line 1\nline 2\n');
  const deflated = deflateRawSync(data);
  const name = Buffer.from('product.txt');
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(deflated.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(deflated.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(0, 42);
  const directoryOffset = local.length + name.length + deflated.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(directoryOffset, 16);
  const zip = Buffer.concat([local, name, deflated, central, name, end]);
  const [file] = unzip(zip);
  assert.equal(file.name, 'product.txt');
  assert.equal(file.data.toString(), 'line 1\nline 2\n');
});
