import { Hono } from 'hono';
import { verifyWebhook } from '@clerk/backend/webhooks';
import { eq } from 'drizzle-orm';
import { users } from '@stay-in-touch/shared/schema';
import { createDb } from '../db';
import type { Bindings } from '../types';

export const webhooksRoute = new Hono<{ Bindings: Bindings }>();

// Deliberately not behind requireAuth — Clerk can't attach a Bearer token
// to a webhook call, and verifyWebhook checks the Svix signature (via
// CLERK_WEBHOOK_SIGNING_SECRET) instead. Same reason this doesn't pull `db`
// off the Hono context the way authenticated routes do (requireAuth is
// what sets it) — it makes its own connection, like the scheduled handler
// in index.ts does.
webhooksRoute.post('/clerk', async (c) => {
  let event;
  try {
    event = await verifyWebhook(c.req.raw, { signingSecret: c.env.CLERK_WEBHOOK_SIGNING_SECRET });
  } catch (err) {
    console.error('Clerk webhook verification failed:', err);
    return c.text('Verification failed', 400);
  }

  // The only event we act on today: someone deleted their account (from
  // this app's own Account screen, or directly in the Clerk dashboard) —
  // clean up our own users row so it doesn't linger with a clerk_id that
  // no longer resolves to anyone. Cascades to group_members/answers/media/
  // meetup_suggestions/suggested_questions rows FK'd to this user;
  // groups.created_by is set null instead (see schema.ts) so a deleted
  // owner's groups survive intact for the remaining members.
  if (event.type === 'user.deleted' && event.data.id) {
    const db = createDb(c.env.DATABASE_URL);
    await db.delete(users).where(eq(users.clerkId, event.data.id));
  }

  // Always 200 once verified, even for event types we don't handle —
  // anything else tells Svix to keep retrying an event we were never going
  // to act on.
  return c.text('OK', 200);
});
