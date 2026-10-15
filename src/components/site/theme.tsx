'use client';
import { useEffect, useState } from 'react';

/** Runs before first paint (inlined in <head>) so there is no flash of the wrong theme. */
export const themeInitScript = `(function(){try{var t=localStorage.getItem('theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.setAttribute('data-theme',t)}catch(e){}})();`;

export function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  useEffect(() => { setTheme((document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light'); }, []);
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch { /* storage unavailable */ }
  };
  return (
    <button type="button" onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted transition hover:bg-wash hover:text-ink">
      {theme === 'dark' ? (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
      ) : (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
      )}
    </button>
  );
}
