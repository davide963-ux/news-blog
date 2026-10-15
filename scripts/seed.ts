/**
 * Optional CLI alternative to the /admin/login first-run page.
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='Str0ngPassw0rd!' npm run db:seed
 * Creates the first administrator (only if no user exists). It never creates articles or sources.
 */
import { db } from '@/lib/db';
import { hashPassword, validatePasswordStrength } from '@/lib/auth';

async function main() {
  const email = process.env.ADMIN_EMAIL?.toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? '';
  if (!email) throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD');
  const weak = validatePasswordStrength(password);
  if (weak) throw new Error(weak);
  if ((await db.user.count()) > 0) { console.log('A user already exists — nothing to do.'); return; }
  await db.user.create({ data: { email, name: process.env.ADMIN_NAME || 'Administrator', passwordHash: await hashPassword(password), role: 'ADMIN' } });
  console.log(`Administrator ${email} created.`);
  console.log(`Categories present: ${await db.category.count()} (created by migrations)`);
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => db.$disconnect());
