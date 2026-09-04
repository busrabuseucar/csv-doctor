import { readFile, readdir, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
for (const dir of ['dist','scripts','tests']) {
  for (const name of await readdir(dir)) {
    if (!/\.(m?js)$/.test(name)) continue;
    const result = spawnSync(process.execPath,['--check',`${dir}/${name}`],{ encoding:'utf8' });
    if (result.status !== 0) throw new Error(result.stderr);
  }
}
const html = await readFile('dist/index.html','utf8');
for (const match of html.matchAll(/(?:src|href)="(\/[^"#?]*)"/g)) {
  if (match[1] === '/') continue;
  await access(resolve('dist','.' + match[1]));
}
const manifest = JSON.parse(await readFile('.openai/hosting.json','utf8'));
if (manifest.static?.directory !== 'dist') throw new Error('Expected static dist output.');
console.log('JavaScript syntax, hosting entrypoint and local asset references verified.');
