import { NextResponse } from 'next/server';

export function getBackendBaseUrl() {
  const base =
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_SIGNALING_SERVER ||
    'http://localhost:3002';
  return base.replace(/\/+$/, '');
}

export async function proxyResponse(url: string, init?: RequestInit) {
  try {
    const res = await fetch(url, {
      ...init,
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
    console.error('[api proxy] Proxy error:', error);
    return NextResponse.json(
      { error: 'Backend server is unavailable. Is it running on port 3002?' },
      { status: 502 }
    );
  }
}
