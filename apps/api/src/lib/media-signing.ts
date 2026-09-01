// Self-issued signed URLs for embedding media in emails, where nothing can
// send an Authorization header. Not R2's native S3-compatible presigning
// (that needs an R2 API token with S3 access, set up separately in the
// Cloudflare dashboard) — this is a lighter HMAC we control entirely,
// verified in the public route below. The bucket itself stays private;
// possessing a valid, unexpired signature is what stands in for auth here.

async function hmacKey(secret: string) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

function toBase64Url(bytes: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** expiresInSeconds counted from now — newsletters double as an archive, so this defaults generously. */
export async function signMediaUrl(secret: string, mediaId: string, expiresInSeconds = 60 * 60 * 24 * 90) {
  const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const key = await hmacKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${mediaId}:${expires}`));
  return { expires, sig: toBase64Url(signature) };
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyMediaUrl(secret: string, mediaId: string, expires: number, sig: string) {
  if (Date.now() / 1000 > expires) return false;
  const key = await hmacKey(secret);
  const expected = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${mediaId}:${expires}`));
  return timingSafeEqual(toBase64Url(expected), sig);
}
