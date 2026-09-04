import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseCSV } from '../dist/engine.js';
const cli=resolve('scripts/cli.mjs');
const run=args=>spawnSync(process.execPath,[cli,...args],{encoding:'utf8'});

test('CLI creates a cleaned CSV and report using the shared engine',async () => {
  const dir=await mkdtemp(join(tmpdir(),'csv-doctor-'));
  try {
    const input=join(dir,'input.csv'),output=join(dir,'clean.csv'),report=join(dir,'report.json');
    await writeFile(input,'a;b\n 001 ;2\n001;2');
    const result=run([input,'--out',output,'--report',report]);
    assert.equal(result.status,0,result.stderr);
    assert.deepEqual(parseCSV(await readFile(output,'utf8'),';'),[['a','b'],['001','2']]);
    assert.equal(JSON.parse(await readFile(report,'utf8')).statistics.duplicates,1);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
test('CLI refuses input overwrite and existing output files',async () => {
  const dir=await mkdtemp(join(tmpdir(),'csv-doctor-'));
  try {
    const input=join(dir,'input.csv'),output=join(dir,'clean.csv');
    await writeFile(input,'a\n1'); await writeFile(output,'keep me');
    assert.notEqual(run([input,'--out',input]).status,0);
    assert.notEqual(run([input,'--out',output]).status,0);
    assert.equal(await readFile(input,'utf8'),'a\n1'); assert.equal(await readFile(output,'utf8'),'keep me');
  } finally { await rm(dir,{recursive:true,force:true}); }
});
test('CLI rejects non-UTF-8 input before creating output',async () => {
  const dir=await mkdtemp(join(tmpdir(),'csv-doctor-'));
  try {
    const input=join(dir,'input.csv'),output=join(dir,'clean.csv');
    await writeFile(input,Buffer.from([0x61,0x0a,0xff]));
    assert.notEqual(run([input,'--out',output]).status,0);
    await assert.rejects(readFile(output),{code:'ENOENT'});
  } finally { await rm(dir,{recursive:true,force:true}); }
});
