import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { newsletters } from '@stay-in-touch/shared/schema';
import { createDb } from '../db';
import { verifyMediaUrl } from '../lib/media-signing';
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
