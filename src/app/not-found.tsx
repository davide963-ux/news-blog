import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl px-4 py-32 text-center">
      <p className="kicker">404</p>
      <h1 className="headline mt-3 text-4xl">We couldn’t find that page</h1>
      <p className="mt-4 text-muted">The story may have been moved, corrected or withdrawn.</p>
      <div className="mt-8 flex justify-center gap-3"><Link href="/" className="btn btn-primary">Back to the front page</Link><Link href="/search" className="btn">Search</Link></div>
    </main>
  );
}
