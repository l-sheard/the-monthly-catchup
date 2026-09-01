import { eq } from 'drizzle-orm';
import { users } from '@stay-in-touch/shared/schema';
import type { ClerkClient } from '@clerk/backend';
import type { Db } from '../db';

/**
 * Every FK in this schema (group_members.user_id, answers.user_id, ...)
 * points at our own users.id (uuid) — never Clerk's user ID (a "user_..."
 * string, not a valid uuid). This resolves the Clerk-authenticated caller to
 * our local row, provisioning one on first sight. Only a brand-new user
 * costs an extra call to Clerk for their email/name; every request after
 * that is a single indexed lookup by clerk_id.
 */
export async function getOrCreateUser(db: Db, clerk: ClerkClient, clerkUserId: string) {
  const [existing] = await db.select().from(users).where(eq(users.clerkId, clerkUserId)).limit(1);
  if (existing) return existing;

  const clerkUser = await clerk.users.getUser(clerkUserId);
  const email =
    clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)?.emailAddress ??
    clerkUser.emailAddresses[0]?.emailAddress;

  if (!email) {
    throw new Error(`Clerk user ${clerkUserId} has no email address`);
  }

  const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || email;

  const [created] = await db
    .insert(users)
    .values({ clerkId: clerkUserId, email, name, avatarUrl: clerkUser.imageUrl })
    .onConflictDoNothing({ target: users.clerkId })
    .returning();

  if (created) return created;

  // Lost a race with a concurrent request provisioning the same user.
  const [raceWinner] = await db.select().from(users).where(eq(users.clerkId, clerkUserId)).limit(1);
  return raceWinner!;
}
