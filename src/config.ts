/**
 * Haber akışının çekileceği adres.
 *
 * Varsayılan göreli yol, siteyi PHP dosyasıyla AYNI alan adında barındırdığınızı
 * varsayar (örn. site kökte, PHP `/api/news.php` içinde). Bu durumda tarayıcı
 * için aynı kaynak sayıldığından CORS ayarı gerekmez.
 *
 * Site başka bir yerdeyse (örn. GitHub Pages) derleme sırasında tam adresi verin:
 *   VITE_NEWS_ENDPOINT=https://alanadiniz.com/api/news.php npm run build
 * ve `php/news.php` içindeki ALLOWED_ORIGIN sabitine sitenin adresini yazın.
 */
export const NEWS_ENDPOINT = import.meta.env.VITE_NEWS_ENDPOINT || 'api/news.php';
