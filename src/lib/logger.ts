import type { LogLevel, Prisma } from '@prisma/client';
import { db } from './db';

/** Console + best-effort persistence to EventLog (shown in the admin "Logs" page). */
export async function log(level: LogLevel, scope: string, message: string, meta?: Record<string, unknown>) {
  const line = `[${level}] ${scope}: ${message}`;
  if (level === 'ERROR') console.error(line, meta ?? '');
  else if (level === 'WARN') console.warn(line, meta ?? '');
  else if (process.env.LOG_LEVEL === 'debug' || level !== 'DEBUG') console.log(line);
  if (level === 'DEBUG') return;
  try {
    await db.eventLog.create({ data: { level, scope, message: message.slice(0, 2000), meta: (meta ?? undefined) as Prisma.InputJsonValue | undefined } });
  } catch {
    /* never let logging break the pipeline */
  }
}

export const logger = {
  info: (scope: string, msg: string, meta?: Record<string, unknown>) => log('INFO', scope, msg, meta),
  warn: (scope: string, msg: string, meta?: Record<string, unknown>) => log('WARN', scope, msg, meta),
  error: (scope: string, msg: string, meta?: Record<string, unknown>) => log('ERROR', scope, msg, meta),
  debug: (scope: string, msg: string, meta?: Record<string, unknown>) => log('DEBUG', scope, msg, meta),
};

export async function audit(actor: string, action: string, entity?: string, entityId?: string, meta?: Record<string, unknown>) {
  try {
    await db.auditLog.create({ data: { actor, action, entity, entityId, meta: (meta ?? undefined) as Prisma.InputJsonValue | undefined } });
  } catch (e) {
    console.error('audit failed', e);
  }
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
