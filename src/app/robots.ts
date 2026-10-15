import type { MetadataRoute } from 'next';
import { abs } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/api/', '/search'] }],
    sitemap: [abs('/sitemap.xml'), abs('/news-sitemap.xml')],
  };
}
