import { createClerkClient } from '@clerk/backend';
import { createMiddleware } from 'hono/factory';
import type { Bindings, Variables } from '../types';

export const requireAuth = createMiddleware<{ Bindings: Bindings; Variables: Variables }>(
  async (c, next) => {
    const authHeader = c.req.header('Authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return c.json({ error: 'Missing Authorization header' }, 401);
    }

    const clerk = createClerkClient({ secretKey: c.env.CLERK_SECRET_KEY });
    const result = await clerk.authenticateRequest(c.req.raw, {
      authorizedParties: [],
    });

    if (!result.isSignedIn) {
      return c.json({ error: 'Invalid or expired session' }, 401);
    }

    c.set('userId', result.toAuth().userId);
    await next();
  },
);
