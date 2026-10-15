import type { Job, Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { logger, errMsg } from '@/lib/logger';

/**
 * Durable job queue on PostgreSQL.
 *  - enqueue() is idempotent through a unique dedupeKey.
 *  - claimJobs() uses FOR UPDATE SKIP LOCKED + a lease, so overlapping cron invocations never run the same job twice
 *    and a crashed/timed-out invocation's jobs are automatically re-claimed after the lease expires.
 *  - failures are retried with exponential backoff + jitter; PermanentError skips retries.
 */
export type JobType = 'check_source' | 'extract_item' | 'generate_item' | 'recheck_story';

export class PermanentError extends Error {}

export async function enqueue(type: JobType, payload: Record<string, unknown>, opts: { dedupeKey: string; runAt?: Date; maxAttempts?: number }) {
  const rows = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO "Job" ("id","type","dedupeKey","payload","status","attempts","maxAttempts","runAt","createdAt","updatedAt")
    VALUES (${'job_' + crypto.randomUUID()}, ${type}, ${opts.dedupeKey}, ${JSON.stringify(payload)}::jsonb, 'PENDING', 0, ${opts.maxAttempts ?? 4}, ${opts.runAt ?? new Date()}, now(), now())
    ON CONFLICT ("dedupeKey") DO NOTHING
    RETURNING "id"`;
  return rows.length > 0;
}

export async function claimJobs(limit: number, leaseSeconds = 240): Promise<Job[]> {
  return db.$queryRaw<Job[]>`
    UPDATE "Job" SET "status"='RUNNING', "attempts"="attempts"+1,
      "lockedUntil"=now()+make_interval(secs => ${leaseSeconds}), "updatedAt"=now()
    WHERE "id" IN (
      SELECT "id" FROM "Job"
      WHERE ("status"='PENDING' AND "runAt"<=now())
         OR ("status"='RUNNING' AND "lockedUntil"<now() AND "attempts"<"maxAttempts")
      ORDER BY CASE "type" WHEN 'check_source' THEN 0 WHEN 'extract_item' THEN 1 WHEN 'generate_item' THEN 2 ELSE 3 END, "runAt"
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED)
    RETURNING *`;
}

export async function completeJob(id: string) {
  await db.job.update({ where: { id }, data: { status: 'DONE', lockedUntil: null, lastError: null } });
}

export async function failJob(job: Job, error: unknown, permanent = false) {
  const msg = errMsg(error).slice(0, 1000);
  const exhausted = permanent || job.attempts >= job.maxAttempts;
  const delaySec = Math.min(3600, 30 * 2 ** (job.attempts - 1)) * (0.75 + Math.random() * 0.5);
  await db.job.update({
    where: { id: job.id },
    data: exhausted
      ? { status: 'FAILED', lockedUntil: null, lastError: msg }
      : { status: 'PENDING', lockedUntil: null, lastError: msg, runAt: new Date(Date.now() + delaySec * 1000) },
  });
  if (exhausted) await logger.error('queue', `Job ${job.type} failed permanently: ${msg}`, { jobId: job.id, payload: job.payload as Prisma.JsonObject });
}

/** Jobs stuck RUNNING past their final attempt (function was killed) become FAILED. */
export async function sweepDeadJobs() {
  const r = await db.job.updateMany({
    where: { status: 'RUNNING', lockedUntil: { lt: new Date() }, attempts: { gte: 4 } },
    data: { status: 'FAILED', lastError: 'Worker lease expired on final attempt' },
  });
  return r.count;
}

export type Handler = (payload: Record<string, unknown>, job: Job) => Promise<void>;

/** Drain the queue until the deadline. Returns processed counts. */
export async function drainQueue(handlers: Partial<Record<JobType, Handler>>, opts: { deadline: number; concurrency: number }) {
  const stats = { processed: 0, failed: 0, retried: 0 };
  while (Date.now() < opts.deadline - 5_000) {
    const jobs = await claimJobs(opts.concurrency, Math.max(60, Math.ceil((opts.deadline - Date.now()) / 1000) + 30));
    if (!jobs.length) break;
    await Promise.all(
      jobs.map(async (job) => {
        const h = handlers[job.type as JobType];
        try {
          if (!h) throw new PermanentError(`No handler for job type ${job.type}`);
          await h(job.payload as Record<string, unknown>, job);
          await completeJob(job.id);
          stats.processed++;
        } catch (e) {
          const permanent = e instanceof PermanentError;
          await failJob(job, e, permanent);
          if (permanent || job.attempts >= job.maxAttempts) stats.failed++;
          else stats.retried++;
        }
      }),
    );
  }
  return stats;
}

export async function queueStats() {
  const rows = await db.job.groupBy({ by: ['status'], _count: true });
  const out = { PENDING: 0, RUNNING: 0, DONE: 0, FAILED: 0 } as Record<string, number>;
  for (const r of rows) out[r.status] = r._count;
  return out;
}
