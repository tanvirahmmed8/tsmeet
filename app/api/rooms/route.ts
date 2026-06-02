import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function getBackendBaseUrl() {
  const base =
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_SIGNALING_SERVER ||
    'http://localhost:3002';
  return base.replace(/\/+$/, '');
}

async function proxyJson(request: NextRequest, url: string, init?: RequestInit) {
  try {
    const res = await fetch(url, {
      ...init,
      // Avoid Next caching responses for auth-protected data.
      cache: 'no-store',
    });

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    }

    const text = await res.text();
    return new NextResponse(text, { status: res.status });
  } catch (error) {
    console.error('[api/rooms] Proxy error:', error);
    return NextResponse.json(
      { error: 'Backend server is unavailable. Is it running on port 3002?' },
      { status: 502 }
    );
  }
}

export async function GET(request: NextRequest) {
  const backend = getBackendBaseUrl();
  const auth = request.headers.get('authorization') || '';

  // The backend exposes the room list at /api/rooms/user/rooms.
  return proxyJson(request, `${backend}/api/rooms/user/rooms`, {
    method: 'GET',
    headers: {
      ...(auth ? { Authorization: auth } : {}),
    },
  });
}

export async function POST(request: NextRequest) {
  const backend = getBackendBaseUrl();
  const auth = request.headers.get('authorization') || '';

  const body = await request.text();
  return proxyJson(request, `${backend}/api/rooms`, {
    method: 'POST',
    headers: {
      'Content-Type': request.headers.get('content-type') || 'application/json',
      ...(auth ? { Authorization: auth } : {}),
    },
    body,
  });
}
