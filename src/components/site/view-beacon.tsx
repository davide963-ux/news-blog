'use client';
import { useEffect } from 'react';

export function ViewBeacon({ slug }: { slug: string }) {
  useEffect(() => {
    const key = `v:${slug}`;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch { /* ignore */ }
    const body = JSON.stringify({ slug });
    if (navigator.sendBeacon) navigator.sendBeacon('/api/view', new Blob([body], { type: 'application/json' }));
    else fetch('/api/view', { method: 'POST', body, keepalive: true, headers: { 'content-type': 'application/json' } }).catch(() => undefined);
  }, [slug]);
  return null;
}
