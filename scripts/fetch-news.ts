/**
 * Haber toplama motoru.
 *
 * GitHub Actions cron'u tarafından çalıştırılır. RSS kaynaklarını tarar,
 * mükerrer haberleri ayıklar, eksik görselleri haber sayfasından tamamlar,
 * kategorileri kural motoruyla atar ve sonucu `public/news.json`'a yazar.
 *
 * Çeviri YAPILMAZ. Haberler kaynak dilinde kalır; arayüz Türkçe / English
 * ayrımını `lang` alanı üzerinden sunar. Bu sayede hiçbir API anahtarı, kota
 * ya da hız sınırı devrede değildir.
 *
 * Arşiv birikimi: her koşuda mevcut `public/news.json` okunur ve yeni haberler
 * onun üstüne eklenir. Bir haber yalnızca bir kez işlenir; görseli bir kez
 * çözülür ve arşivde kalır.
 */

import fs from 'fs';
import path from 'path';
import Parser from 'rss-parser';

const OUTPUT_FILE = path.join(process.cwd(), 'public', 'news.json');

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_ARCHIVE_ITEMS = 500;
const MAX_ITEMS_PER_SOURCE = 35;
const FEED_TIMEOUT_MS = 8000;
const DUPLICATE_OVERLAP_THRESHOLD = 0.55;

// Eksik görselleri haber sayfasından çözerken kullanılan sınırlar
const OG_TIMEOUT_MS = 6000;
const OG_CONCURRENCY = 8;
const MAX_OG_LOOKUPS = 300;

const parser = new Parser();

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36';

// RSS Feed Sources (Curated for premium quality & high performance)
const SOURCES = [
  // English (Global Tech Leader Feeds)
  {name: 'TechCrunch',            url: 'https://techcrunch.com/feed/',                              lang: 'en'},
  {name: 'The Verge',             url: 'https://www.theverge.com/rss/index.xml',                    lang: 'en'},
  {name: 'Hacker News',           url: 'https://news.ycombinator.com/rss',                          lang: 'en'},
  {name: 'Wired',                 url: 'https://www.wired.com/feed/rss',                            lang: 'en'},
  {name: 'Engadget',              url: 'https://www.engadget.com/rss.xml',                           lang: 'en'},
  {name: 'TechRadar',             url: 'https://www.techradar.com/rss',                             lang: 'en'},
  {name: 'Ars Technica',          url: 'https://feeds.arstechnica.com/arstechnica/index',           lang: 'en'},
  {name: 'MIT Technology Review', url: 'https://www.technologyreview.com/feed/',                    lang: 'en'},
  {name: 'VentureBeat',           url: 'https://venturebeat.com/feed/',                             lang: 'en'},
  {name: 'Android Authority',     url: 'https://www.androidauthority.com/feed/',                    lang: 'en'},
  {name: '9to5Mac',               url: 'https://9to5mac.com/feed/',                                 lang: 'en'},
  {name: 'NVIDIA Deep Learning',  url: 'https://blogs.nvidia.com/blog/category/deep-learning/feed/', lang: 'en'},
  {name: 'MarkTechPost',          url: 'https://www.marktechpost.com/feed/',                        lang: 'en'},
  {name: 'OpenAI News',           url: 'https://openai.com/news/rss.xml',                           lang: 'en'},
  // Türkçe (Yerel Teknoloji Gündemi)
  {name: 'Webtekno',              url: 'https://www.webtekno.com/rss.xml',                          lang: 'tr'},
  {name: 'ShiftDelete',           url: 'https://shiftdelete.net/feed',                              lang: 'tr'},
  {name: 'Donanım Haber',         url: 'https://www.donanimhaber.com/rss/tum/',                     lang: 'tr'},
  {name: 'LOG',                   url: 'https://www.log.com.tr/feed/',                              lang: 'tr'},
  {name: 'Webrazzi',              url: 'https://webrazzi.com/feed',                                 lang: 'tr'},
  {name: 'Webrazzi Yapay Zeka',   url: 'https://webrazzi.com/kategori/yapay-zeka/feed',             lang: 'tr'},
  {name: 'Donanım Günlüğü',       url: 'https://www.donanimgunlugu.com/feed/',                      lang: 'tr'},
  {name: 'CHIP Türkiye',          url: 'https://www.chip.com.tr/rss',                               lang: 'tr'},
];

/**
 * Yayınlanan news.json'daki haber kaydı.
 *
 * Alanlar bilinçli olarak dar tutulur: dosya her ziyaretçiye indirildiği için
 * arayüzün okumadığı hiçbir alan taşınmaz.
 */
interface NewsItem {
  id: string;
  title: string;
  link: string;
  description: string;
  source: string;
  lang: string;
  category: string;
  timestamp: number;
  imageUrl?: string | null;
}

// ─── Genel yardımcılar ───────────────────────────────────────────────────────

/** Verilen işleri en fazla `limit` tanesi uçuşta olacak şekilde çalıştırır. */
async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({length: Math.min(limit, items.length)}, async () => {
    for (;;) {
      const idx = cursor++;
      if (idx >= items.length) return;
      results[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return results;
}

// ─── RSS okuma ───────────────────────────────────────────────────────────────

// Sanitize XML ampersands and common HTML entities to prevent XML parsing errors.
// Executed only on non-CDATA blocks to avoid modifying valid characters inside them.
function sanitizeXmlEntities(xmlText: string): string {
  const parts = xmlText.split(/(<!\[CDATA\[.*?\]\]>)/gs);

  const entities = [
    {name: 'nbsp', value: ' '},
    {name: 'hellip', value: '...'},
    {name: 'rsquo', value: "'"},
    {name: 'lsquo', value: "'"},
    {name: 'ldquo', value: '"'},
    {name: 'rdquo', value: '"'},
    {name: 'ndash', value: '-'},
    {name: 'mdash', value: '—'},
    {name: 'middot', value: '·'},
    {name: 'bull', value: '•'},
    {name: 'trade', value: '™'},
    {name: 'reg', value: '®'},
    {name: 'copy', value: '©'},
    {name: 'deg', value: '°'},
  ];

  return parts
    .map((part) => {
      if (part.startsWith('<![CDATA[')) {
        return part; // CDATA bloğuna hiç dokunma
      }
      let temp = part;
      for (const entity of entities) {
        temp = temp.replace(new RegExp(`&${entity.name};`, 'g'), entity.value);
      }
      // Geçerli bir XML entity'sine karşılık gelmeyen çıplak & işaretlerini kaçır
      return temp.replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/gi, '&amp;');
    })
    .join('');
}

// Fetch feed as text, sanitize XML issues, and parse with a configurable timeout
async function fetchAndParseFeed(url: string, timeoutMs = FEED_TIMEOUT_MS): Promise<any> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'application/rss+xml, application/rdf+xml, application/xml, text/xml, */*',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP status ${response.status}`);
    }

    const rawText = await response.text();
    const trimmed = rawText.trim().toLowerCase();

    // Bot korumasının döndürdüğü HTML sayfalarını XML sanıp ayrıştırmayı denemeyelim
    if (trimmed.startsWith('<!doctype html') || trimmed.startsWith('<html')) {
      throw new Error('XML feed yerine HTML sayfa geldi (istek bot korumasına takılmış olabilir).');
    }

    return await parser.parseString(sanitizeXmlEntities(rawText));
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error(`Timeout after ${timeoutMs / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─── Metin temizleme ─────────────────────────────────────────────────────────

// Helper to decode numeric, hex, and common named HTML entities
function decodeHtmlEntities(str: string): string {
  if (!str) return '';
  return str
    .replace(/&#(\d+);/g, (match, dec) => {
      try {
        return String.fromCharCode(parseInt(dec, 10));
      } catch {
        return match;
      }
    })
    .replace(/&#x([0-9a-f]+);/gi, (match, hex) => {
      try {
        return String.fromCharCode(parseInt(hex, 16));
      } catch {
        return match;
      }
    })
    .replace(/&([a-z0-9]+);/gi, (match, entity) => {
      const named: Record<string, string> = {
        ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’',
        quot: '"', amp: '&', lt: '<', gt: '>', apos: "'",
        nbsp: ' ', deg: '°', ndash: '–', mdash: '—', hellip: '…',
        copy: '©', reg: '®', trade: '™',
        ouml: 'ö', uuml: 'ü', ccedil: 'ç',
        scaron: 'š', eacute: 'é', agrave: 'à',
      };
      return named[entity.toLowerCase()] || match;
    });
}

// Helper to clean HTML tags and extract text
function cleanHtml(html: string): string {
  if (!html) return '';
  const clean = html
    .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '')
    .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ');

  return decodeHtmlEntities(clean).replace(/\s+/g, ' ').trim();
}

// ─── Görsel çözümleme ────────────────────────────────────────────────────────

// Takip pikselleri, ikonlar ve feed portalı linklerini ayıkla
const BLOCKED_IMAGE_HOSTS = ['feedsportal', 'doubleclick', 'feedburner', 'feedblitz', 'pixel'];

function normalizeImageUrl(src: string | undefined | null): string | null {
  if (!src) return null;
  let url = decodeHtmlEntities(src.trim());
  if (url.startsWith('//')) url = `https:${url}`;
  if (!url.startsWith('http')) return null;
  if (BLOCKED_IMAGE_HOSTS.some((host) => url.includes(host))) return null;
  return url;
}

// Extract rich featured image URLs from various RSS elements
function extractImageUrl(entry: any): string | null {
  // 1. enclosure url
  const enclosure = normalizeImageUrl(entry.enclosure?.url);
  if (enclosure) return enclosure;

  // 2. media:content / media:thumbnail namespaces
  const mediaContent = entry['media:content'] || entry['media:thumbnail'];
  if (mediaContent) {
    const first = Array.isArray(mediaContent) ? mediaContent[0] : mediaContent;
    const fromMedia = normalizeImageUrl(first?.$?.url || first?.url);
    if (fromMedia) return fromMedia;
  }

  // 3. HTML içeriğinden RegEx ile çıkar
  const htmlContent = entry['content:encoded'] || entry.content || entry.description || '';
  if (htmlContent) {
    const match = /<img[^>]+src=["']([^"']+)["']/i.exec(htmlContent);
    const fromHtml = normalizeImageUrl(match?.[1]);
    if (fromHtml) return fromHtml;
  }

  return null;
}

/**
 * RSS'te eksik olan görsel ve açıklamayı haber sayfasının kendisinden çöz.
 *
 * Neredeyse her haber sitesi sosyal medya paylaşımları için `og:image` ve
 * `og:description` etiketi koyuyor. Bu istek tarayıcıda değil, derleme sırasında
 * Actions içinde atıldığı için CORS engeli yok ve ziyaretçiye maliyeti sıfır.
 * Bulunan değerler arşive yazılır, yani her haber için yalnızca bir kez aranır.
 *
 * Görsel ve açıklama tek indirmeden birlikte çıkarılır; ikisi için ayrı istek atmak
 * gereksiz olurdu.
 */
interface OgMeta {
  image: string | null;
  description: string | null;
}

function matchMeta(html: string, property: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${property}["']`, 'i'),
  ];
  for (const pattern of patterns) {
    const value = pattern.exec(html)?.[1];
    if (value && value.trim()) return value.trim();
  }
  return null;
}

async function fetchOgMeta(pageUrl: string): Promise<OgMeta> {
  const empty: OgMeta = {image: null, description: null};
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OG_TIMEOUT_MS);

  try {
    const response = await fetch(pageUrl, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {'User-Agent': BROWSER_UA, Accept: 'text/html,application/xhtml+xml'},
    });

    if (!response.ok) return empty;
    if (!(response.headers.get('content-type') || '').includes('html')) return empty;

    // Etiketler <head> içinde; tüm sayfayı taramaya gerek yok
    const html = (await response.text()).slice(0, 250_000);

    const image =
      normalizeImageUrl(matchMeta(html, 'og:image')) ||
      normalizeImageUrl(matchMeta(html, 'og:image:secure_url')) ||
      normalizeImageUrl(matchMeta(html, 'og:image:url')) ||
      normalizeImageUrl(matchMeta(html, 'twitter:image')) ||
      normalizeImageUrl(matchMeta(html, 'twitter:image:src')) ||
      normalizeImageUrl(/<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i.exec(html)?.[1]);

    const rawDescription =
      matchMeta(html, 'og:description') ||
      matchMeta(html, 'twitter:description') ||
      matchMeta(html, 'description');

    const description = rawDescription ? cleanHtml(rawDescription) : null;

    return {image, description: description && description.length > 20 ? description : null};
  } catch {
    // Zaman aşımı, DNS hatası, bot koruması... eksik bilgiyle devam etmek yeterli
    return empty;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * RSS açıklaması işe yaramaz mı?
 *
 * Bazı feed'ler açıklama alanına içerik değil gezinme metni koyuyor:
 * Hacker News her haber için yalnızca yorum sayfası linki verdiği için
 * temizlendikten sonra elde "Comments" kalıyor.
 */
const NOISE_DESCRIPTIONS = new Set(['comments', 'comment', 'read more', 'devamını oku', 'link', 'article']);

function isUselessDescription(description: string): boolean {
  if (!description) return true;
  if (description.trim().length < 25) return true;
  return NOISE_DESCRIPTIONS.has(description.trim().toLowerCase());
}

// ─── Kategori ve eleme ───────────────────────────────────────────────────────

/**
 * Anahtar kelimeyi kelimenin BAŞINA sabitleyen bir regex üretir.
 *
 * Düz `includes()` kullanılamaz: "program" içinde "ram", "telefon" içinde "fon",
 * "Kuveyt" içinde "eyt", "studios" içinde "ios" geçtiği için haberler yanlış
 * kategoriye düşer ya da haksız yere elenir.
 *
 * Türkçe sondan eklemeli olduğundan varsayılan davranış yalnızca kelime başını
 * sabitlemektir: "oyun" -> "oyunlar", "oyuncu" eşleşir; "program" -> "ram" eşleşmez.
 *
 * EXACT_WORD listesindekiler ise iki taraftan sabitlenir. Bunlar ya kısaltmadır
 * (aksi halde "ai" "aircraft", "ipo" "ipod" ile eşleşir) ya da kökü başka bir
 * kelimeyle çakışır ("ram" -> "rampa", "intel" -> "intelligence").
 * Türkçe ekler apostrofla yazıldığı için ("RAM'ler") bu sabitleme gerçek
 * kullanımı engellemez.
 *
 * `\b` bilinçli olarak kullanılmıyor: JavaScript'te `\b` yalnızca [A-Za-z0-9_]
 * tabanlıdır ve ş, ğ, ı, ö, ç, ü harflerini kelime karakteri saymaz.
 */
const EXACT_WORD = new Set([
  // Kısaltmalar
  'ai', 'gpu', 'cpu', 'llm', 'ceo', 'gta', 'ios', 'api', 'ipo', 'vr', 'ar',
  'eyt', 'tüik', 'afad', 'mtv',
  // Kökü başka kelimelerle çakışanlar
  'ram', 'intel', 'mars', 'nasa', 'steam', 'game', 'chip',
]);

function keywordRegex(keyword: string): RegExp {
  const body = keyword.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tail = EXACT_WORD.has(keyword.toLowerCase()) ? '(?![\\p{L}\\p{N}])' : '';
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}${tail}`, 'u');
}

/**
 * Kategori kuralları. Sıra önemlidir: ilk eşleşen kategori kazanır.
 *
 * Çeviri katmanı olmadığı için tüm kategorizasyon buraya dayanıyor; bu yüzden
 * her kategoride Türkçe ve İngilizce anahtarlar birlikte tutulur.
 */
const CATEGORY_RULES: Array<[string, RegExp[]]> = (
  [
    ['Yapay Zeka', [
      'yapay zeka', 'makine öğrenimi', 'ai', 'chatgpt', 'gemini', 'copilot', 'claude', 'openai',
      'deepmind', 'anthropic', 'llm', 'machine learning', 'neural network', 'chatbot', 'inference',
    ]],
    ['Oyun', [
      'oyun', 'playstation', 'xbox', 'steam', 'nintendo', 'gamer', 'gaming', 'game', 'gta',
      'konsol', 'console', 'dlc', 'esports', 'espor',
    ]],
    ['Mobil', [
      'mobil', 'iphone', 'samsung', 'android', 'ios', 'xiaomi', 'akıllı telefon', 'telefon',
      'smartphone', 'tablet', 'wearable', 'akıllı saat', 'smartwatch',
    ]],
    ['Donanım', [
      'donanım', 'hardware', 'intel', 'amd', 'nvidia', 'gpu', 'cpu', 'ryzen', 'işlemci',
      'ekran kartı', 'ram', 'chip', 'chipset', 'processor', 'laptop', 'dizüstü', 'ssd', 'anakart',
    ]],
    ['Yazılım', [
      'yazılım', 'software', 'kod', 'geliştirici', 'developer', 'github', 'python', 'javascript',
      'typescript', 'linux', 'windows', 'programlama', 'programming', 'open source', 'açık kaynak',
      'api', 'framework', 'tarayıcı', 'browser',
    ]],
    ['Bilim & Uzay', [
      'uzay', 'bilim', 'nasa', 'spacex', 'spacecraft', 'mars', 'roket', 'rocket', 'teleskop',
      'telescope', 'uydu', 'satellite', 'kuantum', 'quantum', 'astronom', 'füzyon', 'fusion',
    ]],
    // "fon" ve "hisse" bilinçli olarak kullanılmıyor: "fonksiyon" ve "hissedin"
    // kelimelerinin de başına oturdukları için yanlış eşleşme üretiyorlar.
    ['Girişimcilik', [
      'girişim', 'startup', 'fonlama', 'yatırım', 'ceo', 'hisse senedi', 'borsa', 'satın aldı',
      'funding', 'venture', 'acquisition', 'acquire', 'ipo', 'valuation', 'raises', 'seed round',
    ]],
  ] as Array<[string, string[]]>
).map(([category, keywords]) => [category, keywords.map(keywordRegex)]);

// Simple rule-based categorizer
function autoCategorize(title: string, desc: string): string {
  const content = `${title} ${desc}`.toLowerCase();

  for (const [category, patterns] of CATEGORY_RULES) {
    if (patterns.some((re) => re.test(content))) {
      return category;
    }
  }

  return 'Genel';
}

// Teknoloji dışı içerikleri (oto bakım, genel ekonomi, market katalogları vb.) ayıkla
const NON_TECH_KEYWORDS = [
  // Otomobil bakımı / temel mekanik
  'şanzıman yağı', 'motor yağı', 'direksiyon yağı', 'fren yağı', 'fren hidroliği', 'fren balatası', 'balata değişimi',
  'lastik değişimi', 'kış lastiği', 'yaz lastiği', 'rot ayarı', 'rot balans', 'buji değişimi', 'amortisör',
  'baskı balata', 'debriyaj seti', 'oto sanayi', 'egzoz emisyon', 'karbüratör', 'buji fırçası', 'far temizliği',
  'cam filmi cezası', 'triger kayışı', 'v kayışı', 'supap ayarı', 'buji kablosu', 'antifriz', 'akü takviyesi',
  'periyodik bakım', 'yağ filtresi', 'hava filtresi', 'polen filtresi', 'yakıt filtresi', 'aks kafası', 'rotil',
  'salıncak burcu', 'direksiyon kutusu', 'şanzıman arızası', 'motor rektifiye', 'motor bloğu',
  // Genel ekonomi / kişisel finans (girişim yatırımı değil)
  'asgari ücret', 'emekli maaş', 'memur maaş', 'emeklilik', 'eyt', 'enflasyon oranı', 'tüik', 'enflasyon rakamları',
  'ehliyet harcı', 'pasaport harcı', 'mtv ödemesi', 'mtv zammı', 'trafik cezası', 'hız sınırı', 'radar cezası',
  'benzin fiyat', 'motorin fiyat', 'mazot fiyat', 'akaryakıt zammı', 'akaryakıta zam', 'benzin zammı', 'motorin zammı', 'mazot zammı',
  'brent petrol', 'lpg zammı', 'altın fiyatları', 'çeyrek altın', 'gram altın', 'asgari ücrete zam', 'emekli zammı',
  // Market katalogları
  'bim aktüel', 'a101 aktüel', 'şok aktüel', 'aktüel ürünler', 'indirim kataloğu', 'indirim broşürü', 'şok market',
  'migros indirim', 'carrefoursa', 'broşüründeki ürünler', 'kataloğunda neler var',
  // İngilizce kupon / affiliate içeriği. Wired ve benzeri yayınlar bunları
  // haber feed'lerine karıştırıyor ("Nike Promo Codes", "50% Off DoorDash...").
  'promo code', 'coupon', 'discount code', 'voucher code', 'deals of the day',
  // Yaşam tarzı, kozmetik, teknoloji dışı sağlık
  'yemek tarifi', 'tarifini veriyoruz', 'nasıl yapılır yemek', 'kolesterol', 'tansiyon ilacı', 'saç dökülmesi',
  'saç ekimi', 'cilt bakımı', 'kırışıklık', 'kilo verme', 'diyet programı', 'sağlıklı beslenme', 'kalp sağlığı',
  // Hava durumu, afet, yerel genel haber
  'meteoroloji uyarısı', 'hava durumu', 'kar yağışı', 'fırtına uyarısı', 'şiddetli rüzgar', 'sel felaketi',
  'deprem meydana geldi', 'deprem mi oldu', 'afad', 'kandilli rasathanesi', 'son dakika deprem', 'kar tatili',
];

// Aynı kelime-sınırı kuralı elemede de geçerli: "Kuveyt" içindeki "eyt"
// yüzünden meşru bir girişimcilik haberi elenmemeli.
const NON_TECH_PATTERNS: Array<[string, RegExp]> = NON_TECH_KEYWORDS.map((kw) => [kw, keywordRegex(kw)]);

function isTechnologyRelated(title: string, description: string): boolean {
  const content = `${title} ${description || ''}`.toLowerCase();
  const hit = NON_TECH_PATTERNS.find(([, re]) => re.test(content));
  if (hit) {
    console.log(`[Filtre] Teknoloji dışı atlandı: "${title}" (eşleşen: "${hit[0]}")`);
    return false;
  }
  return true;
}

// ─── Arşiv ve mükerrer ayıklama ──────────────────────────────────────────────

function loadExistingArchive(): NewsItem[] {
  try {
    if (!fs.existsSync(OUTPUT_FILE)) {
      console.log('[Arşiv] Mevcut news.json bulunamadı, sıfırdan başlanıyor.');
      return [];
    }
    const parsed = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
    if (Array.isArray(parsed?.news)) {
      console.log(`[Arşiv] ${parsed.news.length} haber okundu.`);
      return parsed.news;
    }
  } catch (err) {
    console.error('[Arşiv] news.json okunamadı, sıfırdan başlanıyor:', err);
  }
  return [];
}

const STOP_WORDS = new Set([
  've', 'veya', 'bir', 'ile', 'da', 'de', 'için', 'en', 'yeni',
  'the', 'a', 'an', 'of', 'to', 'in', 'on', 'for', 'and',
]);

function getTokens(str: string): string[] {
  return str
    .toLowerCase()
    .replace(/[^\w\sğüşıöçĞÜŞİÖÇ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

function calculateOverlap(tokensA: string[], tokensB: string[]): number {
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  const setA = new Set(tokensA);
  let common = 0;
  for (const t of tokensB) {
    if (setA.has(t)) common++;
  }
  return common / Math.min(tokensA.length, tokensB.length);
}

// ─── Ana akış ────────────────────────────────────────────────────────────────

async function main() {
  const existingArchive = loadExistingArchive();
  const nowMs = Date.now();

  console.log(`\n${SOURCES.length} RSS kaynağı paralel taranıyor...`);

  const fetchPromises = SOURCES.map(async (source) => {
    try {
      const feed = await fetchAndParseFeed(source.url);
      const feedItems = (feed.items || []).slice(0, MAX_ITEMS_PER_SOURCE);
      const itemsList: NewsItem[] = [];

      for (const entry of feedItems) {
        const title = cleanHtml(entry.title || '');
        const link = entry.link || '';
        const description = cleanHtml(entry.contentSnippet || entry.content || entry.summary || '');

        if (!title || !link) continue;
        if (!isTechnologyRelated(title, description)) continue;

        const pubDate = entry.pubDate || entry.isoDate || new Date().toISOString();
        const id = Buffer.from(link).toString('base64').replace(/[^a-zA-Z0-9]/g, '');

        itemsList.push({
          id,
          title,
          link,
          description,
          source: source.name,
          lang: source.lang,
          timestamp: new Date(pubDate).getTime() || nowMs,
          category: autoCategorize(title, description),
          imageUrl: extractImageUrl(entry),
        });
      }

      console.log(`  ✓ ${source.name}: ${itemsList.length} haber`);
      return itemsList;
    } catch (err: any) {
      console.error(`  ✗ ${source.name}: ${err.message}`);
      return [];
    }
  });

  const settled = await Promise.allSettled(fetchPromises);
  const allFetched: NewsItem[] = [];
  for (const res of settled) {
    if (res.status === 'fulfilled' && res.value) {
      allFetched.push(...res.value);
    }
  }

  // Hiç haber çekilemediyse ve elde arşiv de yoksa, boş bir dosya yazmak yerine hata ver
  if (allFetched.length === 0 && existingArchive.length === 0) {
    console.error('\n[Hata] Hiçbir kaynaktan haber çekilemedi ve mevcut arşiv boş. Çıkılıyor.');
    process.exit(1);
  }

  // 1. Arşivden 2 haftadan eski haberleri düş
  const existingFresh = existingArchive.filter((item) => nowMs - item.timestamp <= TWO_WEEKS_MS);
  const existingIds = new Set(existingFresh.map((item) => item.id));

  // 2. Arşivde olmayan, taze haberleri ayır
  const trulyNewFetched = allFetched.filter(
    (item) => nowMs - item.timestamp <= TWO_WEEKS_MS && !existingIds.has(item.id),
  );

  // 3. Başlık örtüşmesine göre mükerrerleri ayıkla
  const existingTokens = existingFresh.map((item) => getTokens(item.title));
  const dedupedNew: NewsItem[] = [];
  const dedupedTokens: string[][] = [];

  for (const item of trulyNewFetched) {
    const tokensNew = getTokens(item.title);
    const isDup =
      dedupedTokens.some((t) => calculateOverlap(tokensNew, t) >= DUPLICATE_OVERLAP_THRESHOLD) ||
      existingTokens.some((t) => calculateOverlap(tokensNew, t) >= DUPLICATE_OVERLAP_THRESHOLD);

    if (!isDup) {
      dedupedNew.push(item);
      dedupedTokens.push(tokensNew);
    }
  }

  console.log(
    `\nYeni bulunan: ${dedupedNew.length} haber (mükerrer atılan: ${trulyNewFetched.length - dedupedNew.length}).`,
  );

  // 4. Eksik görsel ve açıklamaları haber sayfasından tamamla.
  //    Yalnızca yeni haberler için yapılır; arşivdekiler bir kez çözülmüştür.
  const allNeeding = dedupedNew.filter((item) => !item.imageUrl || isUselessDescription(item.description));
  const needsMeta = allNeeding.slice(0, MAX_OG_LOOKUPS);
  const skippedLookups = allNeeding.length - needsMeta.length;

  if (needsMeta.length > 0) {
    console.log(`${needsMeta.length} haberin görseli/açıklaması sayfa kaynağından aranıyor...`);
    if (skippedLookups > 0) {
      console.log(`  (${skippedLookups} haber üst sınır nedeniyle atlandı)`);
    }

    const resolved = await runWithConcurrency(needsMeta, OG_CONCURRENCY, (item) => fetchOgMeta(item.link));

    let foundImages = 0;
    let foundDescriptions = 0;
    needsMeta.forEach((item, idx) => {
      const meta = resolved[idx];
      if (!item.imageUrl && meta.image) {
        item.imageUrl = meta.image;
        foundImages++;
      }
      if (isUselessDescription(item.description) && meta.description) {
        item.description = meta.description;
        foundDescriptions++;
        // Açıklama değiştiği için kategori yeniden hesaplanmalı
        item.category = autoCategorize(item.title, item.description);
      }
    });

    console.log(`  ${foundImages} görsel, ${foundDescriptions} açıklama tamamlandı.`);
  }

  let merged = [...existingFresh, ...dedupedNew];
  merged.sort((a, b) => b.timestamp - a.timestamp);
  merged = merged.slice(0, MAX_ARCHIVE_ITEMS);

  const withImage = merged.filter((item) => item.imageUrl).length;
  const trCount = merged.filter((item) => item.lang === 'tr').length;

  fs.mkdirSync(path.dirname(OUTPUT_FILE), {recursive: true});
  fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(
      {
        lastUpdated: Date.now(),
        count: merged.length,
        news: merged,
      },
      null,
      2,
    ),
    'utf8',
  );

  const pct = merged.length > 0 ? Math.round((withImage / merged.length) * 100) : 0;
  console.log(
    `\n✓ public/news.json yazıldı: ${merged.length} haber ` +
      `(${trCount} Türkçe, ${merged.length - trCount} İngilizce), görselli: ${withImage} (%${pct}).`,
  );
}

main().catch((err) => {
  console.error('\n[Kritik Hata]', err);
  process.exit(1);
});
