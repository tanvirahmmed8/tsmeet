import { NextRequest } from 'next/server';
import { getBackendBaseUrl, proxyResponse } from '../../../_proxy';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const { bookingId } = await params;
  const backend = getBackendBaseUrl();
  const auth = request.headers.get('authorization') || '';
  const body = await request.text();

  return proxyResponse(`${backend}/api/bookings/${bookingId}/cancel`, {
    method: 'POST',
    headers: {
      'Content-Type': request.headers.get('content-type') || 'application/json',
      ...(auth ? { Authorization: auth } : {}),
    },
    body,
  });
}
