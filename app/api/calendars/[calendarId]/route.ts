import { NextRequest } from 'next/server';
import { getBackendBaseUrl, proxyResponse } from '../../_proxy';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ calendarId: string }> }
) {
  const { calendarId } = await params;
  const backend = getBackendBaseUrl();
  const auth = request.headers.get('authorization') || '';

  return proxyResponse(`${backend}/api/calendars/${calendarId}`, {
    method: 'GET',
    headers: {
      ...(auth ? { Authorization: auth } : {}),
    },
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ calendarId: string }> }
) {
  const { calendarId } = await params;
  const backend = getBackendBaseUrl();
  const auth = request.headers.get('authorization') || '';
  const body = await request.text();

  return proxyResponse(`${backend}/api/calendars/${calendarId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': request.headers.get('content-type') || 'application/json',
      ...(auth ? { Authorization: auth } : {}),
    },
    body,
  });
}

