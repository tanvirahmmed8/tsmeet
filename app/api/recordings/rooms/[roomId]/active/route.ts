import { NextRequest } from 'next/server';
import { getBackendBaseUrl, proxyResponse } from '../../../../_proxy';

export async function GET(request: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const auth = request.headers.get('authorization') || '';
  return proxyResponse(`${getBackendBaseUrl()}/api/recordings/rooms/${roomId}/active`, {
    headers: { ...(auth ? { Authorization: auth } : {}) },
  });
}
