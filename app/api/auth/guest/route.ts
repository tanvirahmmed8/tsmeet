import { NextRequest, NextResponse } from 'next/server';
import { getBackendBaseUrl } from '@/app/api/_proxy';

export async function POST(request: NextRequest) {
  try {
    const response = await fetch(`${getBackendBaseUrl()}/api/auth/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: await request.text(),
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
