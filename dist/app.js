import { LIMITS, stringifyCSV, makeReport } from './engine.js';

const $ = id => document.getElementById(id);
const types = { number:'Sayı', date:'ISO tarih', text:'Metin', mixed:'Karma', empty:'Boş' };
const delimiters = { ',':'Virgül', ';':'Noktalı virgül', '\t':'Sekme' };
const format = value => value.toLocaleString('tr-TR');
let source = '', filename = '', sample = false, result = null, view = 'cleaned', job = 0, loading = false, worker;

function cell(tag, text, className) {
  const node = document.createElement(tag); node.textContent = text;
  if (className) node.className = className;
  return node;
}
function setBusy(busy, message = '') {
  loading = busy; $('status').textContent = message;
  $('download-csv').disabled = $('download-report').disabled = busy || !result;
  $('results').setAttribute('aria-busy', String(busy));
}
function showError(message) {
  result = null; setBusy(false, ''); $('results').hidden = true;
  $('error').textContent = message; $('error').hidden = false;
}
function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./worker.js', import.meta.url), { type:'module' });
  worker.onmessage = ({ data }) => {
    if (data.id !== job) return;
    if (data.error) { showError(data.error.message); return; }
    result = data.result; setBusy(false, ''); $('error').hidden = true; render();
    $('status').textContent = `${filename} incelendi. ${result.stats.after} kayıt önizlemede.`;
  };
  worker.onerror = () => {
    worker?.terminate(); worker = null;
    showError('İnceleme başlatılamadı. Sayfayı yenile veya dosyayı tekrar seç.');
  };
  return worker;
}
function analyzeSource() {
  if (!source) return;
  job++;
  $('error').hidden = true; setBusy(true, 'Dosya inceleniyor…');
  const options = { trim:$('trim').checked, removeBlank:$('remove-blank').checked, deduplicate:$('deduplicate').checked };
  const selected = $('delimiter').value;
  try { getWorker().postMessage({ id:job, text:source, options, delimiter:selected === 'tab' ? '\t' : selected }); }
  catch { showError('Tarayıcı inceleme işlemini başlatamadı. Güncel bir tarayıcıyla tekrar dene.'); }
}
async function loadFile(file) {
  if (!file) return;
  const readId = ++job;
  source = ''; result = null; $('results').hidden = true; $('error').hidden = true;
  setBusy(true, 'Dosya okunuyor…');
  if (file.size > LIMITS.bytes) { showError('Dosya en fazla 2 MiB olabilir. Daha küçük bir CSV seç.'); return; }
  try {
    const bytes = await file.arrayBuffer();
    if (readId !== job) return;
    source = new TextDecoder('utf-8', { fatal:true }).decode(bytes);
    filename = file.name; sample = false;
    if (!source) { showError('Dosya boş. Başlık ve veri içeren bir CSV seç.'); return; }
    analyzeSource();
  } catch { if (readId === job) showError('Dosya okunamadı. UTF-8 kodlamasında CSV olarak kaydedip tekrar dene.'); }
}
async function loadSample() {
  const readId = ++job;
  source = ''; result = null; $('results').hidden = true; $('error').hidden = true;
  setBusy(true, 'Örnek dosya hazırlanıyor…');
  try {
    const response = await fetch('/sample.csv');
    if (!response.ok) throw new Error('sample');
    const text = await response.text();
    if (readId !== job) return;
    source = text; filename = 'atolye-stok-ornek.csv'; sample = true; $('delimiter').value = 'auto';
    $('file-input').value = ''; analyzeSource();
  } catch { if (readId === job) showError('Örnek dosya yüklenemedi. “Örnek veriyi aç” ile tekrar dene veya kendi CSV dosyanı seç.'); }
}
function finding(title, description, count, warning = false) {
  const wrap = cell('div', '', `finding${warning ? ' warning' : ''}`);
  const icon = cell('span', warning ? '!' : '✓', 'finding-icon'); icon.setAttribute('aria-hidden','true');
  const text = cell('div',''); text.append(cell('h3',title),cell('p',description));
  wrap.append(icon,text,cell('span',format(count),'finding-count')); return wrap;
}
function render() {
  const r = result, s = r.stats;
  $('results').hidden = false; $('file-kind').textContent = sample ? 'ÖRNEK DOSYA · KURGUSAL VERİ' : 'YEREL DOSYA';
  $('result-title').textContent = filename;
  $('file-meta').textContent = `${format(s.columns)} sütun · ${delimiters[r.delimiter]} ile ayrılmış · UTF-8`;
  for (const [id, value] of [['before-count',s.before],['after-count',s.after],['removed-count',s.removed],['missing-count',s.missingAfter]]) $(id).textContent = format(value);
  const suspicious = r.afterProfile.reduce((n,p) => n + p.suspiciousRecords.length, 0);
  const items = [
    finding(`${format(s.whitespaceCells)} hücrede kenar boşluğu`, r.options.trim ? 'Başlık ve hücrelerdeki kenar boşlukları temizlendi.' : 'Temizleme kapalı; boşluklar korunuyor.', s.whitespaceCells),
    finding(`${format(s.blank)} tamamen boş kayıt`, r.options.removeBlank ? 'Boş kayıtları kaldırma seçili.' : 'Boş kayıtları kaldırma kapalı; yineleme kuralı ayrıca uygulanır.', s.blank),
    finding(`${format(s.duplicates)} yinelenen kayıt`, r.options.deduplicate ? 'Seçili boşluk ve boş kayıt işlemlerinden sonra ilk eşleşme korunur.' : 'Yineleme kontrolü yapıldı; kayıtlar korunuyor.', s.duplicates),
    finding(`${format(s.missingAfter)} eksik hücre kaldı`, 'Eksik alanlar doldurulmadı. Önizlemede inceleyebilirsin.', s.missingAfter, s.missingAfter > 0),
  ];
  if (suspicious) items.push(finding(`${format(suspicious)} hücrede tür tutarsızlığı olabilir`, 'Sütundaki çoğunluktan farklı değerler; otomatik dönüşüm yapılmadı.', suspicious, true));
  $('findings').replaceChildren(...items);
  $('column-summary').textContent = `${s.columns} sütun`;
  renderTable(); renderProfile();
  $('export-note').textContent = `${format(s.after)} kayıt, ${format(s.columns)} sütun. Girdi ayırıcısı korunur; UTF-8 CSV olarak indirilir.`;
  $('export-safety').textContent = s.escapedCells ? `${format(s.escapedCells)} hücre veya başlık, elektronik tabloda formül çalıştırılmasını azaltmak için indirmede tek tırnakla öneklenecek. Bu koruma önizlemeye dahil değildir.` : 'İndirme koruması: =, +, − veya @ gibi formül başlangıçları tek tırnakla öneklenir. Rapor, hücre içeriklerini içermez.';
}
function renderTable() {
  if (!result) return;
  const original = view === 'original';
  const headers = original ? result.originalHeaders : result.headers;
  const rows = original ? result.original : result.cleaned;
  const profiles = original ? result.beforeProfile : result.afterProfile;
  const suspicious = profiles.map(p => new Set(p.suspiciousRecords));
  $('view-original').setAttribute('aria-pressed',String(original)); $('view-cleaned').setAttribute('aria-pressed',String(!original));
  $('preview-note').textContent = original ? 'Orijinal değerler. Kayıt numarası, başlığın 1 olduğu CSV kaydını gösterir.' : 'Seçili planın sonucu. Kayıt numaraları orijinal dosyaya referans verir.';
  const head = cell('thead',''), headRow = cell('tr','');
  ['Kayıt',...headers].forEach(name => { const th = cell('th',name); th.scope = 'col'; headRow.append(th); });
  head.append(headRow);
  const body = cell('tbody','');
  for (const row of rows.slice(0,50)) {
    const tr = cell('tr',''); tr.append(cell('td',String(row.record)));
    row.values.forEach((value,col) => {
      const missing = !value.trim(), suspect = suspicious[col].has(row.record);
      const td = cell('td',missing ? 'boş' : value, (missing || suspect ? 'cell-warning ' : '') + (missing ? 'cell-empty' : ''));
      if (missing || suspect) td.title = missing ? 'Eksik değer' : 'Sütundaki çoğunluktan farklı tür; incele.';
      tr.append(td);
    });
    body.append(tr);
  }
  if (!rows.length) { const tr = cell('tr',''), td = cell('td','Bu görünümde veri kaydı yok. Başlıklar CSV indirmesine dahil edilir.'); td.colSpan = headers.length + 1; tr.append(td); body.append(tr); }
  const caption = cell('caption', original ? 'Orijinal CSV kayıtları' : 'Temizlenmiş CSV kayıtları'); caption.hidden = true;
  $('data-table').replaceChildren(caption,head,body);
  $('preview-range').textContent = `${format(rows.length)} kaydın ${format(Math.min(rows.length,50))} tanesi gösteriliyor. İndirme tüm kayıtları içerir.`;
}
function renderProfile() {
  const head = cell('thead',''), tr = cell('tr','');
  ['#','Sütun','Tür ipucu','Eksik','Benzersiz','İncelenecek kayıtlar'].forEach(name => { const th=cell('th',name); th.scope='col'; tr.append(th); }); head.append(tr);
  const body = cell('tbody','');
  result.afterProfile.forEach(p => {
    const row = cell('tr','');
    [p.column,p.name,types[p.type],p.missing,p.unique,p.suspiciousRecords.slice(0,20).join(', ') + (p.suspiciousRecords.length > 20 ? '…' : '') || '—'].forEach(value => row.append(cell('td',String(value))));
    body.append(row);
  });
  $('profile-table').replaceChildren(head,body);
}
function download(text, name, mime) {
  const url = URL.createObjectURL(new Blob([text], { type:mime }));
  const a = document.createElement('a'); a.href=url; a.download=name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
function downloadName(suffix) {
  return (filename.replace(/\.(csv|tsv)$/i,'').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').slice(0,100) || 'data') + suffix;
}
$('file-input').addEventListener('change',e => { const file=e.target.files[0]; e.target.value=''; loadFile(file); });
$('sample-button').addEventListener('click',loadSample);
for (const id of ['delimiter','trim','remove-blank','deduplicate']) $(id).addEventListener('change',analyzeSource);
$('view-original').addEventListener('click',() => { view='original'; renderTable(); });
$('view-cleaned').addEventListener('click',() => { view='cleaned'; renderTable(); });
$('download-csv').addEventListener('click',() => { if (result && !loading) download(stringifyCSV(result.headers,result.cleaned,{ delimiter:result.delimiter }),downloadName('-temiz.csv'),'text/csv;charset=utf-8'); });
$('download-report').addEventListener('click',() => { if (result && !loading) download(JSON.stringify(makeReport(result,filename),null,2),downloadName('-rapor.json'),'application/json;charset=utf-8'); });
const zone = $('drop-zone');
zone.addEventListener('dragover',e => { e.preventDefault(); zone.classList.add('dragover'); });
zone.addEventListener('dragleave',() => zone.classList.remove('dragover'));
zone.addEventListener('drop',e => { e.preventDefault(); zone.classList.remove('dragover'); if (e.dataTransfer.files.length !== 1) { ++job; source=''; showError('Lütfen tek bir CSV dosyası seç.'); return; } loadFile(e.dataTransfer.files[0]); });
window.addEventListener('dragover',e => e.preventDefault());
window.addEventListener('drop',e => e.preventDefault());
loadSample();
