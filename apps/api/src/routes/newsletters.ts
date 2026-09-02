import { Hono } from 'hono';
import { desc, eq } from 'drizzle-orm';
import { cycles, groupMembers, groups, newsletters, users } from '@stay-in-touch/shared/schema';
import { createDb } from '../db';
import { requireAuth } from '../middleware/auth';
import { signMediaUrl, verifyMediaUrl } from '../lib/media-signing';
import type { Bindings, Variables } from '../types';

export const newslettersRoute = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Deliberately NOT behind requireAuth, same reasoning as media.ts's
// /:id/public: this is meant to be opened via a plain URL (Linking.openURL
// from the mobile app, or a new browser tab), which can't attach an
// Authorization header. A valid, unexpired HMAC signature (see
// lib/media-signing.ts — reused as-is here; the signed payload is just
// `id:expires`, nothing media-specific about it) stands in for the Bearer
// token. The list endpoint that hands out these signed links (GET
// /groups/:id/newsletters) still requires auth + group membership.
newslettersRoute.get('/:id/public', async (c) => {
  const newsletterId = c.req.param('id');
  const expires = Number(c.req.query('expires'));
  const sig = c.req.query('sig');

  if (!sig || !expires || !(await verifyMediaUrl(c.env.MEDIA_SIGNING_SECRET, newsletterId, expires, sig))) {
    return c.json({ error: 'Invalid or expired link' }, 403);
  }

  const db = createDb(c.env.DATABASE_URL);
  const [row] = await db
    .select({ compiledHtml: newsletters.compiledHtml })
    .from(newsletters)
    .where(eq(newsletters.id, newsletterId))
    .limit(1);

  if (!row) return c.json({ error: 'Not found' }, 404);

  return c.html(row.compiledHtml);
});

// Everything below IS behind auth (per-route, not the whole router — the
// /:id/public route above has to stay open). Aggregates newsletters across
// every group the caller is in, for the top bar's inbox icon.
newslettersRoute.get('/inbox', requireAuth, async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');

  const rows = await db
    .select({
      id: newsletters.id,
      month: cycles.month,
      year: cycles.year,
      sentAt: newsletters.sentAt,
      groupId: groups.id,
      groupName: groups.name,
    })
    .from(newsletters)
    .innerJoin(cycles, eq(cycles.id, newsletters.cycleId))
    .innerJoin(groups, eq(groups.id, cycles.groupId))
    .innerJoin(groupMembers, eq(groupMembers.groupId, groups.id))
    .where(eq(groupMembers.userId, userId))
    .orderBy(desc(newsletters.sentAt));

  const [me] = await db
    .select({ lastNewsletterCheckAt: users.lastNewsletterCheckAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const lastCheck = me?.lastNewsletterCheckAt ?? null;
  const hasUnread = rows.some((row) => row.sentAt && (!lastCheck || row.sentAt > lastCheck));

  const items = await Promise.all(
    rows.map(async (row) => {
      const { expires, sig } = await signMediaUrl(c.env.MEDIA_SIGNING_SECRET, row.id);
      return {
        id: row.id,
        groupId: row.groupId,
        groupName: row.groupName,
        month: row.month,
        year: row.year,
        sentAt: row.sentAt ? row.sentAt.toISOString() : null,
        viewUrl: `${c.env.API_BASE_URL}/newsletters/${row.id}/public?expires=${expires}&sig=${sig}`,
      };
    }),
  );

  return c.json({ hasUnread, newsletters: items });
});

// Called when the inbox screen is opened — clears the unread dot for
// everything sent up to now. Deliberately a separate call from GET /inbox
// rather than a side effect of it, so just fetching the unread state (e.g.
// for the top bar's dot) doesn't itself mark things read.
newslettersRoute.post('/inbox/mark-read', requireAuth, async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');

  await db.update(users).set({ lastNewsletterCheckAt: new Date() }).where(eq(users.id, userId));

  return c.json({ ok: true });
});
