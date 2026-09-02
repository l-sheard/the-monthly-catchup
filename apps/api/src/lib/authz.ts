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

/**
 * For actions scoped to the group's owner — removing a member, deleting the
 * group outright. Throws NOT_A_MEMBER the same way assertGroupMember does
 * (so callers can share one catch block) plus a distinct NOT_OWNER for a
 * real member who just isn't the owner, in case a route ever wants to tell
 * those apart in its response.
 */
export async function assertGroupOwner(db: Db, groupId: string, userId: string) {
  const membership = await assertGroupMember(db, groupId, userId);

  if (membership.role !== 'owner') {
    throw new Error('NOT_OWNER');
  }

  return membership;
}
