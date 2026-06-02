import { NextRequest } from 'next/server';
import { getBackendBaseUrl, proxyResponse } from '../../../_proxy';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ calendarId: string }> }
) {
  const { calendarId } = await params;
  const backend = getBackendBaseUrl();
  const auth = request.headers.get('authorization') || '';
  const search = request.nextUrl.search || '';

  return proxyResponse(`${backend}/api/calendars/${calendarId}/bookings${search}`, {
    method: 'GET',
    headers: {
      ...(auth ? { Authorization: auth } : {}),
    },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ calendarId: string }> }
) {
  const { calendarId } = await params;
  const backend = getBackendBaseUrl();
  const auth = request.headers.get('authorization') || '';
  const body = await request.text();

  return proxyResponse(`${backend}/api/calendars/${calendarId}/bookings`, {
    method: 'POST',
    headers: {
      'Content-Type': request.headers.get('content-type') || 'application/json',
      ...(auth ? { Authorization: auth } : {}),
    },
    body,
  });
}
