'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { Prisma, SourceType } from '@prisma/client';
import { db } from '@/lib/db';
import { audit, errMsg } from '@/lib/logger';
import { encrypt } from '@/lib/crypto';
import { env } from '@/lib/env';
import { hashPassword, login, logout, requireUser, validatePasswordStrength } from '@/lib/auth';
import { getSettings, updateSettings, encryptSecret } from '@/lib/settings';
import { slugify, truncate } from '@/lib/utils';
import { assertPublicUrl } from '@/server/http';
import { enqueue, drainQueue } from '@/server/queue';
import { handlers, runTick } from '@/server/tick';
import { publishArticle, revalidatePublic, unpublishArticle } from '@/server/publish';
import { renderBody } from '@/server/render';
import { storeImage } from '@/server/storage';
import { fetchSource } from '@/server/sources/adapters';
import { getLlm } from '@/server/ai/provider';
import { sendAlert } from '@/server/alerts';

/** Redirect back with a flash message. The query string must precede any #anchor or it ends up inside the fragment. */
const flash = (path: string, kind: 'ok' | 'err', msg: string): never => {
  const [base, hash] = path.split('#');
  return redirect(`${base}${base.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(msg)}${hash ? `#${hash}` : ''}`);
};
const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const bool = (f: FormData, k: string) => f.get(k) === 'on' || f.get(k) === 'true';
const num = (f: FormData, k: string, d: number) => { const n = Number(f.get(k)); return Number.isFinite(n) && f.get(k) !== '' && f.get(k) !== null ? n : d; };
const refresh = () => revalidatePath('/admin', 'layout');

/* ------------------------------------------------------------ auth */
export async function loginAction(f: FormData) {
  const r = await login(str(f, 'email'), String(f.get('password') ?? ''));
  if (!r.ok) flash('/admin/login', 'err', r.error);
  redirect('/admin');
}
export async function logoutAction() { await logout(); redirect('/admin/login'); }

export async function setupAdminAction(f: FormData) {
  if ((await db.user.count()) > 0) flash('/admin/login', 'err', 'Setup already completed.');
  if (!env.setupToken || str(f, 'token') !== env.setupToken) flash('/admin/login', 'err', 'Invalid setup token (set SETUP_TOKEN in the environment).');
  const email = z.string().email().safeParse(str(f, 'email'));
  const pw = String(f.get('password') ?? '');
  const weak = validatePasswordStrength(pw);
  if (!email.success) flash('/admin/login', 'err', 'Enter a valid email.');
  if (weak) flash('/admin/login', 'err', weak);
  await db.user.create({ data: { email: email.data!.toLowerCase(), name: str(f, 'name') || 'Administrator', passwordHash: await hashPassword(pw), role: 'ADMIN' } });
  await audit(email.data!, 'setup.admin_created');
  flash('/admin/login', 'ok', 'Administrator created. Sign in below.');
}

/* ------------------------------------------------------------ sources */
const sourceSchema = z.object({
  name: z.string().min(2).max(100),
  siteUrl: z.string().url(),
  feedUrl: z.string().url(),
  type: z.enum(['RSS', 'HTML_LIST', 'JSON_API']),
  defaultCategory: z.string().max(40).optional(),
  trustLevel: z.number().int().min(1).max(3),
  fetchMode: z.enum(['FEED_ONLY', 'FULL_PAGE']),
  checkIntervalMinutes: z.number().int().min(5).max(1440),
  maxItemsPerRun: z.number().int().min(1).max(50),
  maxAgeHours: z.number().int().min(1).max(720),
});

function parseHeaders(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

async function sourceData(f: FormData, back: string) {
  const parsed = sourceSchema.safeParse({
    name: str(f, 'name'), siteUrl: str(f, 'siteUrl'), feedUrl: str(f, 'feedUrl'), type: str(f, 'type') || 'RSS',
    defaultCategory: str(f, 'defaultCategory') || undefined, trustLevel: num(f, 'trustLevel', 2), fetchMode: str(f, 'fetchMode') || 'FEED_ONLY',
    checkIntervalMinutes: num(f, 'checkIntervalMinutes', 5), maxItemsPerRun: num(f, 'maxItemsPerRun', 10), maxAgeHours: num(f, 'maxAgeHours', 48),
  });
  if (!parsed.success) flash(back, 'err', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  const d = parsed.data!;
  try { await assertPublicUrl(d.feedUrl); } catch (e) { flash(back, 'err', `Feed URL rejected: ${errMsg(e)}`); }
  let config: Prisma.InputJsonValue | undefined;
  const cfgRaw = str(f, 'config');
  if (cfgRaw) { try { config = JSON.parse(cfgRaw); } catch { flash(back, 'err', 'Config must be valid JSON.'); } }
  const hdrRaw = String(f.get('headers') ?? '').trim();
  return {
    ...d, type: d.type as SourceType, config, respectRobots: bool(f, 'respectRobots'), termsAcknowledged: bool(f, 'termsAcknowledged'),
    allowImageReuse: bool(f, 'allowImageReuse'), imageLicenseNote: str(f, 'imageLicenseNote') || null, licenseNote: str(f, 'licenseNote') || null,
    headersEnc: hdrRaw ? encrypt(JSON.stringify(parseHeaders(hdrRaw))) : undefined,
    clearHeaders: bool(f, 'clearHeaders'),
  };
}

export async function createSourceAction(f: FormData) {
  const u = await requireUser('ADMIN');
  const { clearHeaders: _c, ...data } = await sourceData(f, '/admin/sources');
  const s = await db.source.create({ data: { ...data, config: data.config ?? undefined, enabled: bool(f, 'enabled') } });
  await audit(u.email, 'source.create', 'Source', s.id, { name: s.name });
  refresh();
  flash(`/admin/sources/${s.id}`, 'ok', 'Source added. Use “Test fetch” to verify it before enabling.');
}

export async function updateSourceAction(f: FormData) {
  const u = await requireUser('ADMIN');
  const id = str(f, 'id');
  const { clearHeaders, headersEnc, ...data } = await sourceData(f, `/admin/sources/${id}`);
  await db.source.update({ where: { id }, data: { ...data, config: data.config ?? undefined, enabled: bool(f, 'enabled'), ...(clearHeaders ? { headersEnc: null } : headersEnc ? { headersEnc } : {}), etag: null, lastModified: null } });
  await audit(u.email, 'source.update', 'Source', id);
  refresh();
  flash(`/admin/sources/${id}`, 'ok', 'Source saved.');
}

export async function toggleSourceAction(f: FormData) {
  const u = await requireUser('ADMIN');
  const id = str(f, 'id');
  const s = await db.source.findUniqueOrThrow({ where: { id } });
  await db.source.update({ where: { id }, data: { enabled: !s.enabled, consecutiveFailures: 0 } });
  await audit(u.email, s.enabled ? 'source.disable' : 'source.enable', 'Source', id, { name: s.name });
  refresh();
  flash('/admin/sources', 'ok', `${s.name} ${s.enabled ? 'disabled' : 'enabled'}.`);
}

export async function deleteSourceAction(f: FormData) {
  const u = await requireUser('ADMIN');
  const id = str(f, 'id');
  const s = await db.source.findUniqueOrThrow({ where: { id } });
  await db.source.delete({ where: { id } });
  await audit(u.email, 'source.delete', 'Source', id, { name: s.name });
  refresh();
  flash('/admin/sources', 'ok', `${s.name} removed (published articles are kept).`);
}

export async function checkSourceNowAction(f: FormData) {
  const u = await requireUser('ADMIN');
  const id = str(f, 'id');
  await enqueue('check_source', { sourceId: id }, { dedupeKey: `check:${id}:manual:${Date.now()}`, maxAttempts: 1 });
  const stats = await drainQueue(handlers, { deadline: Date.now() + 100_000, concurrency: 3 });
  await audit(u.email, 'source.check_now', 'Source', id, stats);
  refresh();
  flash(`/admin/sources/${id}`, 'ok', `Check complete — ${stats.processed} job(s) processed, ${stats.failed} failed. See “Recent items” below.`);
}

export async function runTickNowAction() {
  const u = await requireUser('ADMIN');
  try {
    const stats = await runTick({ budgetMs: 100_000 });
    await audit(u.email, 'tick.manual', undefined, undefined, stats);
    refresh();
    flash('/admin', 'ok', `Tick complete: ${stats.scheduled} source(s) scheduled, ${stats.processed} job(s) processed, ${stats.failed} failed.`);
  } catch (e) {
    if (e instanceof Error && e.message === 'NEXT_REDIRECT') throw e;
    flash('/admin', 'err', `Tick failed: ${errMsg(e)}`);
  }
}

export async function testSourceAction(f: FormData) {
  await requireUser('ADMIN');
  const id = str(f, 'id');
  const s = await db.source.findUniqueOrThrow({ where: { id } });
  try {
    const feed = await fetchSource({ ...s, etag: null, lastModified: null });
    const preview = feed.items.slice(0, 5).map((i) => `• ${truncate(i.title, 80)}`).join('\n');
    flash(`/admin/sources/${id}`, 'ok', `Fetched ${feed.items.length} item(s) successfully.\n${preview}`);
  } catch (e) {
    if (e instanceof Error && e.message === 'NEXT_REDIRECT') throw e;
    flash(`/admin/sources/${id}`, 'err', `Fetch failed: ${errMsg(e)}`);
  }
}

/* ------------------------------------------------------------ articles */
export async function saveArticleAction(f: FormData) {
  const u = await requireUser();
  const id = str(f, 'id');
  const back = `/admin/articles/${id}`;
  const prev = await db.article.findUniqueOrThrow({ where: { id } });
  const title = str(f, 'title');
  const bodyMd = String(f.get('bodyMd') ?? '').trim();
  if (title.length < 5 || bodyMd.length < 50) flash(back, 'err', 'Title and body are required.');
  const cat = await db.category.findUnique({ where: { slug: str(f, 'category') } });
  if (!cat) flash(back, 'err', 'Unknown category.');
  let slug = slugify(str(f, 'slug') || title, 80);
  if (slug !== prev.slug && (await db.article.findUnique({ where: { slug } }))) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

  const imageFile = f.get('image');
  let imageData: Prisma.ArticleUpdateInput = {};
  if (imageFile instanceof File && imageFile.size > 0) {
    if (imageFile.size > 4_000_000) flash(back, 'err', 'Image must be under 4 MB.');
    if (!str(f, 'imageAlt') || !str(f, 'imageCredit')) flash(back, 'err', 'Uploaded images need alt text and a credit/licence line.');
    try {
      const stored = await storeImage(Buffer.from(await imageFile.arrayBuffer()));
      imageData = { imageKind: 'SOURCE_LICENSED', imageUrl: stored.url, imageSmallUrl: stored.smallUrl, imageIsAi: bool(f, 'imageIsAi') };
      if (bool(f, 'imageIsAi')) imageData.imageKind = 'AI_ILLUSTRATION';
    } catch (e) { flash(back, 'err', `Image rejected: ${errMsg(e)}`); }
  }
  if (bool(f, 'removeImage')) imageData = { imageKind: 'FALLBACK', imageUrl: null, imageSmallUrl: null, imageIsAi: false };

  await db.articleRevision.create({ data: { articleId: id, editorId: u.id, reason: 'manual edit', snapshot: { title: prev.title, dek: prev.dek, excerpt: prev.excerpt, summary: prev.summary, bodyMd: prev.bodyMd, slug: prev.slug, tags: prev.tags, categoryId: prev.categoryId } } });
  await db.article.update({
    where: { id },
    data: {
      title, slug, dek: str(f, 'dek') || null, excerpt: truncate(str(f, 'excerpt'), 300), summary: truncate(str(f, 'summary'), 260),
      bodyMd, bodyHtml: renderBody(bodyMd), seoTitle: truncate(str(f, 'seoTitle') || title, 60), metaDescription: truncate(str(f, 'metaDescription') || str(f, 'excerpt'), 160),
      tags: str(f, 'tags').split(',').map((t) => t.trim()).filter(Boolean).slice(0, 10), category: { connect: { id: cat!.id } },
      isBreaking: bool(f, 'isBreaking'), isFeatured: bool(f, 'isFeatured'),
      imageAlt: str(f, 'imageAlt') || prev.imageAlt, imageCredit: str(f, 'imageCredit') || prev.imageCredit, imageCreditUrl: str(f, 'imageCreditUrl') || prev.imageCreditUrl,
      ...imageData,
      ...(prev.status === 'PUBLISHED' ? { updatedContentAt: new Date() } : {}),
    },
  });
  await audit(u.email, 'article.edit', 'Article', id, { title });
  await revalidatePublic(slug);
  if (prev.slug !== slug) await revalidatePublic(prev.slug);
  refresh();
  flash(back, 'ok', 'Article saved.');
}

export async function publishArticleAction(f: FormData) {
  const u = await requireUser();
  const id = str(f, 'id');
  const r = await publishArticle(id, u.email, { ignoreLimits: true });
  refresh();
  flash(str(f, 'back') || `/admin/articles/${id}`, r.published ? 'ok' : 'err', r.published ? 'Published.' : `Not published: ${r.reason}`);
}
export async function unpublishArticleAction(f: FormData) {
  const u = await requireUser();
  await unpublishArticle(str(f, 'id'), u.email);
  refresh();
  flash(str(f, 'back') || `/admin/articles/${str(f, 'id')}`, 'ok', 'Article unpublished (removed from the site).');
}
export async function rejectArticleAction(f: FormData) {
  const u = await requireUser();
  const id = str(f, 'id');
  const a = await db.article.update({ where: { id }, data: { status: 'REJECTED', reviewReason: str(f, 'reason') || 'Rejected by editor', reviewCode: 'MANUAL_REJECT' }, select: { slug: true } });
  await audit(u.email, 'article.reject', 'Article', id);
  await revalidatePublic(a.slug);
  refresh();
  flash(str(f, 'back') || '/admin/articles?status=PENDING_REVIEW', 'ok', 'Article rejected.');
}
export async function deleteArticleAction(f: FormData) {
  const u = await requireUser('ADMIN');
  const id = str(f, 'id');
  const a = await db.article.findUniqueOrThrow({ where: { id }, select: { slug: true, title: true, storyId: true } });
  await db.article.delete({ where: { id } });
  await audit(u.email, 'article.delete', 'Article', id, { title: a.title });
  await revalidatePublic(a.slug);
  refresh();
  flash('/admin/articles', 'ok', 'Article deleted. Its source URLs stay recorded so the story is not re-published automatically.');
}
export async function addCorrectionAction(f: FormData) {
  const u = await requireUser();
  const id = str(f, 'id');
  const text = str(f, 'text');
  if (text.length < 5) flash(`/admin/articles/${id}`, 'err', 'Write the correction text.');
  const a = await db.article.update({ where: { id }, data: { updatedContentAt: new Date(), corrections: { create: { text } } }, select: { slug: true } });
  await audit(u.email, 'article.correction', 'Article', id, { text });
  await revalidatePublic(a.slug);
  flash(`/admin/articles/${id}`, 'ok', 'Correction published on the article.');
}

/* ------------------------------------------------------------ pipeline */
export async function retryItemAction(f: FormData) {
  const u = await requireUser();
  const id = str(f, 'id');
  const force = f.get('force') === 'true';
  const item = await db.sourceItem.findUniqueOrThrow({ where: { id } });
  const meta = { ...((item.meta as object) ?? {}), ...(force ? { forceProcess: true } : {}) };
  await db.$transaction([
    db.sourceItem.update({ where: { id }, data: { status: 'DETECTED', statusReason: null, storyId: null, meta: meta as Prisma.InputJsonValue } }),
    db.job.deleteMany({ where: { dedupeKey: { in: [`extract:${id}`, `generate:${id}`] } } }),
  ]);
  await enqueue('extract_item', { itemId: id }, { dedupeKey: `extract:${id}` });
  await audit(u.email, force ? 'item.process_anyway' : 'item.retry', 'SourceItem', id);
  flash('/admin/pipeline', 'ok', 'Item re-queued; it will be processed on the next tick.');
}
export async function retryFailedJobsAction() {
  const u = await requireUser();
  const r = await db.job.updateMany({ where: { status: 'FAILED' }, data: { status: 'PENDING', attempts: 0, runAt: new Date(), lastError: null } });
  await audit(u.email, 'jobs.retry_failed', undefined, undefined, { count: r.count });
  flash('/admin/pipeline', 'ok', `${r.count} failed job(s) re-queued.`);
}

/* ------------------------------------------------------------ settings */
export async function saveSettingsAction(f: FormData) {
  const u = await requireUser('ADMIN');
  const section = str(f, 'section');
  const back = `/admin/settings#${section}`;
  const patch: Record<string, unknown> = {};
  switch (section) {
    case 'site': patch.site = { name: str(f, 'name'), tagline: str(f, 'tagline'), description: str(f, 'description'), contactEmail: str(f, 'contactEmail'), twitterHandle: str(f, 'twitterHandle'), aiDisclosure: str(f, 'aiDisclosure') }; break;
    case 'automation': patch.automation = { monitoringEnabled: bool(f, 'monitoringEnabled'), autoPublish: bool(f, 'autoPublish'), defaultIntervalMinutes: num(f, 'defaultIntervalMinutes', 5), dailyPublishLimit: num(f, 'dailyPublishLimit', 80), hourlyPublishLimit: num(f, 'hourlyPublishLimit', 12), jobsPerTickConcurrency: num(f, 'jobsPerTickConcurrency', 3), breakingWindowMinutes: num(f, 'breakingWindowMinutes', 180), maxGenerationAttempts: num(f, 'maxGenerationAttempts', 2) }; break;
    case 'ai': patch.ai = { provider: str(f, 'provider'), model: str(f, 'model'), verifierModel: str(f, 'verifierModel'), baseUrl: str(f, 'baseUrl'), temperature: num(f, 'temperature', 0.4), maxOutputTokens: num(f, 'maxOutputTokens', 3500), styleGuide: str(f, 'styleGuide'), extraInstructions: str(f, 'extraInstructions'), verifyWithAi: bool(f, 'verifyWithAi'), inputPricePerMTok: num(f, 'inputPricePerMTok', 3), outputPricePerMTok: num(f, 'outputPricePerMTok', 15), verifierInputPricePerMTok: num(f, 'verifierInputPricePerMTok', 1), verifierOutputPricePerMTok: num(f, 'verifierOutputPricePerMTok', 5), embeddings: { enabled: bool(f, 'embEnabled'), model: str(f, 'embModel'), baseUrl: str(f, 'embBaseUrl'), similarityThreshold: num(f, 'embThreshold', 0.86) } }; break;
    case 'quality': patch.quality = { minSourceChars: num(f, 'minSourceChars', 350), minWords: num(f, 'minWords', 160), maxWords: num(f, 'maxWords', 650), maxVerbatimRunWords: num(f, 'maxVerbatimRunWords', 10), maxOverlapRatio: num(f, 'maxOverlapRatio', 0.12), duplicateThreshold: num(f, 'duplicateThreshold', 0.42), duplicateWindowHours: num(f, 'duplicateWindowHours', 72), unsupportedNameRatio: num(f, 'unsupportedNameRatio', 0.12), requireAiVerification: bool(f, 'requireAiVerification') }; break;
    case 'sensitive': patch.sensitive = { policy: str(f, 'policy'), minIndependentSources: num(f, 'minIndependentSources', 2), extraKeywords: str(f, 'extraKeywords') }; break;
    case 'images': patch.images = { stockProvider: str(f, 'stockProvider'), aiIllustrations: str(f, 'aiIllustrations'), aiImageModel: str(f, 'aiImageModel'), aiImageBaseUrl: str(f, 'aiImageBaseUrl'), useLicensedSourceImages: bool(f, 'useLicensedSourceImages') }; break;
    case 'alerts': patch.alerts = { webhookUrl: str(f, 'webhookUrl'), sourceFailureThreshold: num(f, 'sourceFailureThreshold', 3), notifyOnReviewQueue: bool(f, 'notifyOnReviewQueue') }; break;
    default: flash('/admin/settings', 'err', 'Unknown section.');
  }
  try { await updateSettings(patch); } catch (e) { flash(back, 'err', `Invalid settings: ${e instanceof z.ZodError ? e.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') : errMsg(e)}`); }
  await audit(u.email, 'settings.update', 'Setting', section);
  try { const { revalidateTag } = await import('next/cache'); revalidateTag('settings'); revalidateTag('articles'); } catch { /* ignore */ }
  flash(back, 'ok', `${section[0].toUpperCase()}${section.slice(1)} settings saved.`);
}

export async function saveApiKeyAction(f: FormData) {
  const u = await requireUser('ADMIN');
  const key = str(f, 'apiKey');
  if (f.get('clear') === 'true') await updateSettings({ ai: { apiKeyEnc: '' } });
  else if (key.length >= 10) await updateSettings({ ai: { apiKeyEnc: encryptSecret(key) } });
  else flash('/admin/settings#ai', 'err', 'That does not look like an API key.');
  await audit(u.email, f.get('clear') === 'true' ? 'settings.api_key_cleared' : 'settings.api_key_set');
  flash('/admin/settings#ai', 'ok', f.get('clear') === 'true' ? 'Stored API key removed.' : 'API key stored (encrypted). It is never shown again.');
}

export async function testAiAction() {
  await requireUser('ADMIN');
  const s = await getSettings(true);
  try {
    const t0 = Date.now();
    const r = await getLlm(s).complete({ system: 'Reply with the single word: ok', user: 'ping', model: s.ai.model, maxTokens: 20, temperature: 0 });
    flash('/admin/settings#ai', 'ok', `AI connection works (${s.ai.provider} / ${s.ai.model}, ${Date.now() - t0} ms, reply: “${truncate(r.text, 30)}”).`);
  } catch (e) {
    if (e instanceof Error && e.message === 'NEXT_REDIRECT') throw e;
    flash('/admin/settings#ai', 'err', `AI connection failed: ${errMsg(e)}`);
  }
}

export async function testAlertAction() {
  await requireUser('ADMIN');
  const ok = await sendAlert(`test:${Date.now()}`, 'Test alert', 'If you can read this, alerts are configured correctly.', 0);
  flash('/admin/settings#alerts', ok ? 'ok' : 'err', ok ? 'Test alert delivered.' : 'Alert not delivered — check the webhook URL.');
}

export async function saveCategoryAction(f: FormData) {
  const u = await requireUser('ADMIN');
  const id = str(f, 'id');
  await db.category.update({ where: { id }, data: { autoPublish: bool(f, 'autoPublish'), sensitive: bool(f, 'sensitive'), description: str(f, 'description') || null } });
  await audit(u.email, 'category.update', 'Category', id);
  try { const { revalidateTag } = await import('next/cache'); revalidateTag('articles'); } catch { /* ignore */ }
  flash('/admin/settings#categories', 'ok', 'Category policy saved.');
}

/* ------------------------------------------------------------ users */
export async function createUserAction(f: FormData) {
  const u = await requireUser('ADMIN');
  const email = z.string().email().safeParse(str(f, 'email'));
  const pw = String(f.get('password') ?? '');
  const weak = validatePasswordStrength(pw);
  if (!email.success) flash('/admin/users', 'err', 'Enter a valid email.');
  if (weak) flash('/admin/users', 'err', weak);
  if (await db.user.findUnique({ where: { email: email.data!.toLowerCase() } })) flash('/admin/users', 'err', 'That email already exists.');
  await db.user.create({ data: { email: email.data!.toLowerCase(), name: str(f, 'name') || email.data!, passwordHash: await hashPassword(pw), role: str(f, 'role') === 'ADMIN' ? 'ADMIN' : 'EDITOR' } });
  await audit(u.email, 'user.create', 'User', undefined, { email: email.data });
  flash('/admin/users', 'ok', 'User created.');
}
export async function toggleUserAction(f: FormData) {
  const u = await requireUser('ADMIN');
  const id = str(f, 'id');
  if (id === u.id) flash('/admin/users', 'err', 'You cannot deactivate yourself.');
  const t = await db.user.findUniqueOrThrow({ where: { id } });
  await db.user.update({ where: { id }, data: { active: !t.active } });
  await audit(u.email, t.active ? 'user.deactivate' : 'user.activate', 'User', id);
  flash('/admin/users', 'ok', `${t.email} ${t.active ? 'deactivated' : 'activated'}.`);
}
export async function resetPasswordAction(f: FormData) {
  const u = await requireUser('ADMIN');
  const pw = String(f.get('password') ?? '');
  const weak = validatePasswordStrength(pw);
  if (weak) flash('/admin/users', 'err', weak);
  await db.user.update({ where: { id: str(f, 'id') }, data: { passwordHash: await hashPassword(pw) } });
  await audit(u.email, 'user.password_reset', 'User', str(f, 'id'));
  flash('/admin/users', 'ok', 'Password updated.');
}
