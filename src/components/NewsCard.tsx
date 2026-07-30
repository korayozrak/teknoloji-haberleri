import { NewsItem } from "../types";
import {
  ExternalLink,
  Sparkles,
  Clock,
  Cpu,
  Smartphone,
  Gamepad2,
  Code,
  Rocket,
  Globe,
  Newspaper,
  HelpCircle
} from "lucide-react";
import { motion } from "motion/react";

interface NewsCardProps {
  item: NewsItem;
}

export default function NewsCard({ item }: NewsCardProps) {
  // Get matching category style & icon
  const getCategoryMeta = (cat: string) => {
    switch (cat) {
      case "Yapay Zeka":
        return { 
          bg: "bg-purple-500/10 text-purple-400 border-purple-500/20", 
          icon: <Sparkles className="w-3.5 h-3.5 mr-1" /> 
        };
      case "Donanım":
        return { 
          bg: "bg-amber-500/10 text-amber-400 border-amber-500/20", 
          icon: <Cpu className="w-3.5 h-3.5 mr-1" /> 
        };
      case "Mobil":
        return { 
          bg: "bg-blue-500/10 text-blue-400 border-blue-500/20", 
          icon: <Smartphone className="w-3.5 h-3.5 mr-1" /> 
        };
      case "Oyun":
        return { 
          bg: "bg-rose-500/10 text-rose-400 border-rose-500/20", 
          icon: <Gamepad2 className="w-3.5 h-3.5 mr-1" /> 
        };
      case "Yazılım":
        return { 
          bg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", 
          icon: <Code className="w-3.5 h-3.5 mr-1" /> 
        };
      case "Bilim & Uzay":
        return { 
          bg: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20", 
          icon: <Globe className="w-3.5 h-3.5 mr-1" /> 
        };
      case "Girişimcilik":
        return { 
          bg: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20", 
          icon: <Rocket className="w-3.5 h-3.5 mr-1" /> 
        };
      default:
        return { 
          bg: "bg-slate-500/10 text-slate-400 border-slate-500/20", 
          icon: <HelpCircle className="w-3.5 h-3.5 mr-1" /> 
        };
    }
  };

  const getSourceColor = (source: string) => {
    switch (source) {
      case "Webtekno": return "text-[#f39c12]";
      case "ShiftDelete": return "text-[#e74c3c]";
      case "Donanım Haber": return "text-[#3498db]";
      case "LOG": return "text-[#9b59b6]";
      case "Chip": return "text-[#2ecc71]";
      case "Technopat": return "text-[#2980b9]";
      case "Webrazzi": return "text-[#e67e22]";
      case "Teknoblog": return "text-[#34495e]";
      case "TechCrunch": return "text-[#00a86b]";
      case "The Verge": return "text-[#ff2a54]";
      case "Ars Technica": return "text-[#fe5f14]";
      case "Wired": return "text-[#ffffff]";
      case "Engadget": return "text-[#a29bfe]";
      case "Android Authority": return "text-[#a4c639]";
      case "TechRadar": return "text-[#ff0055]";
      case "9to5Mac": return "text-[#ff3b30]";
      case "The Next Web": return "text-[#ff4500]";
      case "Gizmodo": return "text-[#00ffcc]";
      case "VentureBeat": return "text-[#da2128]";
      case "MIT Tech Review": return "text-[#000000]";
      case "ZDNet": return "text-[#d01012]";
      case "Mashable": return "text-[#00a0d1]";
      case "The Register": return "text-[#ff0000]";
      case "BleepingComputer": return "text-[#1d70b8]";
      case "The Hacker News": return "text-[#0070c0]";
      case "MacRumors": return "text-[#333333]";
      case "Android Police": return "text-[#00ff00]";
      case "XDA Developers": return "text-[#f58220]";
      case "Tom's Hardware": return "text-[#1a365d]";
      case "TechSpot": return "text-[#212121]";
      case "Slashdot": return "text-[#006666]";
      case "BBC Technology": return "text-[#cc0000]";
      default: return "text-sky-400";
    }
  };

  const getCategoryGradient = (cat: string) => {
    switch (cat) {
      case "Yapay Zeka": return "from-purple-900/70 via-indigo-950/60 to-slate-950";
      case "Donanım": return "from-amber-900/60 via-orange-950/50 to-slate-950";
      case "Mobil": return "from-blue-900/70 via-sky-950/60 to-slate-950";
      case "Oyun": return "from-rose-900/60 via-pink-950/50 to-slate-950";
      case "Yazılım": return "from-emerald-900/60 via-teal-950/50 to-slate-950";
      case "Bilim & Uzay": return "from-cyan-900/60 via-blue-950/60 to-slate-950";
      case "Girişimcilik": return "from-indigo-900/70 via-violet-950/50 to-slate-950";
      default: return "from-slate-800/80 via-slate-900 to-slate-950";
    }
  };

  const getCategoryIcon = (cat: string, cls: string) => {
    switch (cat) {
      case "Yapay Zeka": return <Sparkles className={cls} />;
      case "Donanım": return <Cpu className={cls} />;
      case "Mobil": return <Smartphone className={cls} />;
      case "Oyun": return <Gamepad2 className={cls} />;
      case "Yazılım": return <Code className={cls} />;
      case "Bilim & Uzay": return <Globe className={cls} />;
      case "Girişimcilik": return <Rocket className={cls} />;
      default: return <Newspaper className={cls} />;
    }
  };

  const catMeta = getCategoryMeta(item.category);

  // Time formatting helper
  const formatTimeAgo = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    const hrs = Math.floor(mins / 60);
    const days = Math.floor(hrs / 24);

    if (mins < 1) return "Şimdi";
    if (mins < 60) return `${mins} dk önce`;
    if (hrs < 24) return `${hrs} saat önce`;
    return `${days} gün önce`;
  };

  return (
    <motion.article 
      id={`news-card-${item.id}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="group relative flex flex-col justify-between bg-[#0f172a] hover:bg-[#131e35] border border-slate-800 hover:border-slate-700/80 rounded-2xl p-5 shadow-lg hover:shadow-xl transition-all duration-300"
    >
      <div>
        {/* Bleeding Featured Image Block */}
        <div className="-mx-5 -mt-5 mb-4.5 h-44 relative overflow-hidden rounded-t-2xl border-b border-slate-900/60 bg-slate-950">
          {item.imageUrl ? (
            <img
              src={item.imageUrl}
              alt={item.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
              onError={(e) => {
                // Safely toggle fallback state on load failure
                (e.target as HTMLImageElement).style.display = "none";
                const parent = (e.target as HTMLImageElement).parentElement;
                if (parent) {
                  const fallback = parent.querySelector(".image-fallback");
                  if (fallback) fallback.classList.remove("hidden");
                }
              }}
            />
          ) : null}

          {/* Görsel bulunamadığında gösterilen kapak.
              Boş bir kutu yerine kasıtlı tasarlanmış bir kapak gibi görünmesi için
              kaynak adı tipografik ana unsur olarak kullanılır. */}
          <div className={`image-fallback ${item.imageUrl ? "hidden" : ""} absolute inset-0 bg-gradient-to-br ${getCategoryGradient(item.category)} overflow-hidden`}>
            {/* İnce ızgara dokusu */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.06)_1px,transparent_1px)] bg-[size:22px_22px]" />

            {/* Köşede filigran kategori ikonu */}
            <div className="absolute -bottom-5 -right-4 opacity-[0.14] group-hover:opacity-25 group-hover:scale-105 transition-all duration-500 origin-bottom-right">
              {getCategoryIcon(item.category, "w-32 h-32 text-white")}
            </div>

            {/* Kaynak markası */}
            <div className="relative h-full flex flex-col justify-end p-4 gap-1">
              <span className={`font-display font-bold text-2xl leading-none tracking-tight ${getSourceColor(item.source)}`}>
                {item.source}
              </span>
              <span className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-[0.15em] text-slate-400/80">
                {getCategoryIcon(item.category, "w-3 h-3")}
                {item.category}
              </span>
            </div>
          </div>
        </div>

        {/* Source Header Info */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center space-x-2">
            <span className={`font-mono text-xs font-bold ${getSourceColor(item.source)}`}>
              {item.source}
            </span>
            <span className="w-1 h-1 bg-slate-700 rounded-full" />
            <span className="flex items-center text-slate-400 text-xs font-medium">
              <Clock className="w-3 h-3 mr-1" />
              {formatTimeAgo(item.timestamp)}
            </span>
          </div>

          <div className="flex items-center space-x-1.5">
            <span
              className={`text-[10px] px-2 py-0.5 rounded-md font-bold font-mono tracking-wider border ${
                item.lang === "tr"
                  ? "bg-teal-500/10 text-teal-400 border-teal-500/20"
                  : "bg-slate-500/10 text-slate-400 border-slate-500/20"
              }`}
              title={item.lang === "tr" ? "Türkçe kaynak" : "İngilizce kaynak"}
            >
              {item.lang === "tr" ? "TR" : "EN"}
            </span>
            <span className={`flex items-center border text-[10px] px-2 py-0.5 rounded-md font-semibold ${catMeta.bg}`}>
              {catMeta.icon}
              {item.category}
            </span>
          </div>
        </div>

        {/* Title */}
        <h3 className="text-base font-semibold font-sans leading-snug text-slate-100 group-hover:text-sky-400 transition-colors duration-200">
          <a href={item.link} target="_blank" rel="noopener noreferrer" className="hover:underline flex items-start gap-1.5">
            {item.title}
          </a>
        </h3>

        {/* Description / Content Snippet */}
        <p className="text-slate-400 text-sm mt-2.5 leading-relaxed font-sans line-clamp-3">
          {item.description || "Haber detayı bulunmuyor."}
        </p>

        </div>

      {/* Card Action Footer */}
      <div className="flex items-center justify-between gap-2 mt-5 pt-3.5 border-t border-slate-800/60">
        <span className="text-slate-500 text-xs font-mono">
          Yayın Tarihi: {new Date(item.timestamp).toLocaleDateString("tr-TR")}
        </span>
        <a
          id={`link-source-${item.id}`}
          href={item.link}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center text-sky-400 hover:text-sky-300 text-xs font-semibold transition-colors duration-150"
        >
          Kaynağa Git
          <ExternalLink className="w-3 h-3 ml-1" />
        </a>
      </div>
    </motion.article>
  );
}
