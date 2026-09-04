/** Shared, dependency-free CSV engine. Browser and Node use this exact module. */
export const LIMITS = Object.freeze({ bytes: 2 * 1024 * 1024, rows: 20000, columns: 100, cells: 200000 });
export const DEFAULT_OPTIONS = Object.freeze({ trim: true, removeBlank: true, deduplicate: true });
const DELIMITERS = [',', ';', '\t'];

export class CsvError extends Error {
  constructor(code, message) { super(message); this.name = 'CsvError'; this.code = code; }
}
function fail(code, message) { throw new CsvError(code, message); }

/** Strict quoted-field parser: delimiter, doubled quotes, CRLF/LF/CR and quoted newlines. */
export function parseCSV(input, delimiter = ',') {
  if (!DELIMITERS.includes(delimiter)) fail('DELIMITER', 'Desteklenmeyen ayırıcı.');
  if (typeof input !== 'string') fail('INPUT', 'CSV metni bekleniyor.');
  if (new TextEncoder().encode(input).length > LIMITS.bytes) fail('SIZE', 'Dosya en fazla 2 MiB olabilir.');
  const text = input.replace(/^\uFEFF/, '');
  if (/\u0000/.test(text)) fail('ENCODING', 'Dosyada NUL karakteri var. UTF-8 CSV olarak yeniden kaydet.');
  const rows = [];
  let row = [], field = '', state = 'plain', touched = false, cells = 0;
  const endField = () => {
    row.push(field); field = ''; state = 'plain';
    if (row.length > LIMITS.columns) fail('COLUMNS', 'En fazla 100 sütun destekleniyor.');
  };
  const endRow = () => {
    endField(); rows.push(row); cells += row.length; row = []; touched = false;
    if (rows.length > LIMITS.rows + 1) fail('ROWS', 'Başlık dışında en fazla 20.000 kayıt destekleniyor.');
    if (cells > LIMITS.cells) fail('CELLS', 'Başlık dahil en fazla 200.000 hücre destekleniyor.');
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (state === 'quoted') {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else state = 'closed';
      } else field += ch;
      touched = true; continue;
    }
    if (ch === delimiter) { endField(); touched = true; continue; }
    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRow(); continue;
    }
    if (state === 'closed') fail('QUOTE', `${rows.length + 1}. kayıtta kapanan tırnaktan sonra beklenmeyen karakter var.`);
    if (ch === '"') {
      if (field !== '') fail('QUOTE', `${rows.length + 1}. kayıtta alan ortasında tırnak var.`);
      state = 'quoted';
    } else field += ch;
    touched = true;
  }
  if (state === 'quoted') fail('QUOTE', `${rows.length + 1}. kayıtta kapanmamış tırnak var.`);
  if (touched || field !== '' || row.length) endRow();
  return rows;
}

/** Count separators only in the first logical record. Ambiguous headers need user choice. */
export function detectDelimiter(input) {
  const counts = new Map(DELIMITERS.map(d => [d, 0]));
  let quoted = false;
  for (let i = input.charCodeAt(0) === 0xfeff ? 1 : 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '"') {
      if (quoted && input[i + 1] === '"') i++; else quoted = !quoted;
    } else if (!quoted) {
      if (ch === '\r' || ch === '\n') break;
      if (counts.has(ch)) counts.set(ch, counts.get(ch) + 1);
    }
  }
  const present = [...counts].filter(([, n]) => n > 0);
  if (present.length > 1) fail('AMBIGUOUS', 'Ayırıcı belirsiz. Virgül, noktalı virgül veya sekmeyi elle seç.');
  return present[0]?.[0] ?? ',';
}

export function readDataset(input, delimiter = 'auto') {
  if (typeof input !== 'string') fail('INPUT', 'CSV metni bekleniyor.');
  if (new TextEncoder().encode(input).length > LIMITS.bytes) fail('SIZE', 'Dosya en fazla 2 MiB olabilir.');
  const resolved = delimiter === 'auto' ? detectDelimiter(input) : delimiter;
  const parsed = parseCSV(input, resolved);
  if (!parsed.length) fail('EMPTY', 'Dosya boş. İlk kayıtta sütun başlıkları olmalı.');
  const headers = parsed[0];
  const names = headers.map(h => h.trim());
  if (names.some(h => !h)) fail('HEADER', 'Her sütunun bir başlığı olmalı. Boş başlığı dosyada düzelt.');
  if (new Set(names).size !== names.length) fail('HEADER', 'Sütun başlıkları benzersiz olmalı. Başlıkların kenar boşlukları yok sayılır.');
  const rows = parsed.slice(1).map((values, index) => {
    // A genuinely blank physical record is a blank row, not a malformed short record.
    if (values.length === 1 && headers.length > 1 && !values[0].trim()) values = [values[0], ...Array(headers.length - 1).fill('')];
    if (values.length !== headers.length) fail('WIDTH', `${index + 2}. kayıt ${values.length} alan içeriyor; başlık ${headers.length} alan içeriyor. Dosyada düzeltip yeniden aç.`);
    return { record: index + 2, values };
  });
  if ((rows.length + 1) * headers.length > LIMITS.cells) fail('CELLS', 'Başlık dahil en fazla 200.000 hücre destekleniyor.');
  return { headers, rows, delimiter: resolved };
}

export function valueType(raw) {
  const value = raw.trim();
  if (!value) return 'empty';
  // Leading zeros are identifiers, never numbers. No coercion is performed.
  if (/^[+-]?(?:0|[1-9]\d*)(?:[.,]\d+)?$/.test(value) && !/^[+-]?0\d/.test(value)) return 'number';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00Z`);
    if (!Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value) return 'date';
  }
  return 'text';
}
export const formulaRisk = value => /^[\s\uFEFF]*[=+\-@]/u.test(value) || /^[\t\r\n]/.test(value);
const isBlank = values => values.every(v => !v.trim());

export function profile(headers, rows) {
  return headers.map((name, col) => {
    const counts = { number: 0, date: 0, text: 0, empty: 0 }, unique = new Set(), missingRecords = [];
    for (const row of rows) {
      const value = row.values[col]; counts[valueType(value)]++;
      if (value.trim()) unique.add(value); else missingRecords.push(row.record);
    }
    const nonEmpty = rows.length - counts.empty;
    const active = ['number', 'date', 'text'].filter(t => counts[t] > 0);
    const dominant = ['number', 'date'].find(t => nonEmpty >= 2 && counts[t] / nonEmpty >= 0.7);
    const type = nonEmpty === 0 ? 'empty' : active.length === 1 ? active[0] : 'mixed';
    const suspiciousRecords = dominant ? rows.filter(r => valueType(r.values[col]) !== 'empty' && valueType(r.values[col]) !== dominant).map(r => r.record) : [];
    return { name, column: col + 1, type, dominant: dominant ?? null, missing: counts.empty, unique: unique.size, counts, missingRecords, suspiciousRecords };
  });
}

/** Cleaning is pure and ordered: trim -> blank removal -> exact full-row deduplication. */
export function analyze(input, requested = {}, delimiter = 'auto') {
  const options = { ...DEFAULT_OPTIONS, ...requested };
  for (const key of Object.keys(DEFAULT_OPTIONS)) if (typeof options[key] !== 'boolean') fail('OPTIONS', 'Temizleme seçenekleri doğru/yanlış olmalı.');
  const dataset = readDataset(input, delimiter);
  const headers = dataset.headers.map(h => options.trim ? h.trim() : h);
  const trimmed = [], blank = [], duplicates = [], kept = [], seen = new Map();
  let whitespaceCells = dataset.headers.filter(v => v !== v.trim()).length, changedCells = 0;
  for (const row of dataset.rows) {
    const values = row.values.map(value => {
      if (value !== value.trim()) whitespaceCells++;
      if (options.trim && value !== value.trim()) { changedCells++; trimmed.push(row.record); }
      return options.trim ? value.trim() : value;
    });
    if (isBlank(values)) {
      blank.push(row.record);
      if (options.removeBlank) continue;
    }
    const key = JSON.stringify(values);
    if (seen.has(key)) {
      duplicates.push({ record: row.record, duplicateOf: seen.get(key) });
      if (options.deduplicate) continue;
    } else seen.set(key, row.record);
    kept.push({ record: row.record, values });
  }
  const beforeProfile = profile(dataset.headers, dataset.rows);
  const afterProfile = profile(headers, kept);
  const missingBefore = beforeProfile.reduce((n, p) => n + p.missing, 0);
  const missingAfter = afterProfile.reduce((n, p) => n + p.missing, 0);
  const escapedCells = [headers, ...kept.map(r => r.values)].flat().filter(formulaRisk).length;
  const headerChanges = options.trim ? dataset.headers.filter(v => v !== v.trim()).length : 0;
  return {
    headers, originalHeaders: dataset.headers, original: dataset.rows, cleaned: kept,
    beforeProfile, afterProfile, options, delimiter: dataset.delimiter,
    stats: { before: dataset.rows.length, after: kept.length, removed: dataset.rows.length - kept.length, columns: headers.length, blank: blank.length, duplicates: duplicates.length, whitespaceCells, changedCells: changedCells + headerChanges, missingBefore, missingAfter, escapedCells },
    changes: { trimmedRecords: [...new Set(trimmed)], blankRecords: blank, duplicates },
  };
}

/** Protect spreadsheet exports by prefixing risky fields before RFC-style quoting. */
export function stringifyCSV(headers, rows, { delimiter = ',', bom = true, safe = true } = {}) {
  if (!DELIMITERS.includes(delimiter)) fail('DELIMITER', 'Desteklenmeyen ayırıcı.');
  const encode = raw => {
    let value = String(raw);
    if (safe && formulaRisk(value)) value = "'" + value;
    return /["\r\n]/.test(value) || value.includes(delimiter) ? '"' + value.replaceAll('"', '""') + '"' : value;
  };
  return (bom ? '\uFEFF' : '') + [headers, ...rows.map(r => Array.isArray(r) ? r : r.values)].map(row => row.map(encode).join(delimiter)).join('\r\n') + '\r\n';
}

/** Report excludes raw cell values. Column names and record numbers are included. */
export function makeReport(result, filename = 'data.csv') {
  return {
    tool: 'CSV Doctor', version: 1, filename, delimiter: result.delimiter,
    options: result.options, statistics: result.stats,
    changes: result.changes,
    columns: result.afterProfile,
    notes: [
      'Record numbers include the header as record 1; quoted newlines do not start a new record.',
      'No missing values were filled and no values were converted to another type.',
      'Type hints are heuristics, not schema validation.',
      'CSV export prefixes spreadsheet formula triggers with an apostrophe; JSON statistics describe the preview before export protection.',
    ],
  };
}
