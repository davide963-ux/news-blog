import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

marked.setOptions({ gfm: true, breaks: false });

const ALLOWED = {
  allowedTags: ['p', 'h2', 'h3', 'ul', 'ol', 'li', 'strong', 'em', 'blockquote', 'a', 'br', 'hr'],
  allowedAttributes: { a: ['href', 'title', 'rel', 'target'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'nofollow noopener noreferrer ugc', target: '_blank' }),
    h1: 'h2', h4: 'h3', h5: 'h3', h6: 'h3',
  },
  disallowedTagsMode: 'discard' as const,
};

/** Markdown (AI or editor authored) -> sanitised HTML. All stored/served HTML passes through here. */
export function renderBody(md: string): string {
  const html = marked.parse(md, { async: false }) as string;
  return sanitizeHtml(html, ALLOWED);
}

export function stripMarkdown(md: string): string {
  return md.replace(/^#{1,6}\s+/gm, '').replace(/[*_`>]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\s+/g, ' ').trim();
}

/** Guarantee the story names its sources in the text (in addition to the source box rendered by the template). */
export function ensureAttribution(body: string, sourceNames: string[]): string {
  const lower = body.toLowerCase();
  if (sourceNames.some((n) => lower.includes(n.toLowerCase()))) return body;
  const names = [...new Set(sourceNames)];
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
  return `${body.trim()}\n\nThis report is based on information published by ${list}.`;
}
