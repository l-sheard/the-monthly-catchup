import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq, inArray, desc } from 'drizzle-orm';
import { createGroupInput, joinGroupInput } from '@stay-in-touch/shared/validators';
import { groups, groupMembers, cycles } from '@stay-in-touch/shared/schema';
import { requireAuth } from '../middleware/auth';
import { assertGroupMember } from '../lib/authz';
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

  return c.json({
    groups: myGroups.map((group) => ({ ...group, currentCycle: cycleByGroupId.get(group.id) ?? null })),
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
