import { Hono } from 'hono';
import { groupsRoute } from './routes/groups';
import type { Bindings, Variables } from './types';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.get('/health', (c) => c.json({ ok: true }));

app.route('/groups', groupsRoute);

export default app;
