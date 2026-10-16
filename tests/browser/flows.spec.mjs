import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { parseCSV } from '../../dist/engine.js';

async function download(page, selector) {
  const ready = page.waitForEvent('download');
  await page.locator(selector).click();
  return readFile(await (await ready).path(), 'utf8');
}
async function upload(page, text, name = 'input.csv') {
  await page.locator('#file-input').setInputFiles({name, mimeType: 'text/csv', buffer: Buffer.from(text)});
}

test('subdirectory hosting and reversible cleaning export the full sample', async ({page}) => {
  const failures = [];
  page.on('response', response => { if (response.status() >= 400) failures.push(response.url()); });
  await page.goto('./');
  await expect(page.locator('#before-count')).toHaveText('14');
  await expect(page.locator('#after-count')).toHaveText('11');
  await page.locator('#view-original').click();
  await expect(page.locator('#data-table tbody tr')).toHaveCount(14);
  await page.locator('#trim').uncheck();
  await page.locator('#remove-blank').uncheck();
  await page.locator('#deduplicate').uncheck();
  await expect(page.locator('#after-count')).toHaveText('14');
  await page.locator('#trim').check();
  await page.locator('#remove-blank').check();
  await page.locator('#deduplicate').check();
  await expect(page.locator('#after-count')).toHaveText('11');
  await page.locator('#view-cleaned').click();
  await expect(page.locator('#data-table tbody tr')).toHaveCount(11);
  const report = JSON.parse(await download(page, '#download-report'));
  expect(report.statistics.after).toBe(11);
  const rows = parseCSV(await download(page, '#download-csv'), report.delimiter);
  expect(rows).toHaveLength(12);
  expect(failures).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('uploaded strings remain text and exports protect formulas without leaking raw cells in the report', async ({page}) => {
  await page.goto('./');
  await expect(page.locator('#after-count')).toHaveText('11');
  const payload = '<img src=x onerror=window.injected=1>';
  await upload(page, `id;note;value\n001;${payload};=1+1\n001;${payload};=1+1\n002;private-cell-marker;3`);
  await expect(page.locator('#result-title')).toHaveText('input.csv');
  await expect(page.locator('#after-count')).toHaveText('2');
  await expect(page.locator('#data-table')).toContainText(payload);
  await expect(page.locator('#data-table img')).toHaveCount(0);
  expect(await page.evaluate(() => window.injected)).toBeUndefined();
  const rows = parseCSV(await download(page, '#download-csv'), ';');
  expect(rows[1]).toEqual(['001',payload,"'=1+1"]);
  const reportText = await download(page, '#download-report');
  expect(reportText).not.toContain('private-cell-marker');
  expect(reportText).not.toContain(payload);
  expect(JSON.parse(reportText).changes.duplicates).toEqual([{record:3,duplicateOf:2}]);
});

test('malformed input disables export and a header-only replacement recovers', async ({page}) => {
  await page.goto('./');
  await expect(page.locator('#after-count')).toHaveText('11');
  await upload(page, 'a,b\n"unterminated');
  await expect(page.locator('#error')).toBeVisible();
  await expect(page.locator('#results')).toBeHidden();
  await expect(page.locator('#download-csv')).toBeDisabled();
  await upload(page, 'id,name\n', 'header.csv');
  await expect(page.locator('#result-title')).toHaveText('header.csv');
  await expect(page.locator('#after-count')).toHaveText('0');
  expect(parseCSV(await download(page, '#download-csv'))).toEqual([['id','name']]);
});
