import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createDb } from './db';
import { openCyclesForToday } from './jobs/open-cycles';
import { groupsRoute } from './routes/groups';
import type { Bindings, Variables } from './types';

export const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Wildcard is safe here — auth is a Bearer token our own client code attaches
// explicitly, not an ambient credential (cookie) a third-party page could
// piggyback on. Once there's a real web deploy this can narrow to specific
// origins if desired, but it isn't a security requirement for this scheme.
app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  }),
);

app.get('/health', (c) => c.json({ ok: true }));

app.route('/groups', groupsRoute);

export default {
  fetch: app.fetch,

  async scheduled(_event: ScheduledController, env: Bindings) {
    const db = createDb(env.DATABASE_URL);
    const result = await openCyclesForToday(db);
    console.log('openCyclesForToday:', JSON.stringify(result));

    // TODO: deadline reminder emails (needs a reminder-sent flag on cycles)
    // TODO: compile + send the newsletter when a cycle's deadline passes
  },
};
