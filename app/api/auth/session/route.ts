import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '../_session';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const headers = { 'Cache-Control': 'private, no-store' };
  try {
    const result = await verifySession(request);
    return NextResponse.json(result.user ? { user: result.user } : { error: 'Session unavailable' }, {
      status: result.status, headers,
    });
  } catch {
    return NextResponse.json({ error: 'Unable to verify session. Please retry.' }, { status: 503, headers });
  }
}
