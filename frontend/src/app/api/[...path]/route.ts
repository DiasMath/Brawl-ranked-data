import type { NextRequest } from 'next/server';
import { privateAccess } from '@/lib/access';

export const runtime = 'nodejs';
export const maxDuration = 60;

const routes = new Set(['GET /api/collection/status', 'GET /api/collection/history', 'POST /api/sync']);
const headers = { 'Cache-Control': 'private, no-store' };

async function forward(request: NextRequest) {
  const denied = privateAccess(request);
  if (denied) return denied;

  const path = request.nextUrl.pathname;
  if (!routes.has(request.method + ' ' + path)) {
    return Response.json({ detail: 'Rota indisponível.' }, { status: 404, headers });
  }
  if (request.method === 'POST') {
    const site = request.headers.get('sec-fetch-site');
    try {
      const origin = new URL(request.headers.get('origin') ?? '');
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
      const schemeAllowed = origin.protocol === 'https:' || (local && origin.protocol === 'http:');
      if (!schemeAllowed || origin.host !== request.headers.get('host') || (site && site !== 'same-origin')) {
        throw new Error('Origem diferente.');
      }
    } catch {
      return Response.json({ detail: 'Origem não autorizada.' }, { status: 403, headers });
    }
  }

  const base = process.env.BRAWL_BACKEND_URL?.trim();
  const secret = process.env.BRAWL_SERVICE_TOKEN?.trim();
  if (!base || !secret || secret.length < 32) {
    return Response.json({ detail: 'Configure a conexão privada com o Render na Vercel.' }, { status: 503, headers });
  }

  try {
    const target = new URL(path, base);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname);
    if (target.protocol !== 'https:' && !(local && target.protocol === 'http:')) throw new Error('Origem inválida.');
    if (path === '/api/collection/history') {
      const after = request.nextUrl.searchParams.get('after') ?? '0';
      if (!/^\d{1,15}$/.test(after)) return Response.json({ detail: 'Cursor inválido.' }, { status: 400, headers });
      target.searchParams.set('after', after);
    }
    const upstream = await fetch(target, {
      method: request.method,
      headers: { Authorization: 'Bearer ' + secret, 'Content-Type': 'application/json' },
      body: request.method === 'POST' ? '{}' : undefined,
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(50000),
    });
    if (upstream.status === 401) {
      return Response.json({ detail: 'Os tokens de serviço da Vercel e do Render precisam coincidir.' }, { status: 502, headers });
    }
    if (!upstream.headers.get('content-type')?.includes('application/json')) throw new Error('Resposta inválida.');
    const output = new Headers(headers);
    output.set('Content-Type', 'application/json');
    const retry = upstream.headers.get('retry-after');
    if (retry) output.set('Retry-After', retry);
    return new Response(upstream.body, { status: upstream.status, headers: output });
  } catch {
    return Response.json({ detail: 'O Render está iniciando ou temporariamente indisponível.' }, { status: 502, headers });
  }
}

export { forward as GET, forward as POST };
