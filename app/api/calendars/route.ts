import { NextRequest } from 'next/server';
import { getBackendBaseUrl, proxyResponse } from '../_proxy';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const backend = getBackendBaseUrl();
  const auth = request.headers.get('authorization') || '';

  return proxyResponse(`${backend}/api/calendars`, {
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

  return proxyResponse(`${backend}/api/calendars`, {
    method: 'POST',
    headers: {
      'Content-Type': request.headers.get('content-type') || 'application/json',
      ...(auth ? { Authorization: auth } : {}),
    },
    body,
  });
}
