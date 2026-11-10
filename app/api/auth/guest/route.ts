import { NextRequest, NextResponse } from 'next/server';
import { getBackendBaseUrl } from '../../_proxy';
import { verifySession } from '../_session';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // A stale/missing browser profile must not replace a valid account cookie
    // with a guest token. Verify on the backend; never decode/trust client JWTs.
    const payload = await request.text();
    let requestedRoom: unknown;
    try { requestedRoom = JSON.parse(payload)?.roomId; }
    catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
    const session = await verifySession(request);
    if (session.user && (!session.user.guest || session.user.roomId === requestedRoom)) {
      return NextResponse.json({ user: session.user }, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    if (session.status !== 200 && session.status !== 401 && session.status !== 403) {
      return NextResponse.json({ error: 'Unable to verify existing session. Please retry.' }, { status: 503 });
    }
    const response = await fetch(`${getBackendBaseUrl()}/api/auth/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({ error: 'Invalid server response' }));
    const sessionToken = data?.token;
    const responseData = data && typeof data === 'object' ? { ...data } : data;
    if (responseData && 'token' in responseData) delete responseData.token;
    const nextResponse = NextResponse.json(responseData, { status: response.status });

    if (response.ok && typeof sessionToken === 'string') {
      nextResponse.cookies.set('tsmeet_session', sessionToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 60 * 60 * 12,
      });
    }

    return nextResponse;
  } catch (error) {
    console.error('[api/auth/guest] Proxy error:', error);
    return NextResponse.json({ error: 'Backend server is unavailable' }, { status: 503 });
  }
}
