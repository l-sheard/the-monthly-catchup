import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { and, eq, inArray, desc } from 'drizzle-orm';
import { createGroupInput, joinGroupInput } from '@stay-in-touch/shared/validators';
import { groups, groupMembers, cycles, newsletters, users, answers } from '@stay-in-touch/shared/schema';
import type { GroupMemberView } from '@stay-in-touch/shared';
import { requireAuth } from '../middleware/auth';
import { assertGroupMember } from '../lib/authz';
import { signMediaUrl } from '../lib/media-signing';
import type { Bindings, Variables } from '../types';

export const groupsRoute = new Hono<{ Bindings: Bindings; Variables: Variables }>();

groupsRoute.use('*', requireAuth);

groupsRoute.get('/', async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');

  const myGroups = await db
    .select({ id: groups.id, name: groups.name, inviteCode: groups.inviteCode })
    .from(groups)
    .innerJoin(groupMembers, eq(groupMembers.groupId, groups.id))
    .where(eq(groupMembers.userId, userId));

  if (myGroups.length === 0) {
    return c.json({ groups: [] });
  }

  // The newest cycle per group, regardless of status — not filtered to
  // status === 'open'. Whether a member can still get in and edit is a
  // function of the deadline, not this status flag: status only flips to
  // 'sent' once someone (today: the manual "send newsletter now" test
  // trigger; eventually: the deadline-day cron) actually sends it, and that
  // can happen well before the real deadline while people are still meant
  // to be able to answer/revise. Gating on status alone would lock everyone
  // out the moment anyone previews the email.
  const allCycles = await db
    .select()
    .from(cycles)
    .where(
      inArray(
        cycles.groupId,
        myGroups.map((g) => g.id),
      ),
    )
    .orderBy(desc(cycles.year), desc(cycles.month));

  const cycleByGroupId = new Map<string, (typeof allCycles)[number]>();
  for (const cycle of allCycles) {
    if (!cycleByGroupId.has(cycle.groupId)) cycleByGroupId.set(cycle.groupId, cycle);
  }

  // One query for every member of every group the caller is in, rather than
  // one query per group — same batching approach as the cycle lookup above.
  const memberRows = await db
    .select({ groupId: groupMembers.groupId, id: users.id, name: users.name, role: groupMembers.role })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(
      inArray(
        groupMembers.groupId,
        myGroups.map((g) => g.id),
      ),
    );

  const membersByGroupId = new Map<string, GroupMemberView[]>();
  for (const row of memberRows) {
    if (!membersByGroupId.has(row.groupId)) membersByGroupId.set(row.groupId, []);
    membersByGroupId.get(row.groupId)!.push({ id: row.id, name: row.name, role: row.role });
  }

  // Whether the caller has answered anything yet in each group's current
  // cycle — the home screen uses this to distinguish "still needs
  // answering" from "already filled out, waiting on the newsletter" rather
  // than just going by the cycle's status (which only flips once *someone*
  // sends it, not once *this* member has answered).
  const currentCycleIds = allCycles
    .filter((c) => cycleByGroupId.get(c.groupId)?.id === c.id)
    .map((c) => c.id);
  const answeredCycleIds =
    currentCycleIds.length === 0
      ? new Set<string>()
      : new Set(
          (
            await db
              .selectDistinct({ cycleId: answers.cycleId })
              .from(answers)
              .where(and(eq(answers.userId, userId), inArray(answers.cycleId, currentCycleIds)))
          ).map((row) => row.cycleId),
        );

  return c.json({
    groups: myGroups.map((group) => {
      const currentCycle = cycleByGroupId.get(group.id) ?? null;
      return {
        ...group,
        currentCycle,
        members: membersByGroupId.get(group.id) ?? [],
        hasAnswered: currentCycle ? answeredCycleIds.has(currentCycle.id) : false,
      };
    }),
  });
});

groupsRoute.post('/', zValidator('json', createGroupInput), async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');
  const { name } = c.req.valid('json');

  const inviteCode = crypto.randomUUID();

  const [group] = await db.insert(groups).values({ name, inviteCode, createdBy: userId }).returning();

  await db.insert(groupMembers).values({ groupId: group.id, userId, role: 'owner' });

  return c.json({ group }, 201);
});

groupsRoute.post('/join', zValidator('json', joinGroupInput), async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');
  const { inviteCode } = c.req.valid('json');

  const [group] = await db.select().from(groups).where(eq(groups.inviteCode, inviteCode)).limit(1);

  if (!group) {
    return c.json({ error: 'Invalid invite code' }, 404);
  }

  await db
    .insert(groupMembers)
    .values({ groupId: group.id, userId, role: 'member' })
    .onConflictDoNothing();

  return c.json({ group });
});

// Ordered by date (newest first) — each entry carries a pre-signed link to
// the compiled HTML, since viewing it means leaving the app's authenticated
// fetch context (Linking.openURL / a new browser tab), same as media
// embedded in the email itself.
groupsRoute.get('/:id/newsletters', async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');
  const groupId = c.req.param('id');

  try {
    await assertGroupMember(db, groupId, userId);
  } catch {
    return c.json({ error: 'Not a member of this group' }, 403);
  }

  const rows = await db
    .select({ id: newsletters.id, month: cycles.month, year: cycles.year, sentAt: newsletters.sentAt })
    .from(newsletters)
    .innerJoin(cycles, eq(cycles.id, newsletters.cycleId))
    .where(eq(cycles.groupId, groupId))
    .orderBy(desc(cycles.year), desc(cycles.month));

  const items = await Promise.all(
    rows.map(async (row) => {
      const { expires, sig } = await signMediaUrl(c.env.MEDIA_SIGNING_SECRET, row.id);
      return {
        id: row.id,
        month: row.month,
        year: row.year,
        sentAt: row.sentAt ? row.sentAt.toISOString() : null,
        viewUrl: `${c.env.API_BASE_URL}/newsletters/${row.id}/public?expires=${expires}&sig=${sig}`,
      };
    }),
  );

  return c.json({ newsletters: items });
});

groupsRoute.get('/:id', async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');
  const groupId = c.req.param('id');

  try {
    await assertGroupMember(db, groupId, userId);
  } catch {
    return c.json({ error: 'Not a member of this group' }, 403);
  }

  const [group] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);

  if (!group) {
    return c.json({ error: 'Group not found' }, 404);
  }

  return c.json({ group });
});
