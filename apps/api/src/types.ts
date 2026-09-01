export interface Bindings {
  DATABASE_URL: string;
  CLERK_SECRET_KEY: string;
  CLERK_PUBLISHABLE_KEY: string;
  RESEND_API_KEY: string;
  MEDIA_BUCKET: R2Bucket;
  /** HMAC secret for self-issued signed media URLs (see lib/media-signing.ts) — used to embed images/audio in emails, which can't send an Authorization header. */
  MEDIA_SIGNING_SECRET: string;
  API_BASE_URL: string;
}

import type { Db } from './db';

export interface Variables {
  /** Our own users.id (uuid) — resolved from the Clerk session by requireAuth, never Clerk's raw user ID. */
  userId: string;
  db: Db;
}
