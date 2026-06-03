'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CalendarDays,
  Code2,
  Clock3,
  LayoutDashboard,
  LogOut,
  PanelTop,
  Disc3,
  Video,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarInset,
  SidebarSeparator,
  SidebarTrigger,
} from '@/components/ui/sidebar';

type UserSidebarProps = {
  user: {
    name?: string;
    email?: string;
  };
  roomCount?: number;
  activeRoomCount?: number;
  children: React.ReactNode;
  onLogout: () => void;
  headerTitle?: string;
  headerEyebrow?: string;
};

const workspaceItems = [
  {
    href: '/dashboard',
    label: 'Overview',
    icon: LayoutDashboard,
    description: 'Meetings and quick actions',
  },
  {
    href: '/calendars',
    label: 'Calendars',
    icon: CalendarDays,
    description: 'Booking pages and availability',
  },
  {
    href: '/dashboard/api-docs',
    label: 'API Docs',
    icon: Code2,
    description: 'Token-ready API examples',
  },
  {
    href: '/dashboard/recordings',
    label: 'Recordings',
    icon: Disc3,
    description: 'Archived meeting files',
  },
];

const quickLinks = [
  {
    href: '/dashboard#create-meeting',
    label: 'Start a meeting',
    icon: Video,
  },
  {
    href: '/dashboard#recent-meetings',
    label: 'Recent meetings',
    icon: Clock3,
  },
];

function getInitials(name?: string) {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || 'U';
}

export function UserSidebar({
  user,
  roomCount,
  activeRoomCount,
  children,
  onLogout,
  headerTitle = 'Your meetings',
  headerEyebrow = 'Workspace',
}: UserSidebarProps) {
  const pathname = usePathname();
  const initials = getInitials(user.name);

  return (
    <SidebarProvider defaultOpen>
      <Sidebar variant="floating" collapsible="icon" className="border-r-0">
        <SidebarHeader className="gap-3 p-3">
          <div className="rounded-[28px] border border-sidebar-border/70 bg-sidebar/95 p-4 shadow-[0_16px_40px_-28px_rgba(7,24,33,0.35)]">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent text-sm font-semibold text-white">
                {initials}
              </div>
              <div className="min-w-0 group-data-[collapsible=icon]:hidden">
                <p className="truncate text-sm font-semibold text-sidebar-foreground">{user.name || 'Workspace user'}</p>
                <p className="truncate text-xs text-sidebar-foreground/60">{user.email || 'Signed in'}</p>
              </div>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent className="px-3 pb-3">
          <SidebarGroup>
            <SidebarGroupLabel className="px-2 text-[11px] font-medium uppercase tracking-[0.22em] text-sidebar-foreground/45">Workspace</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {workspaceItems.map((item) => {
                  const isActive = item.href === '/calendars'
                    ? pathname === item.href || pathname.startsWith('/calendars/')
                    : pathname === item.href;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        size="lg"
                        tooltip={item.label}
                        className="h-11 rounded-2xl border border-transparent px-3 text-sidebar-foreground/82 transition-all data-[active=true]:border-primary/20 data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
                      >
                        <Link href={item.href}>
                          <item.icon className="w-4 h-4" />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                      {!isActive ? null : (
                        <div className="mt-1 px-3 text-xs text-sidebar-foreground/58 group-data-[collapsible=icon]:hidden">
                          {item.description}
                        </div>
                      )}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel className="px-2 text-[11px] font-medium uppercase tracking-[0.22em] text-sidebar-foreground/45">Quick Access</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {quickLinks.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild tooltip={item.label} className="h-10 rounded-2xl px-3 text-sidebar-foreground/72">
                      <Link href={item.href}>
                        <item.icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarSeparator />

        <SidebarFooter className="p-3">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Back to site" className="h-11 rounded-2xl px-3">
                <Link href="/">
                  <PanelTop className="w-4 h-4" />
                  <span>Public site</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={onLogout} tooltip="Sign out" className="h-11 rounded-2xl px-3 text-destructive hover:bg-destructive/10 hover:text-destructive">
                <LogOut className="w-4 h-4" />
                <span>Sign out</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>

      <SidebarInset className="min-h-screen bg-[linear-gradient(180deg,#f6f9fb_0%,#eef3f5_100%)] dark:bg-[linear-gradient(180deg,rgba(8,15,23,1),rgba(11,19,28,1))]">
        <div className="flex min-h-screen flex-col">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export function UserSidebarHeader({
  title = 'Your meetings',
  eyebrow = 'Workspace',
}: {
  title?: string;
  eyebrow?: string;
}) {
  return (
    <div className="sticky top-0 z-20 border-b border-border/50 bg-background/88 px-4 py-3 backdrop-blur-xl md:px-6">
      <div className="flex items-center gap-3">
        <SidebarTrigger className="rounded-xl border border-border/60 bg-card/70 shadow-sm md:hidden" />
        <SidebarTrigger className="hidden rounded-xl border border-border/60 bg-card/70 shadow-sm md:inline-flex" />
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-foreground/42">{eyebrow}</p>
          <h1 className="text-lg font-semibold text-foreground">{title}</h1>
        </div>
      </div>
    </div>
  );
}
