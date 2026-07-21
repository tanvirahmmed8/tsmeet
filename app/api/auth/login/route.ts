import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function getBackendBaseUrl() {
  const base =
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_SIGNALING_SERVER ||
    'http://localhost:3002';
  return base.replace(/\/+$/, '');
}

export async function POST(request: NextRequest) {
  try {
    const backend = getBackendBaseUrl();
    const payload = await request.text();

    const res = await fetch(`${backend}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': request.headers.get('content-type') || 'application/json',
      },
      body: payload,
      cache: 'no-store',
    });

    const data = await res.json().catch(() => null);
    const responseData = data && typeof data === 'object' ? { ...data } : data;
    const sessionToken = responseData?.token;
    if (responseData && 'token' in responseData) delete responseData.token;
    const response = NextResponse.json(responseData ?? { error: 'Unexpected backend response' }, { status: res.status });
    if (res.ok && sessionToken) {
      response.cookies.set('tsmeet_session', sessionToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 7 * 24 * 60 * 60,
      });
    }
    return response;
  } catch (error) {
    console.error('Login proxy error:', error);
    return NextResponse.json(
      { error: 'Backend server is unavailable. Is it running on port 3002?' },
      { status: 502 }
    );
  }
}
