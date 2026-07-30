<?php
/**
 * Canlı haber akışı uç noktası.
 *
 * Her istekte 22 RSS kaynağını paralel tarar, teknoloji dışı içeriği eler,
 * mükerrerleri ayıklar, kategorize eder ve o günün haberlerini JSON döndürür.
 *
 * HİÇBİR ŞEY SAKLANMAZ. Ne dosya, ne veritabanı, ne oturum önbelleği.
 * Bu bilinçli bir tercihtir; maliyeti her isteğin 22 dış çağrı yapmasıdır.
 *
 * Gereken PHP eklentileri: curl, mbstring, simplexml (hepsi standarttır).
 */

declare(strict_types=1);

// ─── Ayarlar ────────────────────────────────────────────────────────────────

/** Yalnızca bugünün haberleri mi? false ise son 24 saat kullanılır. */
const TODAY_ONLY = true;

/** "Bugün" hangi saat dilimine göre hesaplanacak. */
const TIMEZONE = 'Europe/Istanbul';

/** Kaynak başına en fazla haber. */
const MAX_ITEMS_PER_SOURCE = 35;

/** RSS isteği zaman aşımı (saniye). */
const FEED_TIMEOUT = 8;

/** Paralel RSS bağlantı sayısı. */
const FEED_CONCURRENCY = 12;

/**
 * Görseli olmayan haberler için sayfa kaynağından og:image aranmasına
 * ayrılan toplam süre (saniye). 0 yazarsanız bu adım tamamen kapanır.
 *
 * Süre dolduğunda kalan haberler görselsiz bırakılır; arayüz onlar için
 * tasarlanmış bir kapak gösterdiği için akış bozulmaz.
 *
 * Saklama yapılmadığı için bu arama her istekte tekrarlanır. Yükseltirseniz
 * sayfa açılışı yavaşlar, düşürürseniz görselli haber oranı düşer.
 */
const OG_TIME_BUDGET = 4;

/** og:image araması için paralel bağlantı sayısı. */
const OG_CONCURRENCY = 12;

/** Başlık örtüşme eşiği (mükerrer sayılma sınırı). */
const DUPLICATE_OVERLAP_THRESHOLD = 0.55;

/**
 * Siteye izin verilen kaynak (origin).
 *
 * Site bu PHP ile aynı alan adındaysa CORS'a hiç gerek yoktur, boş bırakın.
 * Site başka bir yerdeyse (örn. GitHub Pages) tam adresi yazın:
 *   const ALLOWED_ORIGIN = 'https://korayozrak.github.io';
 * '*' yazmaktan kaçının; uç nokta herkese açık bir vekile dönüşür.
 */
const ALLOWED_ORIGIN = '';

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    . '(KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36';

const SOURCES = [
    // English
    ['name' => 'TechCrunch',            'url' => 'https://techcrunch.com/feed/',                               'lang' => 'en'],
    ['name' => 'The Verge',             'url' => 'https://www.theverge.com/rss/index.xml',                     'lang' => 'en'],
    ['name' => 'Hacker News',           'url' => 'https://news.ycombinator.com/rss',                           'lang' => 'en'],
    ['name' => 'Wired',                 'url' => 'https://www.wired.com/feed/rss',                             'lang' => 'en'],
    ['name' => 'Engadget',              'url' => 'https://www.engadget.com/rss.xml',                           'lang' => 'en'],
    ['name' => 'TechRadar',             'url' => 'https://www.techradar.com/rss',                              'lang' => 'en'],
    ['name' => 'Ars Technica',          'url' => 'https://feeds.arstechnica.com/arstechnica/index',            'lang' => 'en'],
    ['name' => 'MIT Technology Review', 'url' => 'https://www.technologyreview.com/feed/',                     'lang' => 'en'],
    ['name' => 'VentureBeat',           'url' => 'https://venturebeat.com/feed/',                              'lang' => 'en'],
    ['name' => 'Android Authority',     'url' => 'https://www.androidauthority.com/feed/',                     'lang' => 'en'],
    ['name' => '9to5Mac',               'url' => 'https://9to5mac.com/feed/',                                  'lang' => 'en'],
    ['name' => 'NVIDIA Deep Learning',  'url' => 'https://blogs.nvidia.com/blog/category/deep-learning/feed/', 'lang' => 'en'],
    ['name' => 'MarkTechPost',          'url' => 'https://www.marktechpost.com/feed/',                         'lang' => 'en'],
    ['name' => 'OpenAI News',           'url' => 'https://openai.com/news/rss.xml',                            'lang' => 'en'],
    // Türkçe
    ['name' => 'Webtekno',              'url' => 'https://www.webtekno.com/rss.xml',                           'lang' => 'tr'],
    ['name' => 'ShiftDelete',           'url' => 'https://shiftdelete.net/feed',                               'lang' => 'tr'],
    ['name' => 'Donanım Haber',         'url' => 'https://www.donanimhaber.com/rss/tum/',                      'lang' => 'tr'],
    ['name' => 'LOG',                   'url' => 'https://www.log.com.tr/feed/',                               'lang' => 'tr'],
    ['name' => 'Webrazzi',              'url' => 'https://webrazzi.com/feed',                                  'lang' => 'tr'],
    ['name' => 'Webrazzi Yapay Zeka',   'url' => 'https://webrazzi.com/kategori/yapay-zeka/feed',              'lang' => 'tr'],
    ['name' => 'Donanım Günlüğü',       'url' => 'https://www.donanimgunlugu.com/feed/',                       'lang' => 'tr'],
    ['name' => 'CHIP Türkiye',          'url' => 'https://www.chip.com.tr/rss',                                'lang' => 'tr'],
];

/**
 * Kısaltmalar ve kökü başka kelimelerle çakışanlar. Bunlar iki taraftan
 * sabitlenir; aksi halde "ai" -> "aircraft", "ram" -> "rampa",
 * "eyt" -> "Kuveyt", "ipo" -> "ipod" ile eşleşir.
 */
const EXACT_WORD = [
    'ai', 'gpu', 'cpu', 'llm', 'ceo', 'gta', 'ios', 'api', 'ipo', 'vr', 'ar',
    'eyt', 'tüik', 'afad', 'mtv',
    'ram', 'intel', 'mars', 'nasa', 'steam', 'game', 'chip',
];

/** Kategori kuralları. Sıra önemlidir: ilk eşleşen kazanır. */
const CATEGORY_RULES = [
    ['Yapay Zeka', ['yapay zeka', 'makine öğrenimi', 'ai', 'chatgpt', 'gemini', 'copilot', 'claude', 'openai',
        'deepmind', 'anthropic', 'llm', 'machine learning', 'neural network', 'chatbot', 'inference']],
    ['Oyun', ['oyun', 'playstation', 'xbox', 'steam', 'nintendo', 'gamer', 'gaming', 'game', 'gta',
        'konsol', 'console', 'dlc', 'esports', 'espor']],
    ['Mobil', ['mobil', 'iphone', 'samsung', 'android', 'ios', 'xiaomi', 'akıllı telefon', 'telefon',
        'smartphone', 'tablet', 'wearable', 'akıllı saat', 'smartwatch']],
    ['Donanım', ['donanım', 'hardware', 'intel', 'amd', 'nvidia', 'gpu', 'cpu', 'ryzen', 'işlemci',
        'ekran kartı', 'ram', 'chip', 'chipset', 'processor', 'laptop', 'dizüstü', 'ssd', 'anakart']],
    ['Yazılım', ['yazılım', 'software', 'kod', 'geliştirici', 'developer', 'github', 'python', 'javascript',
        'typescript', 'linux', 'windows', 'programlama', 'programming', 'open source', 'açık kaynak',
        'api', 'framework', 'tarayıcı', 'browser']],
    ['Bilim & Uzay', ['uzay', 'bilim', 'nasa', 'spacex', 'spacecraft', 'mars', 'roket', 'rocket', 'teleskop',
        'telescope', 'uydu', 'satellite', 'kuantum', 'quantum', 'astronom', 'füzyon', 'fusion']],
    // "fon" ve "hisse" bilinçli olarak yok: "fonksiyon" ve "hissedin"
    // kelimelerinin de başına oturup yanlış eşleşme üretiyorlar.
    ['Girişimcilik', ['girişim', 'startup', 'fonlama', 'yatırım', 'ceo', 'hisse senedi', 'borsa', 'satın aldı',
        'funding', 'venture', 'acquisition', 'acquire', 'ipo', 'valuation', 'raises', 'seed round']],
];

/** Teknoloji dışı içerik (oto bakım, genel ekonomi, market katalogları, kupon spam'i). */
const NON_TECH_KEYWORDS = [
    'şanzıman yağı', 'motor yağı', 'direksiyon yağı', 'fren yağı', 'fren hidroliği', 'fren balatası', 'balata değişimi',
    'lastik değişimi', 'kış lastiği', 'yaz lastiği', 'rot ayarı', 'rot balans', 'buji değişimi', 'amortisör',
    'baskı balata', 'debriyaj seti', 'oto sanayi', 'egzoz emisyon', 'karbüratör', 'far temizliği',
    'cam filmi cezası', 'triger kayışı', 'supap ayarı', 'antifriz', 'akü takviyesi',
    'periyodik bakım', 'yağ filtresi', 'polen filtresi', 'yakıt filtresi', 'rotil',
    'salıncak burcu', 'şanzıman arızası', 'motor rektifiye',
    'asgari ücret', 'emekli maaş', 'memur maaş', 'emeklilik', 'eyt', 'enflasyon oranı', 'tüik', 'enflasyon rakamları',
    'ehliyet harcı', 'pasaport harcı', 'mtv ödemesi', 'mtv zammı', 'trafik cezası', 'radar cezası',
    'benzin fiyat', 'motorin fiyat', 'mazot fiyat', 'akaryakıt zammı', 'benzin zammı', 'motorin zammı',
    'brent petrol', 'lpg zammı', 'altın fiyatları', 'çeyrek altın', 'gram altın', 'emekli zammı',
    'bim aktüel', 'a101 aktüel', 'şok aktüel', 'aktüel ürünler', 'indirim kataloğu', 'indirim broşürü',
    'migros indirim', 'carrefoursa', 'kataloğunda neler var',
    'promo code', 'coupon', 'discount code', 'voucher code', 'deals of the day',
    'yemek tarifi', 'kolesterol', 'tansiyon ilacı', 'saç dökülmesi',
    'saç ekimi', 'cilt bakımı', 'kilo verme', 'diyet programı', 'kalp sağlığı',
    'meteoroloji uyarısı', 'hava durumu', 'kar yağışı', 'fırtına uyarısı', 'sel felaketi',
    'deprem meydana geldi', 'deprem mi oldu', 'afad', 'kandilli rasathanesi', 'kar tatili',
];

const STOP_WORDS = ['ve', 'veya', 'bir', 'ile', 'da', 'de', 'için', 'en', 'yeni',
    'the', 'a', 'an', 'of', 'to', 'in', 'on', 'for', 'and'];

// ─── PHP 7.4 uyumluluğu ─────────────────────────────────────────────────────
// str_starts_with ve str_contains PHP 8.0 ile geldi. Paylaşımlı hosting'lerde
// hâlâ 7.4 çıkabildiği için burada karşılıkları tanımlanır.

if (!function_exists('str_starts_with')) {
    function str_starts_with(string $haystack, string $needle): bool
    {
        return $needle === '' || strncmp($haystack, $needle, strlen($needle)) === 0;
    }
}

if (!function_exists('str_contains')) {
    function str_contains(string $haystack, string $needle): bool
    {
        return $needle === '' || strpos($haystack, $needle) !== false;
    }
}

// ─── Yardımcılar ────────────────────────────────────────────────────────────

/**
 * Anahtar kelimeyi kelimenin BAŞINA sabitleyen bir regex üretir.
 *
 * Düz strpos() kullanılamaz: "program" içinde "ram", "telefon" içinde "fon",
 * "Kuveyt" içinde "eyt" geçtiği için haberler yanlış kategoriye düşer ya da
 * haksız yere elenir.
 *
 * Türkçe sondan eklemeli olduğundan varsayılan olarak yalnızca kelime başı
 * sabitlenir: "oyun" -> "oyunlar" eşleşir, "program" -> "ram" eşleşmez.
 * EXACT_WORD listesindekiler iki taraftan sabitlenir.
 *
 * \b kullanılmaz: \b yalnızca ASCII tabanlıdır ve ş, ğ, ı, ö, ç, ü
 * harflerini kelime karakteri saymaz.
 */
function keyword_regex(string $keyword): string
{
    $body = preg_quote(mb_strtolower($keyword, 'UTF-8'), '/');
    $tail = in_array(mb_strtolower($keyword, 'UTF-8'), EXACT_WORD, true) ? '(?![\p{L}\p{N}])' : '';
    return '/(?<![\p{L}\p{N}])' . $body . $tail . '/u';
}

function decode_entities(string $text): string
{
    return html_entity_decode($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');
}

function clean_html(string $html): string
{
    if ($html === '') {
        return '';
    }
    $clean = preg_replace('/<script[^>]*>.*?<\/script>/is', ' ', $html) ?? $html;
    $clean = preg_replace('/<style[^>]*>.*?<\/style>/is', ' ', $clean) ?? $clean;
    $clean = preg_replace('/<[^>]*>/', ' ', $clean) ?? $clean;
    $clean = decode_entities($clean);
    $clean = preg_replace('/\s+/u', ' ', $clean) ?? $clean;
    return trim($clean);
}

function normalize_image_url(?string $src): ?string
{
    if ($src === null || trim($src) === '') {
        return null;
    }
    $url = trim(decode_entities($src));
    if (str_starts_with($url, '//')) {
        $url = 'https:' . $url;
    }
    if (!str_starts_with($url, 'http')) {
        return null;
    }
    foreach (['feedsportal', 'doubleclick', 'feedburner', 'feedblitz', 'pixel'] as $blocked) {
        if (str_contains($url, $blocked)) {
            return null;
        }
    }
    return $url;
}

function is_technology_related(string $title, string $description): bool
{
    $content = mb_strtolower($title . ' ' . $description, 'UTF-8');
    foreach (NON_TECH_KEYWORDS as $keyword) {
        if (preg_match(keyword_regex($keyword), $content) === 1) {
            return false;
        }
    }
    return true;
}

function auto_categorize(string $title, string $description): string
{
    $content = mb_strtolower($title . ' ' . $description, 'UTF-8');
    foreach (CATEGORY_RULES as [$category, $keywords]) {
        foreach ($keywords as $keyword) {
            if (preg_match(keyword_regex($keyword), $content) === 1) {
                return $category;
            }
        }
    }
    return 'Genel';
}

/** @return string[] */
function get_tokens(string $text): array
{
    $lower = mb_strtolower($text, 'UTF-8');
    $stripped = preg_replace('/[^\p{L}\p{N}\s]/u', ' ', $lower) ?? $lower;
    $parts = preg_split('/\s+/u', trim($stripped)) ?: [];
    return array_values(array_filter(
        $parts,
        static fn(string $w): bool => mb_strlen($w, 'UTF-8') > 2 && !in_array($w, STOP_WORDS, true)
    ));
}

/** @param string[] $a @param string[] $b */
function overlap_ratio(array $a, array $b): float
{
    if ($a === [] || $b === []) {
        return 0.0;
    }
    $setA = array_flip($a);
    $common = 0;
    foreach ($b as $token) {
        if (isset($setA[$token])) {
            $common++;
        }
    }
    return $common / min(count($a), count($b));
}

/**
 * Birden çok URL'i paralel indirir.
 *
 * @param array<string,string> $urls  anahtar => url
 * @return array<string,string>       anahtar => gövde (başarısızlar yok)
 */
function fetch_parallel(array $urls, int $timeout, int $concurrency, string $accept, ?float $deadline = null): array
{
    $results = [];
    $queue = $urls;
    $multi = curl_multi_init();
    $handles = [];

    $addHandle = static function (string $key, string $url) use ($multi, &$handles, $timeout, $accept): void {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS      => 5,
            CURLOPT_TIMEOUT        => $timeout,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_ENCODING       => '',
            CURLOPT_USERAGENT      => BROWSER_UA,
            CURLOPT_HTTPHEADER     => ['Accept: ' . $accept],
        ]);
        curl_multi_add_handle($multi, $ch);
        $handles[(int) $ch] = ['handle' => $ch, 'key' => $key];
    };

    // İlk partiyi kuyruğa al
    while (count($handles) < $concurrency && $queue !== []) {
        $key = array_key_first($queue);
        $addHandle((string) $key, $queue[$key]);
        unset($queue[$key]);
    }

    do {
        curl_multi_exec($multi, $running);
        // select() etkin bağlantı yokken -1 döner; o durumda kısa bir uyku
        // koymazsak döngü boşa CPU yakar.
        if (curl_multi_select($multi, 0.5) === -1) {
            usleep(20000);
        }

        while (($info = curl_multi_info_read($multi)) !== false) {
            $ch = $info['handle'];
            $id = (int) $ch;
            if (isset($handles[$id])) {
                $key = $handles[$id]['key'];
                $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
                if ($info['result'] === CURLE_OK && $status >= 200 && $status < 300) {
                    $body = curl_multi_getcontent($ch);
                    if (is_string($body) && $body !== '') {
                        $results[$key] = $body;
                    }
                }
                unset($handles[$id]);
            }
            curl_multi_remove_handle($multi, $ch);
            curl_close($ch);

            // Süre bütçesi dolduysa yeni istek başlatma
            $outOfTime = $deadline !== null && microtime(true) >= $deadline;
            if (!$outOfTime && $queue !== []) {
                $key = array_key_first($queue);
                $addHandle((string) $key, $queue[$key]);
                unset($queue[$key]);
            }
        }

        if ($deadline !== null && microtime(true) >= $deadline) {
            break; // Kalan istekleri iptal et
        }
    } while ($running > 0 || $handles !== []);

    // Bütçe dolduysa uçuşta kalanları temizle
    foreach ($handles as $entry) {
        curl_multi_remove_handle($multi, $entry['handle']);
        curl_close($entry['handle']);
    }
    curl_multi_close($multi);

    return $results;
}

/** RSS 2.0 ve Atom biçimlerini tek bir madde listesine indirger. */
function parse_feed(string $xml, string $sourceName, string $lang, int $todayCutoff): array
{
    $previous = libxml_use_internal_errors(true);
    $doc = simplexml_load_string($xml, 'SimpleXMLElement', LIBXML_NOCDATA | LIBXML_NOWARNING | LIBXML_NOERROR);
    libxml_clear_errors();
    libxml_use_internal_errors($previous);

    if ($doc === false) {
        return [];
    }

    $entries = [];
    if (isset($doc->channel->item)) {
        $entries = $doc->channel->item;      // RSS 2.0
    } elseif (isset($doc->entry)) {
        $entries = $doc->entry;              // Atom
    } elseif (isset($doc->item)) {
        $entries = $doc->item;               // RDF / RSS 1.0
    }

    $items = [];
    $seen = 0;

    foreach ($entries as $entry) {
        if ($seen++ >= MAX_ITEMS_PER_SOURCE) {
            break;
        }

        $title = clean_html((string) $entry->title);

        // Bağlantı: RSS'te metin, Atom'da öznitelik.
        // Atom girdilerinde birden çok <link> olabiliyor (alternate, self,
        // replies...). Önce rel="alternate" olanı, yoksa rel'i olmayanı arıyoruz;
        // aksi halde The Verge gibi Atom kaynaklarında yorum/self linki alınır.
        $link = trim((string) $entry->link);
        if ($link === '' && isset($entry->link)) {
            $fallback = '';
            foreach ($entry->link as $linkNode) {
                $href = trim((string) ($linkNode['href'] ?? ''));
                if ($href === '') {
                    continue;
                }
                $rel = strtolower(trim((string) ($linkNode['rel'] ?? '')));
                if ($rel === 'alternate') {
                    $link = $href;
                    break;
                }
                if ($rel === '' && $fallback === '') {
                    $fallback = $href;
                }
            }
            if ($link === '' ) {
                $link = $fallback;
            }
        }
        if ($title === '' || $link === '') {
            continue;
        }

        $media = $entry->children('http://search.yahoo.com/mrss/');
        $content = $entry->children('http://purl.org/rss/1.0/modules/content/');

        $rawDescription = (string) ($entry->description ?? '');
        if ($rawDescription === '') {
            $rawDescription = (string) ($entry->summary ?? '');
        }
        if ($rawDescription === '') {
            $rawDescription = (string) ($content->encoded ?? '');
        }
        $description = clean_html($rawDescription);

        if (!is_technology_related($title, $description)) {
            continue;
        }

        // Tarih alanı biçime göre değişiyor: RSS pubDate, Atom published/updated.
        // SimpleXML'de olmayan çocuk erişimi null döndürmediği için ?? güvenilmez,
        // açıkça isset ile bakılır.
        $dateText = '';
        foreach (['pubDate', 'published', 'updated', 'date'] as $field) {
            if (isset($entry->{$field}) && trim((string) $entry->{$field}) !== '') {
                $dateText = trim((string) $entry->{$field});
                break;
            }
        }
        $timestamp = $dateText !== '' ? strtotime($dateText) : false;
        if ($timestamp === false) {
            $timestamp = time();
        }
        if ($timestamp < $todayCutoff) {
            continue;
        }

        // Görsel: enclosure -> media:content -> media:thumbnail -> gövdedeki ilk <img>
        $imageUrl = null;
        if (isset($entry->enclosure['url'])) {
            $imageUrl = normalize_image_url((string) $entry->enclosure['url']);
        }
        if ($imageUrl === null && isset($media->content)) {
            foreach ($media->content as $mediaContent) {
                $imageUrl = normalize_image_url((string) ($mediaContent['url'] ?? ''));
                if ($imageUrl !== null) {
                    break;
                }
            }
        }
        if ($imageUrl === null && isset($media->thumbnail)) {
            $imageUrl = normalize_image_url((string) ($media->thumbnail['url'] ?? ''));
        }
        if ($imageUrl === null) {
            $html = (string) ($content->encoded ?? '') ?: $rawDescription;
            if ($html !== '' && preg_match('/<img[^>]+src=["\']([^"\']+)["\']/i', $html, $m) === 1) {
                $imageUrl = normalize_image_url($m[1]);
            }
        }

        $items[] = [
            'id'          => substr(hash('sha1', $link), 0, 16),
            'title'       => $title,
            'link'        => $link,
            'description' => $description,
            'source'      => $sourceName,
            'lang'        => $lang,
            'category'    => auto_categorize($title, $description),
            'timestamp'   => $timestamp * 1000,
            'imageUrl'    => $imageUrl,
        ];
    }

    return $items;
}

/** Sayfa kaynağından og:image çıkarır. */
function extract_og_image(string $html): ?string
{
    $patterns = [
        '/<meta[^>]+(?:property|name)=["\']og:image(?::secure_url|:url)?["\'][^>]+content=["\']([^"\']+)["\']/i',
        '/<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\']og:image(?::secure_url|:url)?["\']/i',
        '/<meta[^>]+(?:property|name)=["\']twitter:image(?::src)?["\'][^>]+content=["\']([^"\']+)["\']/i',
    ];
    foreach ($patterns as $pattern) {
        if (preg_match($pattern, $html, $m) === 1) {
            $url = normalize_image_url($m[1]);
            if ($url !== null) {
                return $url;
            }
        }
    }
    return null;
}

// ─── Ana akış ───────────────────────────────────────────────────────────────

header('Content-Type: application/json; charset=utf-8');
// Hiçbir yerde saklanmasın: ara katmanlar ve tarayıcı da önbelleğe almasın.
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

if (ALLOWED_ORIGIN !== '') {
    header('Access-Control-Allow-Origin: ' . ALLOWED_ORIGIN);
    header('Vary: Origin');
}
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$startedAt = microtime(true);

try {
    $tz = new DateTimeZone(TIMEZONE);
    if (TODAY_ONLY) {
        $midnight = new DateTimeImmutable('today midnight', $tz);
        $cutoff = $midnight->getTimestamp();
    } else {
        $cutoff = time() - 86400;
    }

    // 1. Feed'leri paralel indir
    $feedUrls = [];
    foreach (SOURCES as $index => $source) {
        $feedUrls[(string) $index] = $source['url'];
    }
    $bodies = fetch_parallel(
        $feedUrls,
        FEED_TIMEOUT,
        FEED_CONCURRENCY,
        'application/rss+xml, application/xml, text/xml, */*'
    );

    // 2. Ayrıştır, ele, kategorize et
    $all = [];
    $okSources = 0;
    foreach (SOURCES as $index => $source) {
        $body = $bodies[(string) $index] ?? null;
        if ($body === null) {
            continue;
        }
        $parsed = parse_feed($body, $source['name'], $source['lang'], $cutoff);
        if ($parsed !== []) {
            $okSources++;
        }
        foreach ($parsed as $item) {
            $all[] = $item;
        }
    }

    // 3. Mükerrerleri ayıkla (aynı bağlantı + benzer başlık)
    usort($all, static fn(array $a, array $b): int => $b['timestamp'] <=> $a['timestamp']);

    $news = [];
    $tokenCache = [];
    $seenIds = [];

    foreach ($all as $item) {
        if (isset($seenIds[$item['id']])) {
            continue;
        }
        $tokens = get_tokens($item['title']);
        $isDuplicate = false;
        foreach ($tokenCache as $existing) {
            if (overlap_ratio($tokens, $existing) >= DUPLICATE_OVERLAP_THRESHOLD) {
                $isDuplicate = true;
                break;
            }
        }
        if ($isDuplicate) {
            continue;
        }
        $seenIds[$item['id']] = true;
        $tokenCache[] = $tokens;
        $news[] = $item;
    }

    // 4. Görseli olmayanlar için, süre bütçesi elverdiğince og:image ara
    $ogFound = 0;
    if (OG_TIME_BUDGET > 0) {
        $missing = [];
        foreach ($news as $i => $item) {
            if ($item['imageUrl'] === null) {
                $missing[(string) $i] = $item['link'];
            }
        }
        if ($missing !== []) {
            $pages = fetch_parallel(
                $missing,
                OG_TIME_BUDGET,
                OG_CONCURRENCY,
                'text/html,application/xhtml+xml',
                microtime(true) + OG_TIME_BUDGET
            );
            foreach ($pages as $i => $html) {
                $image = extract_og_image(substr($html, 0, 250000));
                if ($image !== null) {
                    $news[(int) $i]['imageUrl'] = $image;
                    $ogFound++;
                }
            }
        }
    }

    $withImage = 0;
    $turkish = 0;
    foreach ($news as $item) {
        if ($item['imageUrl'] !== null) {
            $withImage++;
        }
        if ($item['lang'] === 'tr') {
            $turkish++;
        }
    }

    echo json_encode([
        'lastUpdated' => (int) round(microtime(true) * 1000),
        'count'       => count($news),
        'meta'        => [
            'sources'    => $okSources,
            'total'      => count(SOURCES),
            'withImage'  => $withImage,
            'ogResolved' => $ogFound,
            'turkish'    => $turkish,
            'elapsedMs'  => (int) round((microtime(true) - $startedAt) * 1000),
        ],
        'news'        => $news,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'error' => 'Haber akışı oluşturulamadı.',
        'detail' => $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE);
}
