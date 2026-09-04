# CSV Doctor — uygulayarak öğren

Amaç yalnızca bir demo yayımlamak değil; her kuralın neden var olduğunu açıklayabilmek. Bu proje yapay zekâ desteğiyle hazırlandı. CV ve mülakatta kendi yaptığın değişiklikleri, incelediğin kodu ve doğruladığın davranışları anlat.

## 1. Önce örnek veriyi incele

1. Demoyu aç ve örnek dosyanın yüklenmesini bekle.
2. Varsayılan planda **14 → 11 kayıt**, **3 kaldırılan kayıt**, **2 kalan eksik hücre** görmelisin.
3. “Orijinal” görünümünde baştaki ve sondaki boşlukları, iki yinelenen kaydı ve tamamen boş kaydı bul.
4. “Temizlenmiş” görünümünde `001` ürün kodunun değişmediğini kontrol et.
5. Sütun profilini aç. `adet` sütunundaki **8. kayıt** (`otuz`) ve `tarih` sütunundaki **13. kayıt** (`2026-02-30`) inceleme gerektirir. Eksik adet ve kategori alanları doldurulmaz.

## 2. Planı değiştir ve sonucu tahmin et

- Yinelemeleri kaldırmayı kapat: **13 kayıt** kalır.
- Boş kayıtları kaldırmayı da kapat: **14 kayıt** kalır.
- Tüm seçenekleri kapat: veri ve başlıklar aynen korunur. Tür profili yalnızca bilgi verir.
- Varsayılan seçeneklere dön. Aynı dosyanın her seferinde orijinal verisinden hesaplama yapılır; önceki temizleme sonucu tekrar temizlenmez.

## 3. Kendi küçük değişikliğini yap

Örnek CSV’yi indir. `otuz` değerini `30` yap; `2026-02-30` tarihini `2026-02-28` yap. Yeni bir dosya adıyla kaydet ve tekrar aç.

Beklenti: veri kaydı sayısı değişmez, tür tutarsızlığı uyarıları kaybolur. Eksik iki alan hâlâ eksiktir. Bu, “geçersiz” ile “eksik” arasındaki farktır.

Sonra aynı işlemi komut satırında çalıştır:

```bash
node scripts/cli.mjs dist/sample.csv --out clean.csv --report audit.json
```

`audit.json` içindeki `statistics` ve `changes.duplicates` alanlarını incele. Aynı çıktı adına ikinci kez yazmayı dene; program var olan dosyayı korumalıdır.

## 4. Kod okuma sırası

1. `dist/engine.js`: `parseCSV` içindeki `plain`, `quoted`, `closed` durumlarını izle. Tırnak içindeki virgül neden yeni alan açmıyor?
2. `readDataset`: başlık ve alan sayısı kontrolünü incele. Hatalı bir satırı sessizce atlamak neden veri kaybına yol açar?
3. `analyze`: önce trim, sonra boş kayıt, sonra yineleme sırasını incele. Sıra değişirse sonuç nasıl değişir?
4. `stringifyCSV`: tırnak kaçışı ile elektronik tablo formül korumasının ayrı işlemler olduğunu gör.
5. `dist/worker.js` ve `dist/app.js`: inceleme işinin ana arayüzü neden meşgul etmediğini ve eski yanıtların `id` ile nasıl yok sayıldığını incele.
6. `tests/engine.test.mjs` ve `tests/cli.test.mjs`: gerçek dosyaya dönüşü, hata durumlarını ve girdinin korunduğunu doğrulayan testleri çalıştır.

## Mülakatta açıklayabileceğin konular

- Satırı virgülden bölmek neden gerçek CSV ayrıştırması için yeterli değil?
- Önizleme ile indirilen CSV arasında formül koruması nedeniyle ne fark olabilir?
- `001` neden sayıya çevrilmiyor? Bir elektronik tablo programına aktarırken neden yine metin sütunu seçmek gerekebilir?
- Tür çıkarımı neden kesin doğrulama değildir? Yüzde 70 eşiğinin yanlış pozitifleri olabilir mi?
- Tam satır yinelemesi ile aynı ürün koduna sahip iki farklı kayıt arasındaki fark nedir?
- Web Worker neyi iyileştirir? Dosya limiti yine neden gerekli?
- Orijinal kayıt numarası ile fiziksel metin satırı neden farklı olabilir?
- JSON raporunda hücre içerikleri olmasa bile dosya ve sütun adları neden paylaşılmadan önce incelenmeli?

## İlk kendi katkın için küçük geliştirme

Bir sonraki ayrı çalışma olarak kullanıcı seçimiyle “yalnızca eksik değer içeren kayıtları göster” filtresi ekleyebilirsin. Önizleme filtresinin dışa aktarılan veriyi değiştirmemesine dikkat et. Önce davranışı yaz, kodu değiştir, ardından bu ayrımı doğrulayan test ekle. Mevcut MVP bu filtreyi içermiyor.
