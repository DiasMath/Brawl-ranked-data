import { createHash, timingSafeEqual } from 'node:crypto';

const privateHeaders = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' };

export function privateAccess(request: Request): Response | null {
  const user = process.env.BRAWL_SITE_USER?.trim();
  const password = process.env.BRAWL_SITE_PASSWORD;
  if (!user || !password || password.length < 24) {
    return new Response('Configure o acesso privado do Brawl Ranked Lab.', { status: 503, headers: privateHeaders });
  }
  const expected = 'Basic ' + Buffer.from(user + ':' + password, 'utf8').toString('base64');
  const digest = (value: string) => createHash('sha256').update(value).digest();
  if (timingSafeEqual(digest(request.headers.get('authorization') ?? ''), digest(expected))) return null;

  return new Response('Acesso privado.', {
    status: 401,
    headers: { ...privateHeaders, 'WWW-Authenticate': 'Basic realm="Brawl Ranked Lab", charset="UTF-8"' },
  });
}
