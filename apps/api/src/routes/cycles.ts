import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import {
  submitAnswerInput,
  submitMeetupSuggestionInput,
  submitQuestionSuggestionInput,
} from '@stay-in-touch/shared/validators';
import {
  answers,
  cycles,
  groupMembers,
  groups,
  media,
  meetupSuggestions,
  questions,
  suggestedQuestions,
  users,
} from '@stay-in-touch/shared/schema';
import type { MediaView } from '@stay-in-touch/shared';
import type { CycleDetailResponse } from '@stay-in-touch/shared';
import { requireAuth } from '../middleware/auth';
import { assertGroupMember } from '../lib/authz';
import { sendNewsletterForCycle } from '../lib/newsletter';
import type { Bindings, Variables } from '../types';

export const cyclesRoute = new Hono<{ Bindings: Bindings; Variables: Variables }>();

cyclesRoute.use('*', requireAuth);

cyclesRoute.get('/:id', async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');
  const cycleId = c.req.param('id');

  const [cycle] = await db.select().from(cycles).where(eq(cycles.id, cycleId)).limit(1);
  if (!cycle) return c.json({ error: 'Cycle not found' }, 404);

  try {
    await assertGroupMember(db, cycle.groupId, userId);
  } catch {
    return c.json({ error: 'Not a member of this group' }, 403);
  }

  const [group] = await db.select().from(groups).where(eq(groups.id, cycle.groupId)).limit(1);

  // Defaults, shared across every cycle, plus this cycle's own randomly-
  // selected suggested question, if it got one (see jobs/open-cycles.ts) —
  // scoped by cycleId, not groupId, so it doesn't carry over into future
  // cycles for the same group.
  const cycleQuestions = await db
    .select()
    .from(questions)
    .where(or(eq(questions.isDefault, true), eq(questions.cycleId, cycleId)))
    .orderBy(questions.sortOrder);

  const myAnswerRows = await db
    .select({
      id: answers.id,
      questionId: answers.questionId,
      bodyText: answers.bodyText,
      linkUrl: answers.linkUrl,
    })
    .from(answers)
    .where(and(eq(answers.cycleId, cycleId), eq(answers.userId, userId)));

  const myAnswers: Record<string, string> = {};
  const myLinks: Record<string, string> = {};
  const questionIdByAnswerId = new Map<string, string>();
  for (const row of myAnswerRows) {
    myAnswers[row.questionId] = row.bodyText ?? '';
    myLinks[row.questionId] = row.linkUrl ?? '';
    questionIdByAnswerId.set(row.id, row.questionId);
  }

  const myMedia: Record<string, MediaView[]> = {};
  if (myAnswerRows.length > 0) {
    const mediaRows = await db
      .select({
        id: media.id,
        kind: media.kind,
        durationSeconds: media.durationSeconds,
        caption: media.caption,
        answerId: media.answerId,
      })
      .from(media)
      .where(
        inArray(
          media.answerId,
          myAnswerRows.map((r) => r.id),
        ),
      );
    for (const row of mediaRows) {
      const questionId = questionIdByAnswerId.get(row.answerId);
      if (!questionId) continue;
      (myMedia[questionId] ??= []).push({
        id: row.id,
        kind: row.kind,
        durationSeconds: row.durationSeconds,
        caption: row.caption,
      });
    }
  }

  const suggestionRows = await db
    .select({ id: meetupSuggestions.id, bodyText: meetupSuggestions.bodyText, authorName: users.name })
    .from(meetupSuggestions)
    .innerJoin(users, eq(users.id, meetupSuggestions.userId))
    .where(eq(meetupSuggestions.cycleId, cycleId));

  const memberRows = await db
    .select({ id: users.id, name: users.name, role: groupMembers.role })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(eq(groupMembers.groupId, cycle.groupId));
  const myRole = memberRows.find((m) => m.id === userId)?.role ?? 'member';

  const questionSuggestionRows = await db
    .select({ id: suggestedQuestions.id, promptText: suggestedQuestions.promptText, authorName: users.name })
    .from(suggestedQuestions)
    .innerJoin(users, eq(users.id, suggestedQuestions.userId))
    .where(and(eq(suggestedQuestions.groupId, cycle.groupId), isNull(suggestedQuestions.usedInCycleId)));

  const response: CycleDetailResponse = {
    cycle: {
      ...cycle,
      opensAt: cycle.opensAt.toISOString(),
      deadlineAt: cycle.deadlineAt.toISOString(),
    },
    groupName: group?.name ?? '',
    questions: cycleQuestions,
    myAnswers,
    myLinks,
    myMedia,
    meetupSuggestions: suggestionRows,
    members: memberRows,
    myRole,
    questionSuggestions: questionSuggestionRows,
  };

  return c.json(response);
});

cyclesRoute.post('/answers', zValidator('json', submitAnswerInput), async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');
  const { cycleId, questionId, bodyText, linkUrl } = c.req.valid('json');

  const [cycle] = await db.select().from(cycles).where(eq(cycles.id, cycleId)).limit(1);
  if (!cycle) return c.json({ error: 'Cycle not found' }, 404);

  try {
    await assertGroupMember(db, cycle.groupId, userId);
  } catch {
    return c.json({ error: 'Not a member of this group' }, 403);
  }

  await db
    .insert(answers)
    .values({ cycleId, questionId, userId, bodyText, linkUrl })
    .onConflictDoUpdate({
      target: [answers.cycleId, answers.userId, answers.questionId],
      set: { bodyText, linkUrl, updatedAt: new Date() },
    });

  return c.json({ ok: true });
});

cyclesRoute.post(
  '/:id/meetup-suggestions',
  zValidator('json', submitMeetupSuggestionInput.omit({ cycleId: true })),
  async (c) => {
    const db = c.get('db');
    const userId = c.get('userId');
    const cycleId = c.req.param('id');
    const { bodyText } = c.req.valid('json');

    const [cycle] = await db.select().from(cycles).where(eq(cycles.id, cycleId)).limit(1);
    if (!cycle) return c.json({ error: 'Cycle not found' }, 404);

    try {
      await assertGroupMember(db, cycle.groupId, userId);
    } catch {
      return c.json({ error: 'Not a member of this group' }, 403);
    }

    const [suggestion] = await db
      .insert(meetupSuggestions)
      .values({ cycleId, userId, bodyText })
      .returning();

    return c.json({ suggestion }, 201);
  },
);

cyclesRoute.post(
  '/:id/question-suggestions',
  zValidator('json', submitQuestionSuggestionInput),
  async (c) => {
    const db = c.get('db');
    const userId = c.get('userId');
    const cycleId = c.req.param('id');
    const { promptText } = c.req.valid('json');

    const [cycle] = await db.select().from(cycles).where(eq(cycles.id, cycleId)).limit(1);
    if (!cycle) return c.json({ error: 'Cycle not found' }, 404);

    try {
      await assertGroupMember(db, cycle.groupId, userId);
    } catch {
      return c.json({ error: 'Not a member of this group' }, 403);
    }

    // Scoped by groupId, not cycleId — it's a pitch for a future month, not
    // this one (see jobs/open-cycles.ts for where it actually gets used).
    const [suggestion] = await db
      .insert(suggestedQuestions)
      .values({ groupId: cycle.groupId, userId, promptText })
      .returning();

    return c.json({ suggestion }, 201);
  },
);

// Manual trigger for now — the real product flow is the deadline-day cron
// job (still TODO), but this lets a group member compile + send on demand,
// which also happens to be exactly what's needed to test the pipeline.
cyclesRoute.post('/:id/send-newsletter', async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');
  const cycleId = c.req.param('id');

  const [cycle] = await db.select().from(cycles).where(eq(cycles.id, cycleId)).limit(1);
  if (!cycle) return c.json({ error: 'Cycle not found' }, 404);

  try {
    await assertGroupMember(db, cycle.groupId, userId);
  } catch {
    return c.json({ error: 'Not a member of this group' }, 403);
  }

  try {
    const result = await sendNewsletterForCycle(db, c.env, cycleId);
    return c.json(result);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to send newsletter' }, 500);
  }
});
