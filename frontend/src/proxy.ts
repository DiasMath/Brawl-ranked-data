import { NextResponse } from 'next/server';
import { privateAccess } from '@/lib/access';

export function proxy(request: Request) {
  return privateAccess(request) ?? NextResponse.next({
    headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' },
  });
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
