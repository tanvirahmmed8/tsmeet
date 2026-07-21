import { NextRequest, NextResponse } from 'next/server';
import { getBackendBaseUrl, proxyResponse } from '../../../../_proxy';

const allowedActions = new Set(['pause', 'resume', 'stop']);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string; action: string }> },
) {
  const { sessionId, action } = await params;
  if (!allowedActions.has(action)) return NextResponse.json({ error: 'Unsupported recording action' }, { status: 404 });
  const auth = request.headers.get('authorization') || '';
  return proxyResponse(`${getBackendBaseUrl()}/api/recordings/sessions/${sessionId}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) },
    body: await request.text(),
  });
}
