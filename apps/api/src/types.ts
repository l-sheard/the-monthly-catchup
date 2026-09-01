export interface Bindings {
  DATABASE_URL: string;
  CLERK_SECRET_KEY: string;
  RESEND_API_KEY: string;
  MEDIA_BUCKET: R2Bucket;
}

import type { Db } from './db';

export interface Variables {
  /** Our own users.id (uuid) — resolved from the Clerk session by requireAuth, never Clerk's raw user ID. */
  userId: string;
  db: Db;
}
