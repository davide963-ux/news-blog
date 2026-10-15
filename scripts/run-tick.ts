/** Run one scheduler tick locally (same code path as /api/cron/tick):  npm run tick */
import { db } from '@/lib/db';
import { runTick } from '@/server/tick';

runTick({ budgetMs: 240_000 })
  .then((s) => console.log('tick done', s))
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
