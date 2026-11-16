import { test } from 'node:test';
import assert from 'node:assert/strict';
import { records } from '../lib/csv.mjs';
import { createCatalog, downloadPath, downloadWidget, signalWord } from './catalog.mjs';

// The tables as mdb-export -D/-T '%Y-%m-%d' writes them (comma-separated, quoted text).
const csv = (text) => records(text, ',');
const STOCK = 'ΛΗΞΗ ΔΙΑΘΕΣΗΣ ΑΠΟΘΕΜΑΤΩΝ';

const tables = () => ({
  professional: csv(`HMER_EGRIS,KOD_FARMAK,EMPORIKHON,EDR_COD_KAT,APOSYRSH,${STOCK},TELOS_EGRI
"2005-05-30",1854,"KARATE ZEON 10 CS","IN",,,"2027-08-31"
"1981-03-30",1234,"SUN OIL 7E","IN",,,
"2006-03-15",1500,"OLD EXPIRED","HB",,,"2011-09-30"
"1983-07-21",1471,"QUICKPHOS 57 GE","IN","-","2027-02-03","2025-09-03"
"1983-07-21",1472,"GONE STOCK","IN","-","2026-11-10","2025-09-26"
"2006-03-15",7223,"BASAGRAN 48 SL","HB",,,"2028-10-31"
"2006-03-15",7223,"BASAGRAN 48 SL 116913","HB","P",,"2028-10-31"
"2006-03-15",7223,"REVOKED IMPORT 5000","HB","P",,"2028-10-31"
"2010-01-01",8000,"ONLY IMPORT 777","FU","P",,"2030-01-01"
"2010-01-01",60739,"ΚΟΥΠΡΟΛ XL 50 WP","FU",,,"2029-01-01"
"2010-01-01",60739,"COPPER OLD NAME","FU","O",,"2029-01-01"
"2010-01-01",5022,"FERRAMOL για ερασιτεχνική χρήση","MO","E",,"2029-01-01"
`),
  products: csv(`KOD_FARMAK,GBONOMA,EMPORIKHON,MORFHSKEYA,EDR_COD_KAT,ANTIPROSOP,PARASKEYAS,FYS_KATAST,CODE_TOXIK,code_signal
1854,"KARATE ZEON 10 CS","KARATE ZEON 10 CS","CS","IN",701,2067,2,"GHS07+GHS09",
1234,"SUN OIL 7E","SUN OIL 7E","EC","IN",,2219,4,"GHS08",
1500,"OLD EXPIRED","OLD EXPIRED","EC","OT",701,,2,"",
1471,"QUICKPHOS 57 GE","QUICKPHOS 57 GE","GE","IN",3353,2252,4,"GHS02+GHS06+GHS09",
1472,"GONE STOCK","GONE STOCK","GE","IN",3353,,4,"",
7223,"BASAGRAN 48 SL","BASAGRAN 48 SL","SL","HB",713,,2,"GHS07",
8000,"REFERENCE NOT SOLD","REFERENCE NOT SOLD","WG","FU",713,,4,"",
60739,"COUPROL XL 50 WP","ΚΟΥΠΡΟΛ XL 50 WP","WP","FU",713,,4,"Xn/N",
5022,"FERRAMOL","FERRAMOL","RB","MO",713,,4,"",
`),
  composition: csv(`KOD_FARMAK,KODIKOS,KOD_MORFH,SYNTHESH,KATHAROTHT,KODIKOS-KATH,DELREC,FPRINT,substanceType
1854,"L1",,10,100,1,1,1,"active substance"
1234,"P9",,99.09999999999999,100,1,1,1,"active substance"
1500,"B1",,48,100,1,1,1,"active substance"
1471,"A5",,57,100,1,1,1,"active substance"
7223,"B1",,48,100,1,1,1,"active substance"
7223,"S1",,5,100,1,0,1,"safener"
7223,"L1",,2.5,100,1,0,1,"active substance"
8000,"B1",,,100,1,1,1,"active substance"
60739,"C1",,50,100,1,1,1,"active substance"
`),
  substances: csv(`KODIKOS,ONOMADRON
"L1","lambda-Cyhalothrin"
"P9","Paraffin oil"
"B1","Bentazone"
"A5","Aluminium phosphide"
"S1","Cloquintocet-mexyl"
"C1","Copper oxychloride"
`),
  companies: csv(`KOD_COMPAN,ARXIKO,KODE,NAMECOMPAN,ENAME
701,"S","SYNGR","Syngenta Hellas Μονοπρόσωπη Α.Ε.Β.Ε.","Syngenta Hellas Single Member S.A.C.I."
713,"B","BASGR","BASF Ελλάς Μονοπρόσωπη Α.Β.Ε.Ε.","BASF Hellas Single Member S.A.I.C."
2219,"P","PELBE","PETRONAS LUBRICANTS BELGIUM NV","PETRONAS LUBRICANTS BELGIUM NV"
3353,"U","UHCNL","UPL Holdings Coöperatief U.A.","UPL Holdings Coöperatief U.A."
`),
  hazards: csv(`KOD_FARMAK,CODE
1854,"EUH401, H302, H317, H332, H410, P261, P273."
1234,"EUH401, H304, P262, P270, P301+P310, Α12, Π1."
1471,"EUH029, EUH032, H228, H260, H300, H311, H330, H400, P210."
7223,"EUH401, H302, H317, H319, H412, P280."
60739,"R22, R50, S1/S2, SP1."
`),
  parallel: csv(`NCOUNTER,KOD_FARMAK,EMPORIKO ONOMA,NUM_PROTOK,DELREC,LIXI_EGR
1,7223,"BASAGRAN 48 SL",116913,1,
2,7223,"REVOKED IMPORT",5000,0,"2015-08-31"
3,8000,"ONLY IMPORT",777,1,
`),
  forms: csv(`MORFHSKEYA,PERIGR1,PERIGR2
"SL","Πυκνό διάλυμα","Soluble concentrate"
"CS","ΕΝΑΙΩΡΗΜΑ ΜΙΚΡΟΚΑΨΟΥΛΩΝ","Capsule suspension"
"WP","βρέξιμη σκόνη","Wettable powder"
`),
  categories: csv(`EDR_COD_KAT,KATHGORIA,HKATHGORIA
"IN","ΕΝΤΟΜΟΚΤΟΝΟ","εντομοκτόνο"
"HB","ΖΙΖΑΝΙΟΚΤΟΝΟ","ζιζανιοκτόνο"
"FU","ΜΥΚΗΤΟΚΤΟΝΟ","μυκητοκτόνο"
"OT","ΑΛΛΟ ΦΥΤΟΠΡΟΣΤΑΤΕΥΤΙΚΟ ΠΡΟΪΟΝ","άλλο φυτοπροστατευτικό προϊόν"
`),
});

test('keeps what the ministry says a professional may buy today', () => {
  const list = createCatalog(tables(), '2026-11-15');
  // 1500: blank APOSYRSH with an old expiry = still authorised (under evaluation).
  // 1472: revoked, stock date passed. 5022: amateur only.
  assert.deepEqual(
    list.map((e) => e.r),
    ['1234', '1471', '1500', '1854', '7223', '8000', '60739']
  );
  assert.deepEqual(list.find((e) => e.r === '1854'), {
    r: '1854',
    b: ['KARATE ZEON 10 CS'],
    f: 'ΕΝΑΙΩΡΗΜΑ ΜΙΚΡΟΚΑΨΟΥΛΩΝ',
    a: 'lambda-Cyhalothrin 10% β/ο',
    h: 'Syngenta Hellas Μονοπρόσωπη Α.Ε.Β.Ε.',
    c: 'Εντομοκτόνο',
    t: 'WARNING',
    e: '',
  });
});

test('names: Greek and Latin spellings, former names and parallel imports', () => {
  const list = createCatalog(tables(), '2026-11-15');
  const byNr = Object.fromEntries(list.map((e) => [e.r, e]));
  assert.deepEqual(byNr['60739'].b, ['ΚΟΥΠΡΟΛ XL 50 WP', 'COUPROL XL 50 WP', 'COPPER OLD NAME']);
  // The permit protocol number leaves the name; a withdrawn permit leaves the list.
  assert.deepEqual(byNr['7223'].b, ['BASAGRAN 48 SL']);
  // Only the import is on sale: the reference product's own name is not offered.
  assert.deepEqual(byNr['8000'].b, ['ONLY IMPORT']);
  assert.equal(byNr['8000'].a, 'Bentazone');
});

test('composition, holder fallback, formulation and category', () => {
  const byNr = Object.fromEntries(createCatalog(tables(), '2026-11-15').map((e) => [e.r, e]));
  assert.equal(byNr['7223'].a, 'Bentazone 48% β/ο; lambda-Cyhalothrin 2.5% β/ο');
  assert.equal(byNr['1234'].a, 'Paraffin oil 99.1% β/β');
  assert.equal(byNr['1234'].h, 'PETRONAS LUBRICANTS BELGIUM NV');
  assert.equal(byNr['1234'].f, 'EC');
  assert.equal(byNr['60739'].f, 'Βρέξιμη σκόνη');
  assert.equal(byNr['7223'].c, 'Ζιζανιοκτόνο');
  assert.equal(byNr['1500'].c, 'Άλλο φυτοπροστατευτικό προϊόν');
  assert.equal(byNr['1471'].t, 'DANGER');
  assert.equal(byNr['1234'].t, 'DANGER');
  assert.equal(byNr['60739'].t, '');
  assert.equal(byNr['8000'].t, '');
});

test('fails loudly when the layout changes', () => {
  const dates = tables();
  dates.professional = csv(`KOD_FARMAK,EMPORIKHON,APOSYRSH,${STOCK}\n1471,"QUICKPHOS 57 GE","-","02/03/27 00:00:00"\n`);
  assert.throws(() => createCatalog(dates, '2026-11-15'), /unexpected date/);
  const t = tables();
  t.professional = csv('KOD_FARMAK,EMPORIKHON\n1,"X"\n');
  assert.throws(() => createCatalog(t, '2026-11-15'), /SKEYASMATA-professional/);
});

test('signal word from the H statements', () => {
  assert.equal(signalWord('EUH401, H302, H410, P273.'), 'WARNING');
  assert.equal(signalWord('H302, H318, H410'), 'DANGER');
  assert.equal(signalWord('H360FD, H361D, H410'), 'DANGER');
  // Danger prevails even next to a category-dependent statement.
  assert.equal(signalWord('H228, H300'), 'DANGER');
  // H228 / H261 / H272 alone: Danger or Warning depending on the category.
  assert.equal(signalWord('H228, H302'), '');
  assert.equal(signalWord('H272, H319'), '');
  // No signal word: EUH only, H411-H413, H362, non-EU GHS statements, the "H208" typo.
  assert.equal(signalWord('EUH208, EUH401, H411, P270'), '');
  assert.equal(signalWord('H208, H362, H412, H316'), '');
  assert.equal(signalWord('R22, R50, S1/S2'), '');
  assert.equal(signalWord(''), '');
  // An unknown statement makes the word unknown.
  assert.equal(signalWord('H302, H999'), '');
  // Cross-check with the pictograms: GHS06 is always Danger; Danger needs GHS01/02/03/05/06/08.
  assert.equal(signalWord('H302, H410', 'GHS06+GHS09'), '');
  assert.equal(signalWord('H304, H302, H410', 'GHS07+GHS09'), '');
  assert.equal(signalWord('H304, H302, H410', 'GHS07+GHS08+GHS09'), 'DANGER');
  assert.equal(signalWord('H302, H410', 'Xn/N'), 'WARNING');
  assert.equal(signalWord('H302, H319', 'GHS05+GHS07'), '');
  assert.equal(signalWord('H290, H319', 'GHS05+GHS07'), 'WARNING');
});

test('ZK download handshake', () => {
  const html = `zkb('z_o53',...dt:'z_o53',cu:'/oneClickUI'...
['zul.wgt.Label','iW8Qp',{id:'down1',value:'Κατεβάστε από '},[]],
['zul.wgt.Label','iW8Qq',{id:'down2',$onClick:true,value:'εδώ'},[]],`;
  assert.deepEqual(downloadWidget(html), { dtid: 'z_o53', uuid: 'iW8Qq' });
  assert.equal(downloadWidget('<html></html>'), null);
  assert.equal(
    downloadPath({ rs: [['download', ['/oneClickUI/zkau/view/z_o53/dwnmed-0/3d51/dbSYSPEST.zip']]], rid: 1 }),
    '/oneClickUI/zkau/view/z_o53/dwnmed-0/3d51/dbSYSPEST.zip'
  );
  assert.equal(downloadPath({ rs: [['alert', ['session expired']]] }), null);
  assert.equal(downloadPath({ rs: [['download', ['https://elsewhere.example/x.zip']]] }), null);
});
