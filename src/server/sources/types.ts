export interface RawItem {
  url: string;
  guid?: string;
  title: string;
  summary?: string;
  contentText?: string;
  author?: string;
  imageUrl?: string;
  publishedAt?: Date;
  meta?: Record<string, unknown>;
}

export interface FeedResult {
  items: RawItem[];
  notModified?: boolean;
  etag?: string | null;
  lastModified?: string | null;
}

export interface HtmlListConfig {
  itemSelector: string;
  linkSelector?: string;
  titleSelector?: string;
  summarySelector?: string;
  dateSelector?: string;
  dateAttr?: string;
  imageSelector?: string;
}

export interface JsonApiConfig {
  itemsPath: string;
  urlPath: string;
  titlePath: string;
  idPath?: string;
  datePath?: string;
  summaryPath?: string;
  contentPath?: string;
  imagePath?: string;
  authorPath?: string;
}
