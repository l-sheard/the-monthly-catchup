import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { and, eq } from 'drizzle-orm';
import { submitAnswerInput, submitMeetupSuggestionInput } from '@stay-in-touch/shared/validators';
import { answers, cycles, groups, meetupSuggestions, questions, users } from '@stay-in-touch/shared/schema';
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

  const cycleQuestions = await db
    .select()
    .from(questions)
    .where(eq(questions.isDefault, true))
    .orderBy(questions.sortOrder);

  const myAnswerRows = await db
    .select({ questionId: answers.questionId, bodyText: answers.bodyText })
    .from(answers)
    .where(and(eq(answers.cycleId, cycleId), eq(answers.userId, userId)));

  const myAnswers: Record<string, string> = {};
  for (const row of myAnswerRows) myAnswers[row.questionId] = row.bodyText ?? '';

  const suggestionRows = await db
    .select({ id: meetupSuggestions.id, bodyText: meetupSuggestions.bodyText, authorName: users.name })
    .from(meetupSuggestions)
    .innerJoin(users, eq(users.id, meetupSuggestions.userId))
    .where(eq(meetupSuggestions.cycleId, cycleId));

  const response: CycleDetailResponse = {
    cycle: {
      ...cycle,
      opensAt: cycle.opensAt.toISOString(),
      deadlineAt: cycle.deadlineAt.toISOString(),
    },
    groupName: group?.name ?? '',
    questions: cycleQuestions,
    myAnswers,
    meetupSuggestions: suggestionRows,
  };

  return c.json(response);
});

cyclesRoute.post('/answers', zValidator('json', submitAnswerInput), async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');
  const { cycleId, questionId, bodyText } = c.req.valid('json');

  const [cycle] = await db.select().from(cycles).where(eq(cycles.id, cycleId)).limit(1);
  if (!cycle) return c.json({ error: 'Cycle not found' }, 404);

  try {
    await assertGroupMember(db, cycle.groupId, userId);
  } catch {
    return c.json({ error: 'Not a member of this group' }, 403);
  }

  await db
    .insert(answers)
    .values({ cycleId, questionId, userId, bodyText })
    .onConflictDoUpdate({
      target: [answers.cycleId, answers.userId, answers.questionId],
      set: { bodyText, updatedAt: new Date() },
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
    const result = await sendNewsletterForCycle(db, c.env.RESEND_API_KEY, cycleId);
    return c.json(result);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to send newsletter' }, 500);
  }
});
