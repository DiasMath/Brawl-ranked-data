import type { NextRequest } from 'next/server';
import { privateAccess } from '@/lib/access';

export const runtime = 'nodejs';
export const maxDuration = 60;

const routes = new Set([
  'GET /api/accounts', 'POST /api/accounts', 'GET /api/collection/status',
  'GET /api/collection/history', 'POST /api/sync',
  'GET /api/supercell/credential', 'POST /api/supercell/credential',
  'GET /api/meta/sample', 'POST /api/meta/sample',
  'GET /api/meta/external', 'POST /api/meta/external',
]);
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
    return Response.json({ detail: 'Configure a URL do backend e o token de serviço no Next.js.' }, { status: 503, headers });
  }

  const credential = path === '/api/supercell/credential';
  const metaSample = path === '/api/meta/sample';
  const externalMeta = path === '/api/meta/external';
  let body: string | undefined;
  if (request.method === 'POST') {
    if (!request.headers.get('content-type')?.includes('application/json')) {
      return Response.json({ detail: 'Envie dados em JSON.' }, { status: 415, headers });
    }
    body = path === '/api/accounts' || credential || metaSample || externalMeta ? await request.text() : '{}';
    if (body.length > (credential ? 8192 : 2048)) {
      return Response.json({ detail: 'Dados muito extensos.' }, { status: 413, headers });
    }
  }

  try {
    const target = new URL(path, base);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname);
    if (target.protocol !== 'https:' && !(local && target.protocol === 'http:')) throw new Error('Origem inválida.');
    if (path !== '/api/accounts' && !credential && !metaSample && !externalMeta) {
      const tag = request.nextUrl.searchParams.get('tag');
      if (tag !== null) {
        if (!/^#?[0289PYLQGRJCUV]{3,16}$/i.test(tag)) return Response.json({ detail: 'Tag inválida.' }, { status: 400, headers });
        target.searchParams.set('tag', tag);
      }
    }
    if (externalMeta && request.method === 'GET') {
      const map = request.nextUrl.searchParams.get('map') ?? '';
      if (map.length > 100) return Response.json({ detail: 'Mapa inválido.' }, { status: 400, headers });
      if (map) target.searchParams.set('map', map);
      const patch = request.nextUrl.searchParams.get('patch');
      if (patch !== null) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(patch)) return Response.json({ detail: 'Patch inválido.' }, { status: 400, headers });
        target.searchParams.set('patch', patch);
      }
    }
    if (path === '/api/collection/history') {
      const after = request.nextUrl.searchParams.get('after') ?? '0';
      if (!/^\d{1,15}$/.test(after)) return Response.json({ detail: 'Cursor inválido.' }, { status: 400, headers });
      target.searchParams.set('after', after);
    }
    const upstream = await fetch(target, {
      method: request.method,
      headers: { Authorization: 'Bearer ' + secret, 'Content-Type': 'application/json' },
      body,
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(50000),
    });
    if (upstream.status === 401) {
      return Response.json({ detail: 'Use o mesmo BRAWL_SERVICE_TOKEN no Next.js e no FastAPI.' }, { status: 502, headers });
    }
    if (!upstream.headers.get('content-type')?.includes('application/json')) throw new Error('Resposta inválida.');
    const output = new Headers(headers);
    output.set('Content-Type', 'application/json');
    const retry = upstream.headers.get('retry-after');
    if (retry) output.set('Retry-After', retry);
    return new Response(upstream.body, { status: upstream.status, headers: output });
  } catch {
    return Response.json({ detail: 'O backend está iniciando ou temporariamente indisponível.' }, { status: 502, headers });
  }
}

export { forward as GET, forward as POST };
