import { NextRequest } from 'next/server';
import { getBackendBaseUrl } from '../_proxy';

export async function verifySession(request: NextRequest) {
  const cookie = request.headers.get('cookie') || '';
  const token = request.cookies.get('tsmeet_session')?.value;
  const authorization = token ? `Bearer ${token}` : request.headers.get('authorization');
  if (!authorization) return { status: 401, user: null };
  const response = await fetch(`${getBackendBaseUrl()}/api/auth/verify`, {
    headers: { Cookie: cookie, Authorization: authorization }, cache: 'no-store',
  });
  if (!response.ok) return { status: response.status, user: null };
  const data = await response.json();
  const user = data?.user;
  if (!data?.valid || user?.userId === undefined) throw new Error('Invalid session response');
  return { status: 200, user: {
    id: String(user.userId), name: String(user.name || 'Guest'),
    email: typeof user.email === 'string' ? user.email : undefined,
    guest: Boolean(user.guest),
    roomId: user.guest && typeof user.roomId === 'string' ? user.roomId : undefined,
  } };
}
