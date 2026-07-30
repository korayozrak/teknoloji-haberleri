export interface NewsItem {
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
