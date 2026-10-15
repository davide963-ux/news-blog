'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function NavLinks({ categories }: { categories: { slug: string; name: string }[] }) {
  const path = usePathname();
  return (
    <ul className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:px-0" role="list">
      <li>
        <Link href="/" aria-current={path === '/' ? 'page' : undefined} className={`block whitespace-nowrap px-3 py-3 text-sm font-semibold transition hover:text-accent ${path === '/' ? 'text-accent' : 'text-ink'}`}>Home</Link>
      </li>
      {categories.map((c) => {
        const active = path === `/category/${c.slug}`;
        return (
          <li key={c.slug}>
            <Link href={`/category/${c.slug}`} aria-current={active ? 'page' : undefined} className={`relative block whitespace-nowrap px-3 py-3 text-sm font-semibold transition hover:text-accent ${active ? 'text-accent' : 'text-ink'}`}>
              {c.name}
              {active && <span className="absolute inset-x-3 bottom-0 h-0.5 bg-accent" />}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
