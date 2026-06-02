import { NextRequest } from 'next/server';
import { getBackendBaseUrl, proxyResponse } from '../../../../_proxy';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const backend = getBackendBaseUrl();
  const search = request.nextUrl.search || '';

  return proxyResponse(`${backend}/api/public/calendars/${slug}/slots${search}`, {
    method: 'GET',
  });
}
