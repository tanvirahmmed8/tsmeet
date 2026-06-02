import { NextRequest } from 'next/server';
import { getBackendBaseUrl, proxyResponse } from '@/app/api/_proxy';

const backend = getBackendBaseUrl();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const { bookingId } = await params;
  return proxyResponse(`${backend}/api/public/calendars/meetings/${bookingId}`, {
    method: 'GET',
  });
}
