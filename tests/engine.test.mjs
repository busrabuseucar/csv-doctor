import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseCSV, detectDelimiter, readDataset, analyze, stringifyCSV, valueType, makeReport, LIMITS } from '../dist/engine.js';

test('quoted delimiters, escaped quotes and embedded newlines preserve exact values', () => {
  assert.deepEqual(parseCSV('name,note\r\n"Doe, Jane","a ""quote""\r\nnext"\r\n'), [['name','note'],['Doe, Jane','a "quote"\r\nnext']]);
});
test('BOM and each line ending are supported without a phantom final record', () => {
  for (const eol of ['\n','\r\n','\r']) assert.deepEqual(parseCSV('\uFEFFa,b'+eol+'1,2'+eol),[['a','b'],['1','2']]);
});
test('trailing empty field, single-column data and header-only CSV remain valid', () => {
  assert.deepEqual(parseCSV('a,b,c\n1,2,'),[['a','b','c'],['1','2','']]);
  assert.equal(analyze('name\nAda\nEce').stats.columns,1);
  assert.equal(analyze('a,b\n').stats.after,0);
});
test('delimiter detection ignores quoted punctuation and handles semicolon and tab', () => {
  assert.equal(detectDelimiter('"last, first";score\nAda;1'),';');
  assert.equal(detectDelimiter('a\tb\n1\t2'),'\t');
  assert.equal(analyze('a;b\n1;2').delimiter,';');
});
test('ambiguous header separators require explicit selection', () => {
  assert.throws(() => analyze('a,b;c\n1,2;3'), { code:'AMBIGUOUS' });
  assert.equal(analyze('a,b;c\n1,2;3',{},',').stats.columns,2);
});
test('malformed quote syntax fails rather than silently altering data', () => {
  for (const input of ['a\n"open','a\na"b','a\n"x"oops','a\n "x"']) assert.throws(() => parseCSV(input),{ code:'QUOTE' });
});
test('empty, missing and duplicate normalized headers are rejected', () => {
  assert.throws(() => analyze(''), { code:'EMPTY' });
  for (const input of ['a,\n1,2','a,a\n1,2',' a ,a\n1,2']) assert.throws(() => analyze(input), { code:'HEADER' });
});
test('short and long nonblank records fail with original record number', () => {
  assert.throws(() => analyze('a,b\n1,2\n3'), /3\. kayıt 1 alan/);
  assert.throws(() => analyze('a,b\n1,2,3'), { code:'WIDTH' });
});
test('blank physical records expand to the header width; partial missing rows survive', () => {
  const r = analyze('a,b\n\n,\n1,\n2,3\n');
  assert.deepEqual(r.cleaned.map(x => x.values), [['1',''],['2','3']]);
  assert.equal(r.stats.blank,2); assert.equal(r.stats.missingAfter,1);
});
test('cleaning trims before deduplicating and preserves the first original record reference', () => {
  const r = analyze(' code ,name\n 001 , Ada \n001,Ada\n002,Ece');
  assert.deepEqual(r.headers,['code','name']);
  assert.deepEqual(r.cleaned,[{record:2,values:['001','Ada']},{record:4,values:['002','Ece']}]);
  assert.deepEqual(r.changes.duplicates,[{record:3,duplicateOf:2}]);
});
test('disabling all cleaning options preserves parsed input, including whitespace', () => {
  const source = ' a ,b\n 1 ,2\n 1 ,2\n,\n';
  const r=analyze(source,{trim:false,removeBlank:false,deduplicate:false});
  assert.deepEqual(r.cleaned,r.original); assert.deepEqual(r.headers,r.originalHeaders);
});
test('blank physical record expansion preserves whitespace when trim is off', () => {
  const options={trim:false,removeBlank:false,deduplicate:false};
  assert.deepEqual(analyze('a,b\n   \n',options).cleaned[0].values,['   ','']);
  assert.deepEqual(analyze('a\n   \n',options).cleaned[0].values,['   ']);
});
test('deduplication compares entire rows with structural keys, not a joined string', () => {
  const r = analyze('a,b\n"x,y",z\nx,"y,z"\n"x,y",z');
  assert.equal(r.stats.after,2); assert.equal(r.stats.duplicates,1);
});
test('the original dataset stays unchanged after a cleaning plan', () => {
  const r = analyze('a,b\n x ,1\nx,1');
  assert.equal(r.original[0].values[0],' x '); assert.equal(r.original.length,2);
  assert.equal(r.cleaned.length,1);
});
test('missing values are not invented and identifiers keep their leading zeros', () => {
  const r=analyze('id,amount\n001,\n002,1.20');
  assert.equal(r.cleaned[0].values[0],'001'); assert.equal(r.cleaned[0].values[1],'');
  assert.equal(r.cleaned[1].values[1],'1.20'); assert.equal(valueType('001'),'text');
});
test('type hints validate real calendar dates and never coerce values', () => {
  assert.equal(valueType('2024-02-29'),'date'); assert.equal(valueType('2026-02-29'),'text');
  assert.equal(valueType('2026-02-30'),'text'); assert.equal(valueType('03/04/2026'),'text');
  assert.equal(valueType('1,25'),'number'); assert.equal(valueType('1.234,56'),'text');
});
test('mixed numeric columns flag minority records, while ordinary text is not invalid', () => {
  const r=analyze('qty,note\n1,a\n2,b\n3,c\n4,d\nunknown,e');
  assert.deepEqual(r.afterProfile[0].suspiciousRecords,[6]);
  assert.deepEqual(r.afterProfile[1].suspiciousRecords,[]);
});
test('quoted newlines count as one record and retain correct evidence references', () => {
  const r=analyze('a,b\n"a\nb",1\n"a\nb",1');
  assert.deepEqual(r.changes.duplicates,[{record:3,duplicateOf:2}]);
});
test('spreadsheet protection applies to headers and cells, including whitespace prefixes', () => {
  const out=stringifyCSV(['=header','safe'],[['=1+1','normal'],[' \t@SUM(A1)','+2'],['-2','\ttext']]);
  const parsed=parseCSV(out);
  assert.equal(parsed[0][0],"'=header"); assert.equal(parsed[1][0],"'=1+1");
  assert.equal(parsed[2][0],"' \t@SUM(A1)"); assert.equal(parsed[2][1],"'+2");
  assert.equal(parsed[3][0],"'-2"); assert.equal(parsed[3][1],"'\ttext");
});
test('CSV export round trips delimiters, quotes, Unicode, newlines and empty cells', () => {
  const values=[['İstanbul','a"b',''],['x\ny','a;b','x,y']];
  for(const delimiter of [',',';','\t']) assert.deepEqual(parseCSV(stringifyCSV(['a','b','c'],values,{delimiter}),delimiter),[['a','b','c'],...values]);
});
test('JSON reports include evidence and no raw cell values', () => {
  const r=analyze('id,note\n007,secret-value\n007,secret-value');
  const report=makeReport(r,'test.csv');
  assert.equal(report.statistics.duplicates,1);
  assert.equal(JSON.stringify(report).includes('secret-value'),false);
});
test('byte, row, column and expanded cell budgets are enforced', () => {
  assert.throws(() => analyze('a\n'+'ç'.repeat(LIMITS.bytes/2)),{code:'SIZE'});
  assert.throws(() => analyze('a\n'+'1\n'.repeat(LIMITS.rows+1)),{code:'ROWS'});
  assert.throws(() => analyze(Array.from({length:101},(_,i)=>'c'+i).join(',')),{code:'COLUMNS'});
  const header=Array.from({length:100},(_,i)=>'c'+i).join(',');
  assert.throws(() => analyze(header+'\n'+'\n'.repeat(2000)),{code:'CELLS'});
});
test('NUL input and invalid options fail clearly', () => {
  assert.throws(() => analyze('a\n\u0000'),{code:'ENCODING'});
  assert.throws(() => analyze('a\n1',{trim:'yes'}),{code:'OPTIONS'});
});
test('provided sample has stable, explainable before/after results', async () => {
  const sample=await readFile(new URL('../dist/sample.csv',import.meta.url),'utf8');
  const r=analyze(sample);
  assert.equal(r.stats.before,14); assert.equal(r.stats.after,11);
  assert.equal(r.stats.duplicates,2); assert.equal(r.stats.blank,1);
  assert.equal(r.stats.whitespaceCells,2); assert.equal(r.stats.missingAfter,2);
  assert.deepEqual(r.afterProfile[2].suspiciousRecords,[8]);
  assert.deepEqual(r.afterProfile[4].suspiciousRecords,[13]);
});
test('safe cleaning is idempotent over its exported result', () => {
  const r=analyze(' a ,b\n x ,1\nx,1\n,');
  const again=analyze(stringifyCSV(r.headers,r.cleaned));
  assert.equal(again.stats.removed,0); assert.equal(again.stats.changedCells,0);
  assert.deepEqual(again.cleaned.map(r=>r.values),r.cleaned.map(r=>r.values));
});
