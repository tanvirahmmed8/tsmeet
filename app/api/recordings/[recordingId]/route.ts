import { NextRequest } from 'next/server';
import { getBackendBaseUrl, proxyResponse } from '../../_proxy';

export const dynamic = 'force-dynamic';

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ recordingId: string }> }
) {
  const { recordingId } = await context.params;
  const backend = getBackendBaseUrl();
  const auth = request.headers.get('authorization') || '';

  return proxyResponse(`${backend}/api/recordings/${recordingId}`, {
    method: 'DELETE',
    headers: {
      ...(auth ? { Authorization: auth } : {}),
    },
  });
}
