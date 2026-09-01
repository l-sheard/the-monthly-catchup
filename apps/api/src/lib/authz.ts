import { and, eq } from 'drizzle-orm';
import { groupMembers } from '@stay-in-touch/shared/schema';
import type { Db } from '../db';

/**
 * Every group-scoped query must go through this check first — there is no
 * database-level RLS in this stack, so membership is the only gate.
 */
export async function assertGroupMember(db: Db, groupId: string, userId: string) {
  const [membership] = await db
    .select()
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
    .limit(1);

  if (!membership) {
    throw new Error('NOT_A_MEMBER');
  }

  return membership;
}
