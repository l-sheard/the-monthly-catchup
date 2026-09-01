import { describe, it, expect } from 'vitest';
import { signMediaUrl, verifyMediaUrl } from './media-signing';

const SECRET = 'test-secret';
const MEDIA_ID = '123e4567-e89b-12d3-a456-426614174000';

describe('media-signing', () => {
  it('verifies a signature it just issued', async () => {
    const { expires, sig } = await signMediaUrl(SECRET, MEDIA_ID);
    expect(await verifyMediaUrl(SECRET, MEDIA_ID, expires, sig)).toBe(true);
  });

  it('rejects a tampered media id', async () => {
    const { expires, sig } = await signMediaUrl(SECRET, MEDIA_ID);
    expect(await verifyMediaUrl(SECRET, 'a-different-id', expires, sig)).toBe(false);
  });

  it('rejects a tampered signature', async () => {
    const { expires, sig } = await signMediaUrl(SECRET, MEDIA_ID);
    const tampered = sig.slice(0, -1) + (sig.at(-1) === 'a' ? 'b' : 'a');
    expect(await verifyMediaUrl(SECRET, MEDIA_ID, expires, tampered)).toBe(false);
  });

  it('rejects an expired signature', async () => {
    const { sig } = await signMediaUrl(SECRET, MEDIA_ID);
    const alreadyExpired = Math.floor(Date.now() / 1000) - 10;
    expect(await verifyMediaUrl(SECRET, MEDIA_ID, alreadyExpired, sig)).toBe(false);
  });

  it('rejects a signature issued with a different secret', async () => {
    const { expires, sig } = await signMediaUrl('other-secret', MEDIA_ID);
    expect(await verifyMediaUrl(SECRET, MEDIA_ID, expires, sig)).toBe(false);
  });
});
