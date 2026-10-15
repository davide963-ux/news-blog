import { db } from '@/lib/db';
import { loginAction, setupAdminAction } from '../actions';
import { Flash } from '@/components/admin/ui';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const first = (await db.user.count().catch(() => 1)) === 0;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <p className="kicker text-center">Restricted area</p>
      <h1 className="headline mt-2 text-center text-3xl">{first ? 'Create the administrator' : 'Newsroom sign-in'}</h1>
      <div className="mt-8"><Flash ok={sp.ok} err={sp.err} /></div>
      {first ? (
        <form action={setupAdminAction} className="panel space-y-4 p-6">
          <p className="text-sm text-muted">First run: no users exist yet. Enter the <code className="rounded bg-wash px-1">SETUP_TOKEN</code> from your environment variables to create the first administrator.{!env.setupToken && <strong className="text-red-600"> SETUP_TOKEN is not set — add it in Vercel and redeploy.</strong>}</p>
          <div><label className="label" htmlFor="token">Setup token</label><input id="token" name="token" type="password" required className="input" autoComplete="off" /></div>
          <div><label className="label" htmlFor="name">Name</label><input id="name" name="name" required className="input" /></div>
          <div><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" required className="input" /></div>
          <div><label className="label" htmlFor="pw">Password (12+ chars, mixed case, digit)</label><input id="pw" name="password" type="password" required minLength={12} className="input" autoComplete="new-password" /></div>
          <button className="btn btn-primary w-full">Create administrator</button>
        </form>
      ) : (
        <form action={loginAction} className="panel space-y-4 p-6">
          <div><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" required className="input" autoComplete="username" autoFocus /></div>
          <div><label className="label" htmlFor="password">Password</label><input id="password" name="password" type="password" required className="input" autoComplete="current-password" /></div>
          <button className="btn btn-primary w-full">Sign in</button>
        </form>
      )}
    </main>
  );
}
