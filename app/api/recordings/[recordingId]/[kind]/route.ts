import { NextRequest, NextResponse } from 'next/server';
import { getBackendBaseUrl } from '../../../_proxy';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ recordingId: string; kind: string }> }
) {
  const { recordingId, kind } = await context.params;
  const backend = getBackendBaseUrl();
  const auth = request.headers.get('authorization') || '';
  const cookie = request.headers.get('cookie') || '';
  // Preserves ?segment=N when downloading one part of a paused/resumed recording.
  const query = request.nextUrl.search;

  try {
    const response = await fetch(`${backend}/api/recordings/${recordingId}/${kind}${query}`, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        ...(auth ? { Authorization: auth } : {}),
        ...(cookie ? { cookie } : {}),
      },
    });

    // The segments listing is JSON, not a file download.
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const body = await response.text();
      return new NextResponse(body, {
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await response.arrayBuffer();
    return new NextResponse(body, {
      status: response.status,
      headers: {
        'Content-Type': contentType || 'application/octet-stream',
        'Content-Disposition': response.headers.get('content-disposition') || 'attachment',
      },
    });
  } catch (error) {
    console.error('[api/recordings/download] Proxy error:', error);
    return NextResponse.json({ error: 'Failed to download recording' }, { status: 502 });
  }
}
