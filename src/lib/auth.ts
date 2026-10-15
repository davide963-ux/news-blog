import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Role, User } from '@prisma/client';
import { db } from './db';
import { env } from './env';
import { rateLimit, resetRateLimit, clientIp } from './rate-limit';
import { audit } from './logger';

export const SESSION_COOKIE = 'nb_session';
const TTL_SECONDS = 60 * 60 * 12;
const secret = () => new TextEncoder().encode(env.sessionSecret);

export async function createSessionToken(user: Pick<User, 'id' | 'role'>): Promise<string> {
  return new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(secret());
}

export async function verifySessionToken(token: string): Promise<{ sub: string; role: Role } | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'] });
    return payload.sub ? { sub: payload.sub, role: payload.role as Role } : null;
  } catch { return null; }
}

export async function getCurrentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const s = await verifySessionToken(token);
  if (!s) return null;
  const user = await db.user.findUnique({ where: { id: s.sub } });
  return user && user.active ? user : null; // re-checked against the DB so deactivation is immediate
}

/** Use at the top of every admin page and server action. */
export async function requireUser(role?: Role): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect('/admin/login');
  if (role === 'ADMIN' && user.role !== 'ADMIN') redirect('/admin?denied=1');
  return user;
}

let dummyHash: string | null = null;
/** Lazily created so that unknown-email logins still pay the bcrypt cost (prevents user enumeration by timing). */
const getDummyHash = async () => (dummyHash ??= await bcrypt.hash('not-a-real-password', 12));

export async function login(email: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const ip = clientIp(await headers());
  const e = email.trim().toLowerCase();
  const [byIp, byEmail] = await Promise.all([rateLimit(`login:ip:${ip}`, 20, 900), rateLimit(`login:email:${e}`, 6, 900)]);
  if (!byIp.ok || !byEmail.ok) return { ok: false, error: 'Too many attempts. Try again in 15 minutes.' };
  const user = await db.user.findUnique({ where: { email: e } });
  const valid = await bcrypt.compare(password, user?.passwordHash ?? (await getDummyHash())); // constant-ish time
  if (!user || !user.active || !valid) {
    await audit('anonymous', 'login.failed', 'User', undefined, { email: e, ip });
    return { ok: false, error: 'Invalid email or password.' };
  }
  await resetRateLimit(`login:email:${e}`);
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  (await cookies()).set(SESSION_COOKIE, await createSessionToken(user), {
    httpOnly: true, secure: env.isProd, sameSite: 'lax', path: '/', maxAge: TTL_SECONDS,
  });
  await audit(user.email, 'login.success', 'User', user.id, { ip });
  return { ok: true };
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
}

export const hashPassword = (pw: string) => bcrypt.hash(pw, 12);

export function validatePasswordStrength(pw: string): string | null {
  if (pw.length < 12) return 'Password must be at least 12 characters.';
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/\d/.test(pw)) return 'Use upper-case, lower-case letters and a digit.';
  return null;
}
