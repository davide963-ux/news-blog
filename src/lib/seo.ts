import { env } from './env';

export const abs = (path: string) => `${env.appUrl}${path.startsWith('/') ? path : `/${path}`}`;
export const absImage = (u?: string | null) => (u ? (u.startsWith('http') ? u : abs(u)) : undefined);

export function articleJsonLd(a: {
  slug: string; title: string; excerpt: string; publishedAt: string; updatedAt: string; imageUrl: string | null; tags: string[];
  category: { name: string }; sources: { name: string; url: string }[];
}, site: { name: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    mainEntityOfPage: { '@type': 'WebPage', '@id': abs(`/article/${a.slug}`) },
    headline: a.title.slice(0, 110),
    description: a.excerpt,
    image: [absImage(a.imageUrl) ?? abs(`/article/${a.slug}/opengraph-image`)],
    datePublished: a.publishedAt,
    dateModified: a.updatedAt,
    articleSection: a.category.name,
    keywords: a.tags.join(', '),
    inLanguage: 'en',
    isAccessibleForFree: true,
    author: { '@type': 'Organization', name: `${site.name} Newsroom`, url: abs('/about') },
    publisher: { '@type': 'Organization', name: site.name, url: abs('/'), logo: { '@type': 'ImageObject', url: abs('/icon.svg') } },
    citation: a.sources.map((s) => ({ '@type': 'CreativeWork', name: s.name, url: s.url })),
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: abs(it.path) })),
  };
}

export const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
