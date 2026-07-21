'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Copy } from 'lucide-react';
import { UserSidebar, UserSidebarHeader } from '@/components/dashboard/user-sidebar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

function getBackendBaseUrl() {
  return (process.env.NEXT_PUBLIC_SIGNALING_SERVER || 'http://localhost:3002').replace(/\/+$/, '');
}

export default function ApiDocsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [copyState, setCopyState] = useState('');

  useEffect(() => {
    const raw = localStorage.getItem('user');
    if (!raw) return void router.push('/auth/login');
    try { setUser(JSON.parse(raw)); }
    catch { localStorage.removeItem('user'); router.push('/auth/login'); }
  }, [router]);

  const backend = useMemo(() => getBackendBaseUrl(), []);
  const examples = useMemo(() => ({
    health: `curl -X GET ${backend}/api/health`,
    login: `curl -X POST ${backend}/api/auth/login -H "Content-Type: application/json" -c cookies.txt -d '{"email":"${user?.email || 'user@example.com'}","password":"your-password"}'`,
    listCalendars: `curl -X GET ${backend}/api/calendars -b cookies.txt`,
    createRoom: `curl -X POST ${backend}/api/rooms -H "Content-Type: application/json" -b cookies.txt -d '{"title":"Team Sync","description":"Weekly meeting"}'`,
  }), [backend, user?.email]);

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.push('/');
  };
  if (!user) return null;

  return (
    <UserSidebar user={user} onLogout={() => void logout()}>
      <UserSidebarHeader title="API Docs" eyebrow="Developers" />
      <main className="flex-1 px-4 py-6 md:px-6 md:py-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <Button asChild variant="outline" className="w-fit"><Link href="/dashboard"><ArrowLeft className="mr-2 h-4 w-4" />Back</Link></Button>
          <Card className="rounded-[24px] border-primary/10 bg-card/75 p-5">
            <p className="text-sm text-foreground/70">Authentication</p>
            <p className="mt-2 text-xs text-foreground/55">Browser sessions use a Secure, HttpOnly, SameSite cookie. JavaScript cannot read or copy the JWT.</p>
          </Card>
          {Object.entries(examples).map(([key, value]) => (
            <Card key={key} className="rounded-[24px] border-primary/10 bg-card/75 p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold capitalize">{key.replace(/([A-Z])/g, ' $1')}</h3>
                <Button size="sm" variant="outline" onClick={async () => { await navigator.clipboard.writeText(value); setCopyState(key); window.setTimeout(() => setCopyState(''), 1200); }}>
                  <Copy className="mr-2 h-4 w-4" />{copyState === key ? 'Copied' : 'Copy'}
                </Button>
              </div>
              <pre className="overflow-auto rounded-md bg-muted p-3 text-xs">{value}</pre>
            </Card>
          ))}
        </div>
      </main>
    </UserSidebar>
  );
}
