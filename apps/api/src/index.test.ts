import { describe, it, expect } from 'vitest';
import { app } from './index';

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe('POST /groups', () => {
  it('rejects requests with no Authorization header', async () => {
    const res = await app.request('/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'The Book Club' }),
    });
    expect(res.status).toBe(401);
  });
});
