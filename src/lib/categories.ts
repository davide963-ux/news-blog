export const DEFAULT_CATEGORIES = [
  { slug: 'world', name: 'World' },
  { slug: 'politics', name: 'Politics' },
  { slug: 'business', name: 'Business' },
  { slug: 'technology', name: 'Technology' },
  { slug: 'economy', name: 'Economy' },
  { slug: 'entertainment', name: 'Entertainment' },
  { slug: 'sports', name: 'Sports' },
  { slug: 'science', name: 'Science' },
  { slug: 'health', name: 'Health' },
] as const;

export const CATEGORY_SLUGS = DEFAULT_CATEGORIES.map((c) => c.slug) as unknown as [string, ...string[]];
