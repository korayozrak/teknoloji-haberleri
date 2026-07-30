# Teknoloji Haberleri

22 kaynaktan (14 küresel + 8 Türkçe) otomatik toplanan, mükerrerleri ayıklanmış
teknoloji haber akışı. Haberler **kaynak dilinde** sunulur; Türkçe ve İngilizce
akışlar arayüzden ayrılabilir.

**Sunucusuz ve anahtarsız.** Site tamamen statiktir; RSS taraması ve görsel
çözümlemesi ziyaretçi istek attığında değil, GitHub Actions cron'u içinde
30 dakikada bir yapılır. Ziyaretçiye hazır bir `news.json` sunulur — bekleme yok,
uyuyan sunucu yok, API anahtarı yok, barındırma ücreti yok.

## Nasıl çalışıyor

```
GitHub Actions (30 dk'da bir)
  ├─ Arşivi Actions cache'inden geri yükle
  ├─ 22 RSS kaynağını paralel tara
  ├─ Teknoloji dışı içeriği ele (oto bakım, kupon spam'i, genel ekonomi...)
  ├─ Mükerrerleri ayıkla (başlık örtüşmesi ≥ %55)
  ├─ Eksik görsel/açıklamayı haber sayfasından çöz (og:image, og:description)
  ├─ Kategorileri kural motoruyla ata
  ├─ 14 gün / 500 haber sınırını uygula, arşivi cache'e kaydet
  └─ Vite ile derle → GitHub Pages'e yayınla

Ziyaretçi ─→ GitHub CDN ─→ news.json (statik)
```

### Görseller

RSS kaynaklarının yalnızca yarısı görsel veriyor. Eksik olanlar için haber
sayfasının `og:image` etiketi okunur — bu istek derleme sırasında atıldığı için
CORS engeli yok ve ziyaretçiye maliyeti sıfır. Sonuç: **görselli haber oranı
%50'den %92'ye çıkıyor.**

Kalan %8 için kart, boş bir kutu yerine kaynak adının tipografik ana unsur
olduğu tasarlanmış bir kapak gösterir.

Aynı indirmeden `og:description` de alınır; bazı feed'ler (örneğin Hacker News)
açıklama alanına içerik değil "Comments" gibi gezinme metni koyduğu için.

### Arşiv neden repoya commit edilmiyor

`news.json` ~400 KB. 30 dakikada bir commit edilse yılda ~2 GB'lık git nesnesi
birikir ve GitHub'ın önerdiği 1 GB depo sınırı aşılır. Bu yüzden arşiv
**Actions cache'inde** tutulur; maliyeti sıfırdır ve depo temiz kalır.

Cache kaybolursa (7 gün kullanılmama veya 10 GB LRU tahliyesi) arşiv tek koşuda
RSS'ten yeniden kurulur — feed'ler zaten ~2 haftalık geçmiş taşıdığı için ilk
koşu bile ~430 habere ulaşır.

## Yerel geliştirme

**Gereken:** Node.js 20+. Yapılandırma ya da API anahtarı gerekmez.

```bash
npm install
npm run news      # public/news.json üretir (~1 dk, görsel çözümlemesi dahil)
npm run dev       # http://localhost:5173
```

| Komut | Ne yapar |
|---|---|
| `npm run dev` | Vite geliştirme sunucusu |
| `npm run news` | RSS'i tarar, görselleri çözer, `public/news.json` yazar |
| `npm run build` | Statik siteyi `dist/` içine derler |
| `npm run preview` | Derlenmiş siteyi yerelde sunar |
| `npm run lint` | TypeScript tip kontrolü |

## Yayına alma

1. Depoyu GitHub'a **public** olarak gönderin (ücretsiz hesapta Pages ve sınırsız
   Actions dakikası bunu gerektirir).
2. **Settings → Pages → Source** ayarını **GitHub Actions** yapın.
3. **Actions → "Haberleri güncelle ve yayınla" → Run workflow** ile ilk koşuyu
   başlatın.

Secret ya da ortam değişkeni ayarlamanız gerekmez.

Site `https://<kullanıcı-adı>.github.io/<depo-adı>/` adresinde yayına girer.
`vite.config.ts` içindeki `base: './'` sayesinde depo adı ne olursa olsun çalışır.

## Bilinen sınırlar

- **"Yenile" butonu RSS taramaz.** Yalnızca `news.json`'ı yeniden çeker; yeni
  haberler 30 dakikalık cron'a bağlıdır.
- **GitHub cron'u garantili değildir.** Yoğun saatlerde 5–20 dakika gecikebilir.
- **Kategoriler kural tabanlıdır.** Anahtar kelime motoru Türkçe ve İngilizce
  için ayarlıdır ama her haberi doğru sınıflandıramaz; eşleşme bulunmayanlar
  "Genel" kategorisine düşer.

## Yapı

```
scripts/fetch-news.ts   Toplama motoru (RSS + eleme + dedup + görsel çözümleme)
src/App.tsx             Arama, dil/kategori/tarih filtreleri, sıralama
src/components/         Haber kartı ve görselsiz kapak tasarımı
public/news.json        Üretilen veri + 14 günlük arşiv (git'e dahil değil)
.github/workflows/      Cron + derleme + Pages deploy
```

### Kategori motoru hakkında bir not

Anahtar kelime eşleşmesi düz `includes()` ile yapılmaz. Türkçe sondan eklemeli
olduğu için kelimenin yalnızca **başı** sabitlenir (`oyun` → `oyunlar` eşleşir,
`program` → `ram` eşleşmez); kısaltmalar ve kökü başka kelimelerle çakışanlar
iki taraftan sabitlenir (`ai` → `aircraft` eşleşmez, `eyt` → `Kuveyt` eşleşmez).
`\b` kullanılmaz, çünkü JavaScript'te `\b` ş/ğ/ı/ö/ç/ü harflerini kelime
karakteri saymaz. Ayrıntı `scripts/fetch-news.ts` içindeki `keywordRegex`'te.
