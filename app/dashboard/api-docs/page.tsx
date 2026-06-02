'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Copy, ArrowLeft } from 'lucide-react';

import { UserSidebar, UserSidebarHeader } from '@/components/dashboard/user-sidebar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

function getBackendBaseUrl() {
  return (process.env.NEXT_PUBLIC_SIGNALING_SERVER || 'http://localhost:3002').replace(/\/+$/, '');
}

function copyToClipboard(value: string) {
  return navigator.clipboard.writeText(value);
}

export default function ApiDocsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string>('');
  const [copyState, setCopyState] = useState<string>('');

  useEffect(() => {
    const userRaw = localStorage.getItem('user');
    const tokenRaw = localStorage.getItem('token');
    if (!userRaw || !tokenRaw) {
      router.push('/auth/login');
      return;
    }

    try {
      setUser(JSON.parse(userRaw));
      setToken(tokenRaw);
    } catch {
      localStorage.removeItem('user');
      localStorage.removeItem('token');
      router.push('/auth/login');
    }
  }, [router]);

  const backendBaseUrl = useMemo(() => getBackendBaseUrl(), []);

  const curlExamples = useMemo(() => {
    const authHeader = `Authorization: Bearer ${token}`;
    return {
      health: `curl -X GET ${backendBaseUrl}/api/health`,
      login: `curl -X POST ${backendBaseUrl}/api/auth/login \\\n  -H "Content-Type: application/json" \\\n  -d '{"email":"${user?.email || 'user@example.com'}","password":"your-password"}'`,
      listCalendars: `curl -X GET ${backendBaseUrl}/api/calendars \\\n  -H "${authHeader}"`,
      createRoom: `curl -X POST ${backendBaseUrl}/api/rooms \\\n  -H "Content-Type: application/json" \\\n  -H "${authHeader}" \\\n  -d '{"title":"Team Sync","description":"Weekly meeting"}'`,
      publicSlots: `curl -X GET "${backendBaseUrl}/api/public/calendars/<slug>/slots?date=2026-06-03"`,
    };
  }, [backendBaseUrl, token, user?.email]);

  const handleCopy = async (key: string, value: string) => {
    await copyToClipboard(value);
    setCopyState(key);
    window.setTimeout(() => setCopyState(''), 1200);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.push('/');
  };

  if (!user || !token) return null;

  return (
    <UserSidebar user={user} onLogout={handleLogout}>
      <UserSidebarHeader title="API Docs" eyebrow="Developers" />

      <main className="flex-1 px-4 py-6 md:px-6 md:py-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <div className="flex items-center justify-between gap-3">
            <Button asChild variant="outline">
              <Link href="/dashboard">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to dashboard
              </Link>
            </Button>
          </div>

          <Card className="rounded-[24px] border-primary/10 bg-card/75 p-5">
            <p className="text-sm text-foreground/70">Backend Base URL</p>
            <p className="mt-1 font-mono text-sm">{backendBaseUrl}</p>
            <p className="mt-4 text-sm text-foreground/70">Auth Token (JWT)</p>
            <div className="mt-1 flex items-start gap-2">
              <code className="block max-h-24 flex-1 overflow-auto rounded-md bg-muted p-2 text-xs">{token}</code>
              <Button size="sm" variant="outline" onClick={() => handleCopy('token', token)}>
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            <p className="mt-2 text-xs text-foreground/55">Use this token in `Authorization: Bearer &lt;jwt&gt;`.</p>
          </Card>

          {Object.entries(curlExamples).map(([key, value]) => (
            <Card key={key} className="rounded-[24px] border-primary/10 bg-card/75 p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold capitalize">{key.replace(/([A-Z])/g, ' $1')}</h3>
                <Button size="sm" variant="outline" onClick={() => handleCopy(key, value)}>
                  <Copy className="w-4 h-4 mr-2" />
                  {copyState === key ? 'Copied' : 'Copy'}
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
