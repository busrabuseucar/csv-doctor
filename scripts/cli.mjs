#!/usr/bin/env node
import { readFile, open, stat, realpath } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { analyze, stringifyCSV, makeReport, LIMITS } from '../dist/engine.js';

const help = `CSV Doctor — Node.js 24+
Usage: node scripts/cli.mjs input.csv --out cleaned.csv [--report report.json]
Options:
  --delimiter auto|comma|semicolon|tab   Default: auto
  --keep-spaces     Do not trim field or header edges
  --keep-blank      Do not remove blank records (deduplication still applies)
  --keep-duplicates Keep duplicate records
Outputs are created exclusively. Existing files, including the input, are never overwritten.
`;

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) { console.log(help); return; }
  const input = args.shift();
  if (!input || input.startsWith('--')) throw new Error(help);
  let output, reportPath, delimiter = 'auto';
  const options = { trim:true, removeBlank:true, deduplicate:true };
  while (args.length) {
    const arg = args.shift();
    if (['--out','--report','--delimiter'].includes(arg)) {
      const value = args.shift();
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      if (arg === '--out') output = value;
      if (arg === '--report') reportPath = value;
      if (arg === '--delimiter') delimiter = value;
    } else if (arg === '--keep-spaces') options.trim = false;
    else if (arg === '--keep-blank') options.removeBlank = false;
    else if (arg === '--keep-duplicates') options.deduplicate = false;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!output) throw new Error('--out is required.\n' + help);
  const map = { auto:'auto', comma:',', semicolon:';', tab:'\t' };
  if (!Object.hasOwn(map,delimiter)) throw new Error('Unsupported delimiter.');
  const inputPath = await realpath(input);
  const targets = [resolve(output), ...(reportPath ? [resolve(reportPath)] : [])];
  if (new Set([inputPath,...targets]).size !== targets.length + 1) throw new Error('Input and output paths must be distinct.');
  if ((await stat(input)).size > LIMITS.bytes) throw new Error('File exceeds 2 MiB.');
  const text = new TextDecoder('utf-8', { fatal:true }).decode(await readFile(input));
  const result = analyze(text,options,map[delimiter]);
  // Reserve every destination before writing. wx prevents overwrite and follows no existing symlink.
  const handles = [];
  try {
    for (const target of targets) handles.push({ handle:await open(target,'wx'), target });
  } catch (error) {
    for (const { handle } of handles) await handle.close();
    // An empty reserved output may remain; never delete a path that another process could replace.
    throw new Error(`Cannot create output(s): ${error.message}. No data was overwritten; an empty reserved file may remain.`);
  }
  try {
    await handles[0].handle.writeFile(stringifyCSV(result.headers,result.cleaned,{ delimiter:result.delimiter }),'utf8');
    if (handles[1]) await handles[1].handle.writeFile(JSON.stringify(makeReport(result,basename(input)),null,2) + '\n','utf8');
  } finally { for (const { handle } of handles) await handle.close(); }
  console.log(JSON.stringify({ ...result.stats, output:targets[0], report:targets[1] ?? null },null,2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
