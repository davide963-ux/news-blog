import type { Card } from '@/lib/queries';

const HUES: Record<string, number> = { world: 214, politics: 350, business: 160, technology: 262, economy: 38, entertainment: 318, sports: 128, science: 190, health: 8 };

/** Brand-consistent placeholder used when no properly licensed image exists. Never depicts a real event. */
export function FallbackArt({ category, className = '' }: { category: string; className?: string }) {
  const h = HUES[category] ?? 215;
  return (
    <svg viewBox="0 0 16 9" preserveAspectRatio="xMidYMid slice" className={`h-full w-full ${className}`} role="img" aria-label={`${category} section artwork`}>
      <defs>
        <linearGradient id={`g-${category}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={`hsl(${h} 45% 22%)`} />
          <stop offset="1" stopColor={`hsl(${(h + 40) % 360} 55% 38%)`} />
        </linearGradient>
      </defs>
      <rect width="16" height="9" fill={`url(#g-${category})`} />
      <g fill="none" stroke="rgba(255,255,255,.14)" strokeWidth=".08">
        {Array.from({ length: 9 }, (_, i) => <path key={i} d={`M${-2 + i * 2.2} 9 L${5 + i * 2.2} 0`} />)}
      </g>
      <circle cx="12.8" cy="2.1" r="1.2" fill="rgba(255,255,255,.12)" />
      <text x="1" y="8" fontFamily="Georgia, serif" fontWeight="700" fontSize="1.3" fill="rgba(255,255,255,.55)" letterSpacing=".05" style={{ textTransform: 'uppercase' }}>{category}</text>
    </svg>
  );
}

export function ArticleImage({ card, sizes = '(min-width:1024px) 600px, 100vw', priority = false, small = false, className = '' }: { card: Pick<Card, 'imageUrl' | 'imageSmallUrl' | 'imageAlt' | 'categorySlug' | 'title' | 'imageIsAi'>; sizes?: string; priority?: boolean; small?: boolean; className?: string }) {
  const src = small ? card.imageSmallUrl ?? card.imageUrl : card.imageUrl;
  return (
    <div className={`relative aspect-[16/9] w-full overflow-hidden bg-wash ${className}`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={card.imageAlt ?? ''} sizes={sizes} loading={priority ? 'eager' : 'lazy'} fetchPriority={priority ? 'high' : 'auto'} decoding="async" className="h-full w-full object-cover" width={1600} height={900} />
      ) : <FallbackArt category={card.categorySlug} />}
      {card.imageIsAi && <span className="absolute bottom-1.5 left-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider text-white">AI illustration</span>}
    </div>
  );
}
