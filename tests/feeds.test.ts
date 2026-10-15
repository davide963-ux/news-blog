import { describe, it, expect } from 'vitest';
import { parseFeed } from '@/server/sources/rss';
import { extractFromHtml } from '@/server/sources/extract-page';
import { renderBody, ensureAttribution } from '@/server/render';

const RSS = `<?xml version="1.0"?><rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>T</title>
<item><title><![CDATA[Rates held &amp; inflation eases]]></title><link>https://ex.com/a?utm_source=rss</link><guid isPermaLink="false">abc</guid><pubDate>Thu, 12 Sep 2024 10:00:00 GMT</pubDate><dc:creator>Jane</dc:creator><description><![CDATA[<p>Short <b>summary</b>.</p>]]></description><media:content url="https://ex.com/i.jpg" medium="image"/><content:encoded><![CDATA[<p>Full text here.</p>]]></content:encoded></item>
<item><title>No link</title></item></channel></rss>`;
const ATOM = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Atom story</title><link rel="alternate" href="https://ex.com/atom-1"/><id>tag:1</id><updated>2024-09-12T10:00:00Z</updated><summary>Sum</summary><author><name>Bob</name></author></entry></feed>`;

describe('feed parsing', () => {
  it('parses RSS 2.0 with entities, CDATA, media and content:encoded', () => {
    const items = parseFeed(RSS);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ title: 'Rates held & inflation eases', url: 'https://ex.com/a?utm_source=rss', author: 'Jane', imageUrl: 'https://ex.com/i.jpg', contentText: 'Full text here.', summary: 'Short summary.' });
    expect(items[0].publishedAt?.toISOString()).toBe('2024-09-12T10:00:00.000Z');
  });
  it('parses Atom', () => {
    const items = parseFeed(ATOM);
    expect(items[0]).toMatchObject({ title: 'Atom story', url: 'https://ex.com/atom-1', author: 'Bob' });
  });
});

describe('article page extraction', () => {
  const html = `<html lang="en"><head><title>x</title><meta property="og:image" content="/img/hero.jpg"><link rel="canonical" href="https://ex.com/s"/>
  <script type="application/ld+json">{"@type":"NewsArticle","headline":"JSON-LD headline","datePublished":"2024-09-12T09:00:00Z","author":{"name":"Ann"}}</script></head>
  <body><nav>Menu Menu Menu</nav><article><h1>Headline</h1><p>${'First paragraph of the article with enough words to count. '.repeat(3)}</p><p>${'Second paragraph that continues the story in detail. '.repeat(3)}</p><div class="related"><p>${'Related junk link text that should be removed entirely. '.repeat(3)}</p></div></article><footer><p>${'Footer text '.repeat(10)}</p></footer></body></html>`;
  it('extracts main text, metadata and ignores boilerplate', () => {
    const r = extractFromHtml(html, 'https://ex.com/s');
    expect(r.text).toContain('First paragraph');
    expect(r.text).toContain('Second paragraph');
    expect(r.text).not.toContain('Related junk');
    expect(r.text).not.toContain('Footer text');
    expect(r.title).toBe('JSON-LD headline');
    expect(r.author).toBe('Ann');
    expect(r.imageUrl).toBe('https://ex.com/img/hero.jpg');
    expect(r.publishedAt?.toISOString()).toBe('2024-09-12T09:00:00.000Z');
  });
});

describe('rendering & sanitising', () => {
  it('strips scripts, handlers and javascript: links', () => {
    const html = renderBody('Hello <script>alert(1)</script> **bold** [x](javascript:alert(1)) [ok](https://a.com)\n\n<img src=x onerror=alert(1)>');
    expect(html).not.toMatch(/script|onerror|javascript:|<img/i);
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('rel="nofollow noopener noreferrer ugc"');
  });
  it('adds attribution only when missing', () => {
    expect(ensureAttribution('Body text.', ['Example Wire'])).toContain('Example Wire');
    expect(ensureAttribution('According to example wire, x.', ['Example Wire'])).toBe('According to example wire, x.');
  });
});
