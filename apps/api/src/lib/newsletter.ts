import { eq, inArray } from 'drizzle-orm';
import {
  answers,
  cycles,
  groupMembers,
  groups,
  media,
  meetupSuggestions,
  newsletters,
  questions,
  users,
} from '@stay-in-touch/shared/schema';
import type { Db } from '../db';
import { sendEmail } from './email';

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Builds the compiled newsletter HTML from everyone's answers for a cycle. */
export function renderNewsletterHtml(params: {
  groupName: string;
  month: number;
  year: number;
  answersByMember: Array<{
    memberName: string;
    answers: Array<{ prompt: string; body: string }>;
    mediaNote: string | null;
  }>;
  suggestions: Array<{ authorName: string; bodyText: string }>;
}) {
  const monthName = new Date(Date.UTC(params.year, params.month - 1, 1)).toLocaleString('en-US', {
    month: 'long',
  });

  const memberSections = params.answersByMember
    .map(
      (member) => `
        <tr><td style="padding:24px 0 8px;border-top:1px solid #eee;">
          <h2 style="font-size:18px;margin:0 0 12px;color:#1C1815;">${escapeHtml(member.memberName)}</h2>
          ${member.answers
            .map(
              (a) => `
            <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#FF6B4A;text-transform:uppercase;letter-spacing:.03em;">${escapeHtml(a.prompt)}</p>
            <p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#333;">${escapeHtml(a.body) || '<em style="color:#999;">No answer this month</em>'}</p>
          `,
            )
            .join('')}
          ${
            member.mediaNote
              ? `<p style="margin:0;font-size:13px;color:#FF6B4A;">${escapeHtml(member.mediaNote)}</p>`
              : ''
          }
        </td></tr>`,
    )
    .join('');

  const suggestionsSection = params.suggestions.length
    ? `
      <tr><td style="padding:24px 0 8px;border-top:1px solid #eee;">
        <h2 style="font-size:18px;margin:0 0 12px;color:#1C1815;">📅 Meetup suggestions</h2>
        <ul style="margin:0;padding-left:20px;">
          ${params.suggestions
            .map(
              (s) =>
                `<li style="margin-bottom:8px;font-size:15px;color:#333;"><strong>${escapeHtml(s.authorName)}:</strong> ${escapeHtml(s.bodyText)}</li>`,
            )
            .join('')}
        </ul>
      </td></tr>`
    : '';

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#FFFBF7;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
    <table role="presentation" width="100%" style="max-width:600px;margin:0 auto;padding:32px 24px;">
      <tr><td>
        <p style="font-size:13px;font-weight:700;color:#FF6B4A;text-transform:uppercase;letter-spacing:.05em;margin:0 0 4px;">💌 The Monthly Catch-Up</p>
        <h1 style="font-size:26px;margin:0 0 4px;color:#1C1815;">${escapeHtml(params.groupName)}</h1>
        <p style="font-size:14px;color:#999;margin:0;">${monthName} ${params.year}</p>
      </td></tr>
      ${memberSections}
      ${suggestionsSection}
      <tr><td style="padding-top:32px;">
        <p style="font-size:12px;color:#aaa;">Sent by The Monthly Catch-Up — see everyone's answers any time in the app.</p>
      </td></tr>
    </table>
  </body>
</html>`;
}

/**
 * Compiles every member's answers + meetup suggestions for a cycle into one
 * newsletter, emails a copy to each member, and records it. Sends are
 * attempted per-member independently — one bad/unreachable address (e.g. a
 * Resend sandbox restriction in dev) doesn't stop the others from receiving
 * theirs.
 */
export async function sendNewsletterForCycle(
  db: Db,
  resendApiKey: string,
  cycleId: string,
): Promise<{ sentTo: string[]; failed: Array<{ email: string; error: string }> }> {
  const [cycle] = await db.select().from(cycles).where(eq(cycles.id, cycleId)).limit(1);
  if (!cycle) throw new Error('Cycle not found');

  const [group] = await db.select().from(groups).where(eq(groups.id, cycle.groupId)).limit(1);
  if (!group) throw new Error('Group not found');

  const members = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(eq(groupMembers.groupId, cycle.groupId));

  const allQuestions = await db
    .select()
    .from(questions)
    .where(eq(questions.isDefault, true))
    .orderBy(questions.sortOrder);

  const allAnswers = await db.select().from(answers).where(eq(answers.cycleId, cycleId));
  const answersByUserId = new Map<string, Map<string, string>>();
  const answerIdToUserId = new Map<string, string>();
  for (const a of allAnswers) {
    if (!answersByUserId.has(a.userId)) answersByUserId.set(a.userId, new Map());
    answersByUserId.get(a.userId)!.set(a.questionId, a.bodyText ?? '');
    answerIdToUserId.set(a.id, a.userId);
  }

  // Real inline photo/audio embedding needs signed, time-limited URLs (the
  // bucket is private, and an email client can't send an Authorization
  // header) — that's a follow-up, not built yet. For now the newsletter
  // just names what was attached; the actual files are viewable in the app.
  const mediaCountsByUserId = new Map<string, Map<'photo' | 'audio', number>>();
  if (allAnswers.length > 0) {
    const mediaRows = await db
      .select({ kind: media.kind, answerId: media.answerId })
      .from(media)
      .where(
        inArray(
          media.answerId,
          allAnswers.map((a) => a.id),
        ),
      );
    for (const row of mediaRows) {
      const uid = answerIdToUserId.get(row.answerId);
      if (!uid) continue;
      if (!mediaCountsByUserId.has(uid)) mediaCountsByUserId.set(uid, new Map());
      const counts = mediaCountsByUserId.get(uid)!;
      counts.set(row.kind, (counts.get(row.kind) ?? 0) + 1);
    }
  }

  const answersByMember = members
    .map((member) => {
      const theirAnswers = answersByUserId.get(member.id);
      if (!theirAnswers || theirAnswers.size === 0) return null; // skip members who answered nothing
      const counts = mediaCountsByUserId.get(member.id);
      const parts: string[] = [];
      if (counts?.get('photo')) parts.push(`📸 ${counts.get('photo')} photo${counts.get('photo')! > 1 ? 's' : ''}`);
      if (counts?.get('audio')) parts.push(`🎙️ ${counts.get('audio')} voice note`);
      return {
        memberName: member.name,
        answers: allQuestions.map((q) => ({
          prompt: q.promptText,
          body: theirAnswers.get(q.id) ?? '',
        })),
        mediaNote: parts.length ? `${parts.join(' · ')} attached — view in the app` : null,
      };
    })
    .filter((m): m is NonNullable<typeof m> => m !== null);

  const suggestionRows = await db
    .select({ bodyText: meetupSuggestions.bodyText, authorId: meetupSuggestions.userId })
    .from(meetupSuggestions)
    .where(eq(meetupSuggestions.cycleId, cycleId));
  const memberNameById = new Map(members.map((m) => [m.id, m.name]));
  const suggestions = suggestionRows.map((s) => ({
    authorName: memberNameById.get(s.authorId) ?? 'Someone',
    bodyText: s.bodyText,
  }));

  const html = renderNewsletterHtml({
    groupName: group.name,
    month: cycle.month,
    year: cycle.year,
    answersByMember,
    suggestions,
  });

  const subject = `${group.name}'s Monthly Catch-Up is here! 💌`;
  const sentTo: string[] = [];
  const failed: Array<{ email: string; error: string }> = [];

  for (const member of members) {
    try {
      await sendEmail(resendApiKey, { to: member.email, subject, html });
      sentTo.push(member.email);
    } catch (err) {
      failed.push({ email: member.email, error: err instanceof Error ? err.message : 'Unknown error' });
    }
  }

  await db
    .insert(newsletters)
    .values({ cycleId, compiledHtml: html, sentAt: new Date() })
    .onConflictDoUpdate({
      target: newsletters.cycleId,
      set: { compiledHtml: html, sentAt: new Date() },
    });

  await db.update(cycles).set({ status: 'sent' }).where(eq(cycles.id, cycleId));

  return { sentTo, failed };
}
