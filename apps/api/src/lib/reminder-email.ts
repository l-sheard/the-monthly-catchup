import { eq } from 'drizzle-orm';
import { cycles, groupMembers, groups, users } from '@stay-in-touch/shared/schema';
import type { Db } from '../db';
import { sendEmail } from './email';
import { COLOR, FONT, renderEmailShell } from './email-theme';

function renderCycleOpenReminderHtml(params: { groupName: string; month: number; year: number; deadlineDay: number }) {
  const monthName = new Date(Date.UTC(params.year, params.month - 1, 1)).toLocaleString('en-US', {
    month: 'long',
  });

  const bodyRows = `
    <tr><td style="padding:26px 32px 30px;">
      <div style="background:${COLOR.sand};border:1px solid ${COLOR.sandLine};border-radius:12px;padding:16px;">
        <p style="margin:0;font-family:${FONT};font-size:14px;line-height:1.65;color:${COLOR.charcoal};">
          ${monthName}'s Monthly Catch-Up is open! Add what you've been up to, your favourites, a recipe, a photo, a voice note — whatever you'd like the group to see this month.
        </p>
      </div>
      <p style="margin:14px 0 0;font-family:${FONT};font-size:13px;color:${COLOR.charcoalMuted};">
        Answers are due by ${monthName} ${params.deadlineDay} — the newsletter goes out to the whole group right after.
      </p>
    </td></tr>`;

  return renderEmailShell({
    eyebrow: '🗓️&nbsp; The Monthly Catch-Up',
    title: params.groupName,
    subtitle: `${monthName} ${params.year} is open`,
    bodyRows,
    footerText: 'Sent by The Monthly Catch-Up — open the app to add your answers.',
  });
}

/**
 * Emails every member of a group the day their cycle opens (see
 * jobs/open-cycles.ts) — "the first day they can fill out their monthly
 * review", per the product ask. Best-effort per member, same pattern as
 * sendNewsletterForCycle: one bad/unreachable address doesn't stop the
 * others from getting theirs.
 */
export async function sendCycleOpenReminders(
  db: Db,
  env: { RESEND_API_KEY: string },
  cycleId: string,
): Promise<{ sentTo: string[]; failed: Array<{ email: string; error: string }> }> {
  const [cycle] = await db.select().from(cycles).where(eq(cycles.id, cycleId)).limit(1);
  if (!cycle) throw new Error('Cycle not found');

  const [group] = await db.select().from(groups).where(eq(groups.id, cycle.groupId)).limit(1);
  if (!group) throw new Error('Group not found');

  const members = await db
    .select({ email: users.email })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(eq(groupMembers.groupId, cycle.groupId));

  const html = renderCycleOpenReminderHtml({
    groupName: group.name,
    month: cycle.month,
    year: cycle.year,
    deadlineDay: cycle.deadlineAt.getUTCDate(),
  });
  const subject = `${group.name}: this month's Monthly Catch-Up is open 🗓️`;

  const sentTo: string[] = [];
  const failed: Array<{ email: string; error: string }> = [];

  for (const member of members) {
    try {
      await sendEmail(env.RESEND_API_KEY, { to: member.email, subject, html });
      sentTo.push(member.email);
    } catch (err) {
      failed.push({ email: member.email, error: err instanceof Error ? err.message : 'Unknown error' });
    }
  }

  return { sentTo, failed };
}
