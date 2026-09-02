import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import { answers, cycles, media as mediaTable } from '@stay-in-touch/shared/schema';
import { MEDIA_LIMITS } from '@stay-in-touch/shared/validators';
import { requireAuth } from '../middleware/auth';
import { createDb } from '../db';
import { assertGroupMember } from '../lib/authz';
import { assertUnderMediaQuota, assertUnderStorageBudget } from '../lib/media-quota';
import { verifyMediaUrl } from '../lib/media-signing';
import type { Bindings, Variables } from '../types';

export const mediaRoute = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Uploads go straight through the Worker to R2 (not a presigned URL) — files
// are capped at 8MB, well within what a Worker can comfortably handle, and
// this way every upload is validated (size, quota, membership) before a
// single byte is written to storage, not just before the DB row is created.
mediaRoute.post('/cycles/:cycleId/questions/:questionId', requireAuth, async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');
  const cycleId = c.req.param('cycleId');
  const questionId = c.req.param('questionId');

  const [cycle] = await db.select().from(cycles).where(eq(cycles.id, cycleId)).limit(1);
  if (!cycle) return c.json({ error: 'Cycle not found' }, 404);

  try {
    await assertGroupMember(db, cycle.groupId, userId);
  } catch {
    return c.json({ error: 'Not a member of this group' }, 403);
  }

  const body = await c.req.parseBody();
  const file = body['file'];
  const kind = body['kind'];
  const durationSecondsRaw = body['durationSeconds'];

  if (!(file instanceof File)) return c.json({ error: 'Missing file' }, 400);
  if (kind !== 'photo' && kind !== 'audio') return c.json({ error: 'kind must be photo or audio' }, 400);

  const sizeBytes = file.size;
  const limits = MEDIA_LIMITS[kind];
  if (sizeBytes > limits.maxSizeBytes) {
    return c.json(
      { error: `File too large — max ${Math.round(limits.maxSizeBytes / (1024 * 1024))}MB` },
      400,
    );
  }

  try {
    await assertUnderMediaQuota(db, cycleId, userId, kind);
    await assertUnderStorageBudget(db, sizeBytes);
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Quota exceeded';
    const message =
      reason === 'MEDIA_QUOTA_EXCEEDED'
        ? `You've already hit the ${limits.maxPerCycle} ${kind} limit for this month`
        : "This group's storage is full for now — ask about upgrading the R2 plan";
    return c.json({ error: message }, 429);
  }

  // Find or create the answer this media attaches to — a photo/voice
  // question might have no typed answer at all, just the attachment.
  const [existingAnswer] = await db
    .select()
    .from(answers)
    .where(and(eq(answers.cycleId, cycleId), eq(answers.userId, userId), eq(answers.questionId, questionId)))
    .limit(1);

  const answerId =
    existingAnswer?.id ??
    (
      await db
        .insert(answers)
        .values({ cycleId, userId, questionId, bodyText: '' })
        .returning({ id: answers.id })
    )[0].id;

  const contentType = file.type || (kind === 'photo' ? 'image/jpeg' : 'audio/m4a');
  const storagePath = `media/${answerId}/${crypto.randomUUID()}`;
  await c.env.MEDIA_BUCKET.put(storagePath, await file.arrayBuffer(), {
    httpMetadata: { contentType },
  });

  const durationSeconds = durationSecondsRaw ? Number(durationSecondsRaw) : null;

  const [mediaRow] = await db
    .insert(mediaTable)
    .values({ answerId, kind, storagePath, sizeBytes, durationSeconds })
    .returning();

  return c.json({ media: mediaRow }, 201);
});

// Authenticated read — the bucket itself is private, so this is the only
// way to fetch a file back, gated by the same group-membership check as
// everything else. Not reachable from a plain <img src> (no way to attach
// an Authorization header there); in-app viewing fetches this and renders
// the response as a blob instead.
mediaRoute.get('/:id', requireAuth, async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');
  const mediaId = c.req.param('id');

  const [row] = await db
    .select({
      storagePath: mediaTable.storagePath,
      groupId: cycles.groupId,
    })
    .from(mediaTable)
    .innerJoin(answers, eq(mediaTable.answerId, answers.id))
    .innerJoin(cycles, eq(answers.cycleId, cycles.id))
    .where(eq(mediaTable.id, mediaId))
    .limit(1);

  if (!row) return c.json({ error: 'Not found' }, 404);

  try {
    await assertGroupMember(db, row.groupId, userId);
  } catch {
    return c.json({ error: 'Not a member of this group' }, 403);
  }

  const object = await c.env.MEDIA_BUCKET.get(row.storagePath);
  if (!object) return c.json({ error: 'File missing from storage' }, 404);

  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream',
      'Cache-Control': 'private, max-age=3600',
    },
  });
});

// Lets a member remove their own attachment (e.g. to re-record a voice note
// or swap a photo) so they aren't stuck once a per-cycle quota is hit.
// Ownership is checked against the answer's userId, not just group
// membership — assertGroupMember alone would let any group member delete
// anyone else's media.
mediaRoute.delete('/:id', requireAuth, async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');
  const mediaId = c.req.param('id');

  const [row] = await db
    .select({
      storagePath: mediaTable.storagePath,
      groupId: cycles.groupId,
      ownerId: answers.userId,
    })
    .from(mediaTable)
    .innerJoin(answers, eq(mediaTable.answerId, answers.id))
    .innerJoin(cycles, eq(answers.cycleId, cycles.id))
    .where(eq(mediaTable.id, mediaId))
    .limit(1);

  if (!row) return c.json({ error: 'Not found' }, 404);

  try {
    await assertGroupMember(db, row.groupId, userId);
  } catch {
    return c.json({ error: 'Not a member of this group' }, 403);
  }

  if (row.ownerId !== userId) {
    return c.json({ error: 'You can only remove your own media' }, 403);
  }

  await c.env.MEDIA_BUCKET.delete(row.storagePath);
  await db.delete(mediaTable).where(eq(mediaTable.id, mediaId));

  return c.json({ ok: true });
});

// Deliberately NOT behind requireAuth — this is what makes embedding media in
// an email possible at all, since a mail client can't attach an Authorization
// header. Possession of a valid, unexpired HMAC signature (see
// lib/media-signing.ts) stands in for the Bearer token here; the bucket
// itself is still private, nothing is reachable without one.
mediaRoute.get('/:id/public', async (c) => {
  const mediaId = c.req.param('id');
  const expires = Number(c.req.query('expires'));
  const sig = c.req.query('sig');

  if (!sig || !expires || !(await verifyMediaUrl(c.env.MEDIA_SIGNING_SECRET, mediaId, expires, sig))) {
    return c.json({ error: 'Invalid or expired link' }, 403);
  }

  const db = createDb(c.env.DATABASE_URL);
  const [row] = await db
    .select({ storagePath: mediaTable.storagePath })
    .from(mediaTable)
    .where(eq(mediaTable.id, mediaId))
    .limit(1);
  if (!row) return c.json({ error: 'Not found' }, 404);

  const object = await c.env.MEDIA_BUCKET.get(row.storagePath);
  if (!object) return c.json({ error: 'File missing from storage' }, 404);

  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream',
      // Fine to cache publicly — the URL itself is the credential, and it's
      // already time-limited by the signature.
      'Cache-Control': 'public, max-age=86400',
    },
  });
});
