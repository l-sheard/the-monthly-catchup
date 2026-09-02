import { and, eq, isNull, sql } from 'drizzle-orm';
import { cycles, groups, questions, suggestedQuestions, users } from '@stay-in-touch/shared/schema';
import type { Db } from '../db';

const DEADLINE_DAY_OF_MONTH = 25;
// After the default questions (sortOrder 0-6 as seeded) — see
// seed/default-questions.ts. Doesn't need to be exact, just last.
const SUGGESTED_QUESTION_SORT_ORDER = 100;

/**
 * Picks one of a group's not-yet-used suggested questions at random and
 * materializes it as a real `questions` row scoped to this one cycle
 * (cycleId, not groupId — so it doesn't carry over into future months).
 * Marks the suggestion used either way it's consumed, so it's never drawn
 * twice. No-ops if the group has no pending suggestions. Attributes the
 * question to its suggester in the prompt text itself, since that's the
 * only place the app ever displays a question's promptText — no separate
 * "suggested by" plumbing needed anywhere else.
 */
async function selectQuestionForCycle(db: Db, groupId: string, cycleId: string) {
  const [pick] = await db
    .select({ id: suggestedQuestions.id, promptText: suggestedQuestions.promptText, userId: suggestedQuestions.userId })
    .from(suggestedQuestions)
    .where(and(eq(suggestedQuestions.groupId, groupId), isNull(suggestedQuestions.usedInCycleId)))
    .orderBy(sql`random()`)
    .limit(1);

  if (!pick) return;

  const [suggester] = await db.select({ name: users.name }).from(users).where(eq(users.id, pick.userId)).limit(1);

  await db.insert(questions).values({
    groupId,
    cycleId,
    promptText: suggester ? `${pick.promptText} (suggested by ${suggester.name})` : pick.promptText,
    type: 'text',
    sortOrder: SUGGESTED_QUESTION_SORT_ORDER,
    isDefault: false,
  });

  await db.update(suggestedQuestions).set({ usedInCycleId: cycleId }).where(eq(suggestedQuestions.id, pick.id));
}

/**
 * Runs once a day (see the "0 6 * * *" cron trigger in wrangler.jsonc) but
 * only actually does anything on the 1st — the daily cadence just makes the
 * job resilient to a missed/late invocation rather than needing an exact
 * once-a-month trigger. Idempotent: a group that already has a cycle for the
 * current month/year is skipped (the DB's unique(groupId, month, year) is
 * the backstop if this ever races).
 */
export async function openCyclesForToday(db: Db, today: Date = new Date()) {
  if (today.getUTCDate() !== 1) {
    return { ran: false as const, reason: 'not the 1st of the month' };
  }

  const month = today.getUTCMonth() + 1; // Date months are 0-indexed
  const year = today.getUTCFullYear();
  const deadlineAt = new Date(Date.UTC(year, today.getUTCMonth(), DEADLINE_DAY_OF_MONTH));

  const allGroups = await db.select().from(groups);

  let opened = 0;
  let skipped = 0;

  for (const group of allGroups) {
    const [existing] = await db
      .select()
      .from(cycles)
      .where(and(eq(cycles.groupId, group.id), eq(cycles.month, month), eq(cycles.year, year)))
      .limit(1);

    if (existing) {
      skipped++;
      continue;
    }

    const [newCycle] = await db
      .insert(cycles)
      .values({
        groupId: group.id,
        month,
        year,
        opensAt: today,
        deadlineAt,
        status: 'open',
      })
      .returning({ id: cycles.id });

    await selectQuestionForCycle(db, group.id, newCycle.id);

    opened++;
  }

  return { ran: true as const, groupCount: allGroups.length, opened, skipped };
}
