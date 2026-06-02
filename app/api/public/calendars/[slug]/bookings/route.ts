import { NextRequest } from 'next/server';
import { getBackendBaseUrl, proxyResponse } from '../../../../_proxy';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const backend = getBackendBaseUrl();
  const body = await request.text();

  return proxyResponse(`${backend}/api/public/calendars/${slug}/bookings`, {
    method: 'POST',
    headers: {
      'Content-Type': request.headers.get('content-type') || 'application/json',
    },
    body,
  });
}
