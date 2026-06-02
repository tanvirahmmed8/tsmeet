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

  return proxyResponse(`${backend}/api/calendars/${calendarId}/slots${search}`, {
    method: 'GET',
    headers: {
      ...(auth ? { Authorization: auth } : {}),
    },
  });
}
