'use client';

import { useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAccountSession } from '@/hooks/useAccountSession';
import { BrandLogo } from '@/components/brand-logo';
import { Button } from '@/components/ui/button';

export function AccountEntryGuard({ children }: { children: ReactNode }) {
  const account = useAccountSession();
  const router = useRouter();
  useEffect(() => {
    if (account.status === 'authenticated') router.replace('/dashboard');
  }, [account.status, router]);

  if (account.status === 'anonymous') return children;
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 text-foreground">
      <div className="w-full max-w-sm space-y-5 rounded-2xl border border-border bg-card p-8 text-center">
        <BrandLogo iconSize={40} className="text-xl" />
        <p role={account.error ? 'alert' : 'status'} className="text-sm text-muted-foreground">
          {account.error || (account.status === 'authenticated' ? 'Opening your dashboard…' : 'Checking your session…')}
        </p>
        {account.status === 'error' && <Button onClick={() => void account.refresh()}>Retry session check</Button>}
        <p><Link href="/" className="text-sm text-primary underline underline-offset-4">Back to home</Link></p>
      </div>
    </main>
  );
}
