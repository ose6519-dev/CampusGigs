// Runtime bindings are also declared here so checks work without an authenticated Cloudflare build.
// Keep this interface aligned with apps/api/cloudflare.config.ts.
interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  FIREBASE_PROJECT_ID: string;
  WEB_ORIGINS: string;
}
