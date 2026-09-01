import { and, eq } from 'drizzle-orm';
import { cycles, groups } from '@stay-in-touch/shared/schema';
import type { Db } from '../db';

const DEADLINE_DAY_OF_MONTH = 25;

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

    await db.insert(cycles).values({
      groupId: group.id,
      month,
      year,
      opensAt: today,
      deadlineAt,
      status: 'open',
    });
    opened++;
  }

  return { ran: true as const, groupCount: allGroups.length, opened, skipped };
}
