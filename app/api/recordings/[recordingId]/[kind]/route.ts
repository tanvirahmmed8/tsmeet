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

  try {
    const response = await fetch(`${backend}/api/recordings/${recordingId}/${kind}`, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        ...(auth ? { Authorization: auth } : {}),
      },
    });

    const body = await response.arrayBuffer();
    return new NextResponse(body, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/octet-stream',
        'Content-Disposition': response.headers.get('content-disposition') || 'attachment',
      },
    });
  } catch (error) {
    console.error('[api/recordings/download] Proxy error:', error);
    return NextResponse.json({ error: 'Failed to download recording' }, { status: 502 });
  }
}
