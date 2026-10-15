import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/inter';
import '@fontsource-variable/source-serif-4';
import './globals.css';
import { env } from '@/lib/env';
import { getSiteConfig } from '@/lib/queries';
import { themeInitScript } from '@/components/site/theme';

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSiteConfig().catch(() => ({ name: 'News', description: '', tagline: '', twitterHandle: '' }));
  return {
    metadataBase: new URL(env.appUrl),
    title: { default: `${site.name} — ${site.tagline}`, template: `%s | ${site.name}` },
    description: site.description,
    applicationName: site.name,
    alternates: { types: { 'application/rss+xml': '/rss.xml' } },
    openGraph: { type: 'website', siteName: site.name, locale: 'en_GB' },
    twitter: { card: 'summary_large_image', ...(site.twitterHandle ? { site: site.twitterHandle } : {}) },
    robots: { index: true, follow: true, 'max-image-preview': 'large' } as Metadata['robots'],
  };
}

export const viewport: Viewport = {
  width: 'device-width', initialScale: 1,
  themeColor: [{ media: '(prefers-color-scheme: light)', color: '#faf8f4' }, { media: '(prefers-color-scheme: dark)', color: '#0f1013' }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeInitScript }} /></head>
      <body>{children}</body>
    </html>
  );
}
