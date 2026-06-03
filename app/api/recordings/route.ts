import { NextRequest } from 'next/server';
import { getBackendBaseUrl, proxyResponse } from '../_proxy';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const backend = getBackendBaseUrl();
  const auth = request.headers.get('authorization') || '';

  return proxyResponse(`${backend}/api/recordings`, {
    method: 'GET',
    headers: {
      ...(auth ? { Authorization: auth } : {}),
    },
  });
}
