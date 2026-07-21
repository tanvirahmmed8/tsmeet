import { NextRequest } from 'next/server';
import { getBackendBaseUrl, proxyResponse } from '../../../_proxy';

export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization') || '';
  return proxyResponse(`${getBackendBaseUrl()}/api/recordings/sessions/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) },
    body: await request.text(),
  });
}
