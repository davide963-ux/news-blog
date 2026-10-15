// Runs a command with DIRECT_URL defaulting to DATABASE_URL, so builds work when only one connection string is set.
// (A direct, non-pooled DIRECT_URL is still recommended for migrations on pooled providers such as Neon.)
import { spawnSync } from 'node:child_process';

const env = { ...process.env };
if (!env.DIRECT_URL && env.DATABASE_URL) {
  env.DIRECT_URL = env.DATABASE_URL;
  console.log('[db-env] DIRECT_URL not set — using DATABASE_URL for Prisma CLI commands.');
}
const [cmd, ...args] = process.argv.slice(2);
const r = spawnSync(cmd, args, { stdio: 'inherit', env, shell: process.platform === 'win32' });
process.exit(r.status ?? 1);
