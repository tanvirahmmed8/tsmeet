import { NextRequest, NextResponse } from 'next/server';
import { getBackendBaseUrl } from '../../_proxy';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const cookie = request.headers.get('cookie') || '';
    const authorization = request.headers.get('authorization') || '';
    const response = await fetch(`${getBackendBaseUrl()}/api/media/token`, {
      method: 'POST',
      headers: {
        'Content-Type': request.headers.get('content-type') || 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
        ...(authorization ? { Authorization: authorization } : {}),
      },
      body: await request.text(),
      cache: 'no-store',
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      console.warn('[api/media/token] Backend rejected media-token request', {
        status: response.status,
        hasSessionCookie: cookie.includes('tsmeet_session='),
        hasAuthorization: Boolean(authorization),
      });
    }
    return NextResponse.json(data ?? { error: 'Unexpected backend response' }, { status: response.status });
  } catch (error) {
    console.error('[api/media/token] Backend request failed', {
      error: error instanceof Error ? error.message : 'Unknown proxy error',
    });
    return NextResponse.json({ error: 'Backend server is unavailable' }, { status: 502 });
  }
}
