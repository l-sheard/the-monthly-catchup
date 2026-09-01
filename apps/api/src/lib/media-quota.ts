import { and, eq, sql } from 'drizzle-orm';
import { answers, media } from '@stay-in-touch/shared/schema';
import { MEDIA_LIMITS, TOTAL_STORAGE_BUDGET_BYTES } from '@stay-in-touch/shared/validators';
import type { Db } from '../db';

/**
 * Caps uploads per person per cycle (see MEDIA_LIMITS) so a handful of
 * friend groups can't run the shared R2 bucket past its free tier by
 * accident. Call this before issuing an upload URL, not just before
 * writing the media row — the count itself is the source of truth.
 */
export async function assertUnderMediaQuota(
  db: Db,
  cycleId: string,
  userId: string,
  kind: keyof typeof MEDIA_LIMITS,
) {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(media)
    .innerJoin(answers, eq(media.answerId, answers.id))
    .where(and(eq(answers.cycleId, cycleId), eq(answers.userId, userId), eq(media.kind, kind)));

  if (count >= MEDIA_LIMITS[kind].maxPerCycle) {
    throw new Error('MEDIA_QUOTA_EXCEEDED');
  }
}

/**
 * Hard global cutoff: reject the upload outright if accepting it would push
 * total stored bytes (summed from our own records, not an R2 API call —
 * cheaper and immediately consistent) past TOTAL_STORAGE_BUDGET_BYTES. This
 * is the backstop that catches everything the per-user quota above can't:
 * lots of groups, a bug, anything. Call it right before issuing an upload
 * URL, alongside assertUnderMediaQuota.
 */
export async function assertUnderStorageBudget(db: Db, incomingSizeBytes: number) {
  const [{ totalBytes }] = await db
    .select({ totalBytes: sql<number>`coalesce(sum(${media.sizeBytes}), 0)::bigint` })
    .from(media);

  if (Number(totalBytes) + incomingSizeBytes > TOTAL_STORAGE_BUDGET_BYTES) {
    throw new Error('STORAGE_BUDGET_EXCEEDED');
  }
}
