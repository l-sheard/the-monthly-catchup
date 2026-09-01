import { and, eq, sql } from 'drizzle-orm';
import { answers, media } from '@stay-in-touch/shared/schema';
import { MEDIA_LIMITS } from '@stay-in-touch/shared/validators';
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
