import { and, eq, isNull, sql } from 'drizzle-orm';
import { cycles, groups, questions, suggestedQuestions, users } from '@stay-in-touch/shared/schema';
import type { Db } from '../db';
import { sendCycleOpenReminders } from '../lib/reminder-email';

// The review window is the final week of the month it's about (so people
// are reflecting on a month that's essentially over, not guessing at days
// that haven't happened yet) — opens this many days before the month's last
// day (6 => a 7-day window including the last day itself), and the
// deadline — see jobs/send-newsletters.ts — is that last day.
const OPEN_DAYS_BEFORE_MONTH_END = 6;
// After the default questions (sortOrder 0-6 as seeded) — see
// seed/default-questions.ts. Doesn't need to be exact, just last.
const SUGGESTED_QUESTION_SORT_ORDER = 100;

// Date.UTC's month param is 0-indexed, so passing the 1-indexed `month`
// straight through rolls "day 0" back to the last day of that month —
// handles December (month=12 -> January of next year, day 0 -> Dec 31) and
// leap Februaries for free.
function lastDayOfMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0));
}

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
 * Runs once a day (see the "0 6 * * *" cron trigger in wrangler.jsonc).
 * No-ops entirely before the current month's final week starts. From then
 * on, opens a cycle for every group that doesn't have one yet for this
 * month/year, with its deadline set to the month's last day — the
 * per-group "does a cycle already exist" check (backstopped by the DB's
 * unique(groupId, month, year)) makes this self-healing across the whole
 * window: a cron invocation missed on the exact open day still catches up
 * the next time it runs, without ever double-creating a cycle or
 * double-sending the "it's open" reminder below.
 */
export async function openCyclesForToday(
  db: Db,
  env: { RESEND_API_KEY: string },
  today: Date = new Date(),
) {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth() + 1; // Date months are 0-indexed
  const deadlineAt = lastDayOfMonth(year, month);
  const openDay = deadlineAt.getUTCDate() - OPEN_DAYS_BEFORE_MONTH_END;

  if (today.getUTCDate() < openDay) {
    return { ran: false as const, reason: 'not yet the final week of the month' };
  }

  const allGroups = await db.select().from(groups);

  let opened = 0;
  let skipped = 0;
  let remindersSent = 0;
  let reminderFailures = 0;

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

    // Best-effort — a flaky Resend call shouldn't undo the cycle that just
    // opened. Members can still see it's open in the app either way.
    try {
      const { sentTo, failed } = await sendCycleOpenReminders(db, env, newCycle.id);
      remindersSent += sentTo.length;
      reminderFailures += failed.length;
    } catch {
      reminderFailures++;
    }
  }

  return { ran: true as const, groupCount: allGroups.length, opened, skipped, remindersSent, reminderFailures };
}
