import { useState, useEffect } from "react";
import { NewsItem } from "./types";
import { NEWS_ENDPOINT } from "./config";
import NewsCard from "./components/NewsCard";
import {
  RefreshCw,
  Search,
  Clock,
  Newspaper,
  Radio,
  AlertTriangle,
  X,
  Calendar,
  ArrowUpDown
} from "lucide-react";

export default function App() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  // Filter States
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("Tümü");
  const [selectedLang, setSelectedLang] = useState<string>("all"); // "all", "tr", "en"
  const [sortBy, setSortBy] = useState<"newest" | "oldest">("newest");

  // Sunucunun bu tarama hakkında döndürdüğü özet (kaç kaynak yanıt verdi, süre...)
  const [meta, setMeta] = useState<{
    sources: number;
    total: number;
    withImage: number;
    elapsedMs: number;
  } | null>(null);

  // Real-time UTC clock
  const [currentTime, setCurrentTime] = useState<string>("");
  const [currentDate, setCurrentDate] = useState<string>("");

  useEffect(() => {
    // Clock tick
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      setCurrentDate(now.toLocaleDateString("tr-TR", { weekday: "long", year: "numeric", month: "long", day: "numeric" }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Haber akışını canlı olarak çek.
  // Sunucu her istekte 22 RSS kaynağını baştan tarar; hiçbir yerde önbellek
  // tutulmaz, bu yüzden istek birkaç saniye sürebilir.
  const fetchNews = async (force: boolean = false) => {
    if (force) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const res = await fetch(`${NEWS_ENDPOINT}?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Haber akışı alınamadı (HTTP ${res.status}).`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setNews(data.news || []);
      setLastUpdated(data.lastUpdated ?? null);
      setMeta(data.meta ?? null);
    } catch (err: any) {
      console.error("Fetch news failed:", err);
      setError(err.message || "Haberler yüklenirken beklenmedik bir hata oluştu.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchNews();
  }, []);

  // "Son güncelleme" göstergesi. Saat sayacı her saniye yeniden render
  // tetiklediği için bu değer kendiliğinden tazelenir.
  const formatLastUpdated = (ts: number | null) => {
    if (!ts) return "bilinmiyor";
    const mins = Math.floor((Date.now() - ts) / 60000);
    if (mins < 1) return "az önce";
    if (mins < 60) return `${mins} dk önce`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} saat önce`;
    return `${Math.floor(hrs / 24)} gün önce`;
  };

  // Dil sekmeleri. Sayımlar filtrelerden bağımsız, tüm arşiv üzerinden verilir.
  const LANGUAGES: Array<{ key: string; label: string; count: number }> = [
    { key: "all", label: "Tümü", count: news.length },
    { key: "tr", label: "Türkçe", count: news.filter((n) => n.lang === "tr").length },
    { key: "en", label: "English", count: news.filter((n) => n.lang === "en").length },
  ];

  // Categories list
  const CATEGORIES = [
    "Tümü",
    "Yapay Zeka",
    "Donanım",
    "Yazılım",
    "Mobil",
    "Oyun",
    "Bilim & Uzay",
    "Girişimcilik",
    "Genel",
  ];

  // Filtering & Sorting Logic
  const filteredNews = news
    .filter((item) => {
      const matchesSearch =
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.source.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCategory =
        selectedCategory === "Tümü" || item.category === selectedCategory;

      const matchesLang = selectedLang === "all" || item.lang === selectedLang;

      return matchesSearch && matchesCategory && matchesLang;
    })
    .sort((a, b) => {
      if (sortBy === "newest") {
        return b.timestamp - a.timestamp;
      } else {
        return a.timestamp - b.timestamp;
      }
    });

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col selection:bg-sky-500 selection:text-white">
      {/* Background glow effects */}
      <div className="absolute top-0 left-1/4 w-[400px] h-[400px] bg-blue-500/10 rounded-full ambient-glow pointer-events-none" />
      <div className="absolute top-1/3 right-10 w-[350px] h-[350px] bg-purple-500/10 rounded-full ambient-glow pointer-events-none" />

      {/* Main Header navigation */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-[#070b14]/85 border-b border-slate-900 px-4 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          
          {/* Logo Brand */}
          <div className="flex items-center space-x-2.5">
            <div className="relative w-8 h-8 rounded-xl bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center shadow-md shadow-sky-500/15">
              <Radio className="w-4 h-4 text-white animate-pulse" />
              <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-400 rounded-full ring-2 ring-[#070b14]" />
            </div>
            <div>
              <h1 className="font-display font-bold text-base tracking-tight text-white leading-tight">Teknoloji Haberleri</h1>
              <span className="text-[10px] text-slate-500 font-mono tracking-wider font-semibold uppercase">Küresel ve Yerel Akış</span>
            </div>
          </div>

          {/* Time and Stats Indicator (Desktop Only) */}
          <div className="hidden md:flex items-center space-x-6">
            <div className="flex items-center space-x-2 bg-slate-950 border border-slate-900 rounded-xl px-3.5 py-1.5 font-mono text-xs">
              <Clock className="w-3.5 h-3.5 text-sky-400" />
              <span className="text-slate-200 font-semibold">{currentTime}</span>
              <span className="text-slate-600">|</span>
              <span className="text-slate-400 text-[11px]">{currentDate}</span>
            </div>

            <div className="flex items-center space-x-2 text-xs">
              <span className="flex items-center justify-center w-2 h-2 bg-emerald-400 rounded-full animate-ping" />
              <span className="text-slate-400 font-medium">Toplam: <strong className="text-slate-200">{news.length} Haber</strong></span>
            </div>

            <div className="flex items-center space-x-1.5 text-xs text-slate-500">
              <RefreshCw className="w-3 h-3" />
              <span>Akış güncellendi: <strong className="text-slate-400 font-medium">{formatLastUpdated(lastUpdated)}</strong></span>
            </div>
          </div>

          {/* Header Action Controls */}
          <div className="flex items-center space-x-2.5">
            <button
              id="header-btn-refresh"
              onClick={() => fetchNews(true)}
              disabled={refreshing || loading}
              className="flex items-center bg-slate-900 hover:bg-slate-800 active:scale-95 disabled:opacity-50 text-slate-300 font-semibold text-xs px-3 py-2 rounded-xl border border-slate-800 transition-all cursor-pointer"
              title="Akışı yeniden yükle (haberler 30 dakikada bir otomatik güncellenir)"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refreshing ? "animate-spin text-sky-400" : ""}`} />
              Yenile
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Dashboard */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 lg:p-6 flex gap-6 relative">
        
        {/* Left Section (Filter bar & News feed grid) */}
        <div className="flex-1 flex flex-col space-y-6">
          
          {/* Quick Metrics & Search Bar */}
          <div className="bg-[#0b1222] border border-slate-900 rounded-2xl p-4 flex flex-col space-y-3.5">
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between w-full">
              {/* Search Field */}
              <div className="relative w-full md:max-w-md">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  id="news-search-field"
                  type="text"
                  placeholder="Haberlerde, kaynaklarda veya konularda ara..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-sky-500 focus:outline-none rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 transition-colors"
                />
                {searchQuery && (
                  <button
                    id="btn-clear-search"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-100 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Dil Filtresi — haberler kaynak dilinde gösterilir, çeviri yapılmaz */}
              <div className="flex items-center space-x-1.5 bg-slate-950 border border-slate-800 p-1 rounded-xl w-full md:w-auto justify-between md:justify-start">
                {LANGUAGES.map(({ key, label, count }) => (
                  <button
                    key={key}
                    id={`lang-filter-${key}`}
                    onClick={() => setSelectedLang(key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex-1 md:flex-none text-center ${
                      selectedLang === key ? "bg-slate-850 text-sky-400 font-bold" : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {label}
                    <span className={`ml-1.5 text-[10px] font-mono ${selectedLang === key ? "text-sky-500/70" : "text-slate-600"}`}>
                      {count}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom filters and sorting row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-900/60 pt-3.5">
              {/* Tarama özeti. Zaman aralığı filtresi kaldırıldı: akış zaten
                  yalnızca bugünün haberlerini taşıdığı için seçeneklerin hepsi
                  aynı sonucu verirdi. */}
              <div className="flex items-center space-x-2 w-full sm:w-auto text-[11px] text-slate-500">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-slate-400 font-medium whitespace-nowrap">Bugünün akışı</span>
                {meta && (
                  <span className="font-mono text-slate-600">
                    · {meta.sources}/{meta.total} kaynak · {(meta.elapsedMs / 1000).toFixed(1)} sn
                  </span>
                )}
              </div>

              {/* Sorting Switch */}
              <div className="flex items-center space-x-2 w-full sm:w-auto justify-between sm:justify-end">
                <div className="flex items-center space-x-2">
                  <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-[11px] text-slate-400 font-medium">Sıralama:</span>
                </div>
                <div className="flex items-center space-x-1 bg-slate-950 border border-slate-800 p-1 rounded-xl">
                  <button
                    id="sort-btn-newest"
                    onClick={() => setSortBy("newest")}
                    className={`px-3 py-1 rounded-lg text-[10px] font-semibold transition-all cursor-pointer whitespace-nowrap ${
                      sortBy === "newest" ? "bg-slate-850 text-sky-400 font-bold" : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    En Yeni Önce
                  </button>
                  <button
                    id="sort-btn-oldest"
                    onClick={() => setSortBy("oldest")}
                    className={`px-3 py-1 rounded-lg text-[10px] font-semibold transition-all cursor-pointer whitespace-nowrap ${
                      sortBy === "oldest" ? "bg-slate-850 text-sky-400 font-bold" : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    En Eski Önce
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Category Filter Chips */}
          <div className="flex items-center space-x-2 overflow-x-auto whitespace-nowrap pb-2 scrollbar-none">
            {CATEGORIES.map((cat) => (
              <button
                id={`cat-chip-${cat.replace(/\s+/g, "-")}`}
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer border ${
                  selectedCategory === cat
                    ? "bg-gradient-to-r from-sky-500 to-blue-600 text-white border-sky-400 font-bold shadow-lg shadow-sky-500/10"
                    : "bg-[#0b1222] text-slate-400 border-slate-900 hover:text-slate-200 hover:border-slate-800"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Error Banner */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl p-4 flex items-center space-x-3">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <div className="text-xs">
                <span className="font-bold">Bağlantı Sorunu: </span>
                {error}
              </div>
              <button
                id="btn-retry-fetch"
                onClick={() => fetchNews(true)}
                className="bg-red-500/20 hover:bg-red-500/35 text-red-200 text-xs px-3 py-1 rounded-lg ml-auto cursor-pointer"
              >
                Yeniden Dene
              </button>
            </div>
          )}

          {/* News Loading Skeletons */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="bg-[#0f172a] border border-slate-900 rounded-2xl p-5 h-48 flex flex-col justify-between animate-pulse">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="w-1/3 h-3 bg-slate-800 rounded" />
                      <div className="w-1/4 h-3 bg-slate-800 rounded" />
                    </div>
                    <div className="w-full h-5 bg-slate-800 rounded" />
                    <div className="w-5/6 h-4 bg-slate-800 rounded" />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="w-1/3 h-7 bg-slate-800 rounded-xl" />
                    <div className="w-1/4 h-3 bg-slate-800 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredNews.length === 0 ? (
            <div className="bg-[#0b1222] border border-slate-900 rounded-2xl p-12 text-center flex flex-col items-center justify-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-slate-950 flex items-center justify-center border border-slate-900">
                <Newspaper className="w-7 h-7 text-slate-600" />
              </div>
              <div>
                <h4 className="font-semibold text-slate-200 text-sm">Hiç Haber Bulunamadı</h4>
                <p className="text-slate-500 text-xs mt-1 max-w-sm mx-auto leading-relaxed">
                  Seçtiğiniz filtreleme kriterlerine uyan aktif bir teknoloji haberi bulunamadı. Filtreleri temizlemeyi veya aramayı sıfırlamayı deneyebilirsiniz.
                </p>
              </div>
              <button
                id="btn-reset-filters"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedCategory("Tümü");
                  setSelectedLang("all");
                }}
                className="bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs px-4 py-2 rounded-xl transition-all cursor-pointer"
              >
                Filtreleri Temizle
              </button>
            </div>
          ) : (
            // News Feed Cards Grid
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredNews.map((item) => (
                <NewsCard
                  key={item.id}
                  item={item}
                />
              ))}
            </div>
          )}

        </div>

      </main>

      {/* Persistent Footer and Credits */}
      <footer className="mt-12 bg-slate-950/40 border-t border-slate-950 py-8 text-center text-slate-500 text-xs">
        <div className="max-w-7xl mx-auto px-4 space-y-2">
          <p>© {new Date().getFullYear()} Teknoloji Haberleri. Bütün Hakları Saklıdır.</p>
          <p className="max-w-md mx-auto text-slate-600 leading-relaxed font-sans">
            Haber verileri 22 bağımsız RSS yayınlayıcısından 30 dakikada bir otomatik toplanır. Haberler kaynak dilinde sunulur; Türkçe ve İngilizce akışlar yukarıdaki sekmelerden ayrılabilir.
          </p>
        </div>
      </footer>
    </div>
  );
}
