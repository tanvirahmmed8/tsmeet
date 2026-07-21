import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const session = request.cookies.get('tsmeet_session')?.value;
  if (!session || !request.nextUrl.pathname.startsWith('/api/')) return NextResponse.next();
  const headers = new Headers(request.headers);
  headers.set('authorization', `Bearer ${session}`);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ['/api/:path*'] };
