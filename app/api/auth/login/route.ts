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
    return NextResponse.json(data ?? { error: 'Unexpected backend response' }, { status: res.status });
  } catch (error) {
    console.error('Login proxy error:', error);
    return NextResponse.json(
      { error: 'Backend server is unavailable. Is it running on port 3002?' },
      { status: 502 }
    );
  }
}
