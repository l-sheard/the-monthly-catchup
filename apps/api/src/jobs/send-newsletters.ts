import { and, eq, lte } from 'drizzle-orm';
import { cycles } from '@stay-in-touch/shared/schema';
import type { Db } from '../db';
import { sendNewsletterForCycle } from '../lib/newsletter';

/**
 * Runs once a day alongside openCyclesForToday (see index.ts's `scheduled`
 * export). Rather than checking "is today the month's last day" — the
 * deadline itself already encodes that, see jobs/open-cycles.ts — this
 * just sends any cycle that's still 'open' and whose deadline has passed.
 * That makes it self-healing the same way openCyclesForToday is: a missed
 * cron invocation on the exact deadline day still catches up on the next
 * run, and sendNewsletterForCycle flips status to 'sent' as its last step,
 * so an already-sent cycle (whether by this job or the manual
 * POST /cycles/:id/send-newsletter trigger) is never re-sent.
 */
export async function sendNewslettersPastDeadline(
  db: Db,
  env: { RESEND_API_KEY: string; MEDIA_SIGNING_SECRET: string; API_BASE_URL: string },
  today: Date = new Date(),
) {
  const dueCycles = await db
    .select({ id: cycles.id })
    .from(cycles)
    .where(and(eq(cycles.status, 'open'), lte(cycles.deadlineAt, today)));

  let sent = 0;
  const failures: Array<{ cycleId: string; error: string }> = [];

  for (const cycle of dueCycles) {
    try {
      await sendNewsletterForCycle(db, env, cycle.id);
      sent++;
    } catch (err) {
      failures.push({ cycleId: cycle.id, error: err instanceof Error ? err.message : 'Unknown error' });
    }
  }

  return { checked: dueCycles.length, sent, failures };
}
