export interface Bindings {
  DATABASE_URL: string;
  CLERK_SECRET_KEY: string;
  RESEND_API_KEY: string;
  MEDIA_BUCKET: R2Bucket;
}

export interface Variables {
  userId: string;
}
