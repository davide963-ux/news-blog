/** Central, lazily-read environment access. Never import secrets into client components. */
function read(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

export const env = {
  get appUrl() {
    const explicit = read('NEXT_PUBLIC_SITE_URL') || read('SITE_URL');
    if (explicit) return explicit.replace(/\/+$/, '');
    const vercel = read('VERCEL_PROJECT_PRODUCTION_URL') || read('VERCEL_URL');
    if (vercel) return `https://${vercel}`;
    return 'http://localhost:3000';
  },
  get isProd() {
    return process.env.NODE_ENV === 'production';
  },
  get sessionSecret() {
    const v = read('SESSION_SECRET');
    if (!v && this.isProd) throw new Error('SESSION_SECRET is required in production');
    return v || 'dev-only-insecure-session-secret-change-me-please-32chars';
  },
  get encryptionKey() {
    const v = read('APP_ENCRYPTION_KEY');
    if (!v && this.isProd) throw new Error('APP_ENCRYPTION_KEY is required in production');
    return v || 'dev-only-insecure-encryption-key';
  },
  get cronSecret() {
    return read('CRON_SECRET');
  },
  get setupToken() {
    return read('SETUP_TOKEN');
  },
  get botContact() {
    return read('BOT_CONTACT_EMAIL', 'webmaster@example.com');
  },
  get aiApiKeyEnv() {
    return { anthropic: read('ANTHROPIC_API_KEY'), openai: read('OPENAI_API_KEY'), generic: read('AI_API_KEY') };
  },
  get pexelsKey() {
    return read('PEXELS_API_KEY');
  },
  get unsplashKey() {
    return read('UNSPLASH_ACCESS_KEY');
  },
  get blobToken() {
    return read('BLOB_READ_WRITE_TOKEN');
  },
  get revalidateSecret() {
    return read('REVALIDATE_SECRET') || read('CRON_SECRET');
  },
};
