'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ClipboardList } from 'lucide-react';

import { UserSidebar, UserSidebarHeader } from '@/components/dashboard/user-sidebar';
import { Button } from '@/components/ui/button';

type CalendarWorkspaceShellProps = {
  user: {
    name?: string;
    email?: string;
  };
  eyebrow?: string;
  title: string;
  description: string;
  children: ReactNode;
  actions?: ReactNode;
};

export function CalendarWorkspaceShell({
  user,
  eyebrow = 'Calendar workspace',
  title,
  description,
  actions,
  children,
}: CalendarWorkspaceShellProps) {
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/';
  };

  return (
    <UserSidebar user={user} onLogout={handleLogout} headerTitle="Calendar workspace" headerEyebrow="Workspace">
      <UserSidebarHeader title="Calendar workspace" eyebrow="Workspace" />

      <div className="px-4 py-6 md:px-6 md:py-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 flex flex-col gap-4 rounded-[28px] border border-primary/10 bg-card/55 p-6 shadow-sm backdrop-blur-sm md:flex-row md:items-end md:justify-between md:p-8">
            <div className="max-w-3xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1">
                <span className="text-xs font-medium uppercase tracking-[0.22em] text-primary">{eyebrow}</span>
              </div>
              <h2 className="text-3xl font-bold text-foreground">{title}</h2>
              <p className="mt-2 text-foreground/60">{description}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard">
                  <ClipboardList className="w-4 h-4 mr-2" />
                  Meetings
                </Link>
              </Button>
              {actions}
            </div>
          </div>

          {children}
        </div>
      </div>
    </UserSidebar>
  );
}