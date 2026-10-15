import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { logoutAction } from '../actions';
import { ThemeToggle } from '@/components/site/theme';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

const NAV = [
  { href: '/admin', label: 'Dashboard', icon: '◧' },
  { href: '/admin/articles?status=PENDING_REVIEW', label: 'Review queue', icon: '✎', badge: 'review' },
  { href: '/admin/articles', label: 'Articles', icon: '▤' },
  { href: '/admin/sources', label: 'Sources', icon: '⇄', admin: true },
  { href: '/admin/pipeline', label: 'Pipeline', icon: '⚙' },
  { href: '/admin/analytics', label: 'Analytics', icon: '▥' },
  { href: '/admin/settings', label: 'Settings', icon: '☰', admin: true },
  { href: '/admin/users', label: 'Users', icon: '☺', admin: true },
  { href: '/admin/logs', label: 'Logs & audit', icon: '≣' },
];

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const review = await db.article.count({ where: { status: 'PENDING_REVIEW' } });
  return (
    <div className="lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="border-b border-line bg-card lg:min-h-screen lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-4 py-4 lg:block">
          <Link href="/admin" className="font-serif text-xl font-black">Newsroom<span className="text-accent">.</span>admin</Link>
          <div className="flex items-center gap-1 lg:hidden"><ThemeToggle /></div>
        </div>
        <nav aria-label="Admin" className="scrollbar-none flex gap-1 overflow-x-auto px-2 pb-3 lg:block lg:space-y-0.5 lg:px-3">
          {NAV.filter((n) => !n.admin || user.role === 'ADMIN').map((n) => (
            <Link key={n.href} href={n.href} className="flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-sm font-semibold text-ink/80 transition hover:bg-wash hover:text-ink">
              <span aria-hidden className="w-4 text-center text-muted">{n.icon}</span>{n.label}
              {n.badge === 'review' && review > 0 && <span className="ml-auto rounded-full bg-amber-500 px-1.5 text-[0.65rem] font-black text-black">{review}</span>}
            </Link>
          ))}
          <Link href="/" target="_blank" className="flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-sm font-semibold text-muted hover:bg-wash hover:text-ink"><span aria-hidden className="w-4 text-center">↗</span>View site</Link>
        </nav>
        <div className="hidden border-t border-line p-4 text-xs lg:block">
          <p className="truncate font-semibold">{user.name}</p>
          <p className="truncate text-muted">{user.email} · {user.role.toLowerCase()}</p>
          <div className="mt-3 flex items-center justify-between"><form action={logoutAction}><button className="btn !px-3 !py-1.5 !text-xs">Sign out</button></form><ThemeToggle /></div>
        </div>
      </aside>
      <main className="min-w-0 p-4 sm:p-6 lg:p-8">
        <div className="mb-4 flex items-center justify-end lg:hidden"><form action={logoutAction}><button className="btn !px-3 !py-1.5 !text-xs">Sign out</button></form></div>
        {children}
      </main>
    </div>
  );
}
