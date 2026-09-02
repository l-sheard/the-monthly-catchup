import { eq, inArray, or } from 'drizzle-orm';
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
import { signMediaUrl } from './media-signing';
import { COLOR, FONT, escapeHtml, normalizeUrl, pillLink, renderEmailShell } from './email-theme';

interface MemberMedia {
  kind: 'photo' | 'audio';
  url: string;
}

// Mirrors apps/mobile/src/app/cycles/[id].tsx's QUESTION_EMOJI — keep in
// sync by hand so a recipe question looks like a recipe question wherever
// it's read.
const QUESTION_EMOJI: Record<string, string> = {
  text: '💬',
  favourites: '⭐',
  recipe: '🍳',
  photo: '📸',
  voice: '🎙️',
  meetup: '📅',
};

/** Builds the compiled newsletter HTML from everyone's answers for a cycle. */
export function renderNewsletterHtml(params: {
  groupName: string;
  month: number;
  year: number;
  answersByMember: Array<{
    memberName: string;
    answers: Array<{ prompt: string; body: string; link: string | null; type: string }>;
    media: MemberMedia[];
  }>;
  suggestions: Array<{ authorName: string; bodyText: string }>;
}) {
  const monthName = new Date(Date.UTC(params.year, params.month - 1, 1)).toLocaleString('en-US', {
    month: 'long',
  });

  const memberSections = params.answersByMember
    .map((member) => {
      const photos = member.media.filter((m) => m.kind === 'photo');
      const audioLinks = member.media.filter((m) => m.kind === 'audio');

      const photosHtml = photos.length
        ? `<div style="margin:0 0 14px;">
            ${photos
              .map(
                (p) =>
                  `<img src="${p.url}" width="140" height="140" style="width:140px;height:140px;object-fit:cover;border-radius:12px;border:1px solid ${COLOR.sandLine};margin:0 8px 8px 0;" />`,
              )
              .join('')}
          </div>`
        : '';

      const audioHtml = audioLinks
        .map(
          (a, i) =>
            `<p style="margin:0 0 14px;">${pillLink(a.url, `🎙️ Listen to voice note${audioLinks.length > 1 ? ` #${i + 1}` : ''}`)}</p>`,
        )
        .join('');

      const answersHtml = member.answers
        .map(
          (a) => `
            <div style="margin:0 0 14px;">
              <p style="margin:0 0 6px;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${COLOR.primary};">${QUESTION_EMOJI[a.type] ?? '💬'}&nbsp; ${escapeHtml(a.prompt)}</p>
              <div style="background:${COLOR.sand};border:1px solid ${COLOR.sandLine};border-radius:12px;padding:12px 14px;">
                <p style="margin:0;font-family:${FONT};font-size:14px;line-height:1.55;color:${COLOR.charcoal};">${escapeHtml(a.body) || `<span style="color:${COLOR.charcoalFaint};font-style:italic;">No answer this month</span>`}</p>
              </div>
              ${a.link ? `<p style="margin:8px 0 0;">${pillLink(escapeHtml(normalizeUrl(a.link)), '🔗 View recipe')}</p>` : ''}
            </div>`,
        )
        .join('');

      const initial = escapeHtml(member.memberName.charAt(0).toUpperCase() || '?');

      return `
        <tr><td style="padding:26px 32px 4px;border-top:1px solid ${COLOR.paperLine};">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td width="26" height="26" align="center" valign="middle" style="width:26px;height:26px;border-radius:13px;background:rgba(242,119,106,.15);">
              <span style="font-family:${FONT};font-size:11px;font-weight:700;color:${COLOR.primary};">${initial}</span>
            </td>
            <td style="padding-left:9px;">
              <span style="font-family:${FONT};font-size:16px;font-weight:700;color:${COLOR.charcoal};">${escapeHtml(member.memberName)}</span>
            </td>
          </tr></table>
          <div style="height:14px;"></div>
          ${answersHtml}
          ${photosHtml}
          ${audioHtml}
        </td></tr>`;
    })
    .join('');

  const suggestionsSection = params.suggestions.length
    ? `
      <tr><td style="padding:26px 32px 30px;border-top:1px solid ${COLOR.paperLine};">
        <p style="margin:0 0 12px;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${COLOR.primary};">📅&nbsp; Meetup suggestions</p>
        ${params.suggestions
          .map(
            (s) =>
              `<div style="background:${COLOR.sand};border:1px solid ${COLOR.sandLine};border-radius:12px;padding:10px 14px;margin:0 0 8px;">
                <p style="margin:0;font-family:${FONT};font-size:14px;line-height:1.5;color:${COLOR.charcoal};"><strong>${escapeHtml(s.authorName)}:</strong> ${escapeHtml(s.bodyText)}</p>
              </div>`,
          )
          .join('')}
      </td></tr>`
    : '';

  return renderEmailShell({
    eyebrow: '💌&nbsp; The Monthly Catch-Up',
    title: params.groupName,
    subtitle: `${monthName} ${params.year}`,
    bodyRows: memberSections + suggestionsSection,
    footerText:
      "Sent by The Monthly Catch-Up — see everyone's answers any time in the app. Photo/voice-note links in this email expire in 90 days.",
  });
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
  env: { RESEND_API_KEY: string; MEDIA_SIGNING_SECRET: string; API_BASE_URL: string },
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

  // Defaults plus this cycle's own randomly-selected suggested question, if
  // any — same query as GET /cycles/:id, see that route for why cycleId
  // (not groupId) is what scopes a suggested question to just this month.
  const allQuestions = await db
    .select()
    .from(questions)
    .where(or(eq(questions.isDefault, true), eq(questions.cycleId, cycleId)))
    .orderBy(questions.sortOrder);

  const allAnswers = await db.select().from(answers).where(eq(answers.cycleId, cycleId));
  const answersByUserId = new Map<string, Map<string, { bodyText: string; linkUrl: string | null }>>();
  const answerIdToUserId = new Map<string, string>();
  for (const a of allAnswers) {
    if (!answersByUserId.has(a.userId)) answersByUserId.set(a.userId, new Map());
    answersByUserId.get(a.userId)!.set(a.questionId, { bodyText: a.bodyText ?? '', linkUrl: a.linkUrl });
    answerIdToUserId.set(a.id, a.userId);
  }

  // Signed links (see lib/media-signing.ts) so images/audio can be embedded
  // directly — the bucket stays private, but an email client can follow a
  // plain URL where it could never send an Authorization header.
  const mediaByUserId = new Map<string, MemberMedia[]>();
  if (allAnswers.length > 0) {
    const mediaRows = await db
      .select({ id: media.id, kind: media.kind, answerId: media.answerId })
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
      const { expires, sig } = await signMediaUrl(env.MEDIA_SIGNING_SECRET, row.id);
      const url = `${env.API_BASE_URL}/media/${row.id}/public?expires=${expires}&sig=${sig}`;
      if (!mediaByUserId.has(uid)) mediaByUserId.set(uid, []);
      mediaByUserId.get(uid)!.push({ kind: row.kind, url });
    }
  }

  const answersByMember = members
    .map((member) => {
      const theirAnswers = answersByUserId.get(member.id);
      if (!theirAnswers || theirAnswers.size === 0) return null; // skip members who answered nothing
      return {
        memberName: member.name,
        answers: allQuestions.map((q) => ({
          prompt: q.promptText,
          body: theirAnswers.get(q.id)?.bodyText ?? '',
          link: theirAnswers.get(q.id)?.linkUrl ?? null,
          type: q.type,
        })),
        media: mediaByUserId.get(member.id) ?? [],
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
      await sendEmail(env.RESEND_API_KEY, { to: member.email, subject, html });
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
