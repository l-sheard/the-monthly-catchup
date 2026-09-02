import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createDb } from './db';
import { openCyclesForToday } from './jobs/open-cycles';
import { sendNewslettersPastDeadline } from './jobs/send-newsletters';
import { cyclesRoute } from './routes/cycles';
import { groupsRoute } from './routes/groups';
import { mediaRoute } from './routes/media';
import { newslettersRoute } from './routes/newsletters';
import { webhooksRoute } from './routes/webhooks';
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
app.route('/cycles', cyclesRoute);
app.route('/media', mediaRoute);
app.route('/newsletters', newslettersRoute);
app.route('/webhooks', webhooksRoute);

export default {
  fetch: app.fetch,

  async scheduled(_event: ScheduledController, env: Bindings) {
    const db = createDb(env.DATABASE_URL);

    const openResult = await openCyclesForToday(db, env);
    console.log('openCyclesForToday:', JSON.stringify(openResult));

    const sendResult = await sendNewslettersPastDeadline(db, env);
    console.log('sendNewslettersPastDeadline:', JSON.stringify(sendResult));
  },
};
