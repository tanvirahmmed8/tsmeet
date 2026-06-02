'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CalendarDays,
  Code2,
  ChevronRight,
  Clock3,
  LayoutDashboard,
  LogOut,
  PanelTop,
  Sparkles,
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
  const hasStats = typeof roomCount === 'number' && typeof activeRoomCount === 'number';

  return (
    <SidebarProvider defaultOpen>
      <Sidebar variant="floating" collapsible="icon" className="border-r-0">
        <SidebarHeader className="gap-3 p-3">
          <div className="rounded-3xl border border-sidebar-border/60 bg-[radial-gradient(circle_at_top_left,rgba(49,188,213,0.22),transparent_55%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(239,247,248,0.9))] p-4 shadow-[0_18px_50px_-30px_rgba(18,93,109,0.65)] dark:bg-[radial-gradient(circle_at_top_left,rgba(88,214,238,0.18),transparent_50%),linear-gradient(180deg,rgba(14,23,33,0.98),rgba(10,18,28,0.94))]">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary via-accent to-cyan-400 text-sm font-semibold text-white shadow-lg shadow-primary/20">
                  {initials}
                </div>
                <div className="min-w-0 group-data-[collapsible=icon]:hidden">
                  <p className="truncate text-sm font-semibold text-sidebar-foreground">{user.name || 'Workspace user'}</p>
                  <p className="truncate text-xs text-sidebar-foreground/65">{user.email || 'Signed in'}</p>
                </div>
              </div>
              <div className="rounded-full border border-primary/15 bg-white/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary dark:bg-white/5 group-data-[collapsible=icon]:hidden">
                Live
              </div>
            </div>

            {hasStats ? (
              <div className="mt-4 grid grid-cols-2 gap-2 group-data-[collapsible=icon]:hidden">
                <div className="rounded-2xl border border-white/50 bg-white/70 p-3 dark:border-white/8 dark:bg-white/5">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-sidebar-foreground/55">Rooms</p>
                  <p className="mt-2 text-2xl font-semibold text-sidebar-foreground">{roomCount}</p>
                </div>
                <div className="rounded-2xl border border-white/50 bg-white/70 p-3 dark:border-white/8 dark:bg-white/5">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-sidebar-foreground/55">Active</p>
                  <p className="mt-2 text-2xl font-semibold text-sidebar-foreground">{activeRoomCount}</p>
                </div>
              </div>
            ) : null}
          </div>
        </SidebarHeader>

        <SidebarContent className="px-2 pb-2">
          <SidebarGroup>
            <SidebarGroupLabel>Workspace</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {workspaceItems.map((item) => {
                  const isActive = item.href === '/calendars'
                    ? pathname === item.href || pathname.startsWith('/calendars/')
                    : pathname === item.href;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={isActive} size="lg" tooltip={item.label} className="rounded-2xl">
                        <Link href={item.href}>
                          <item.icon className="w-4 h-4" />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                      {!isActive ? null : (
                        <div className="mt-1 rounded-2xl bg-sidebar-accent/45 px-3 py-2 text-xs text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden">
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
            <SidebarGroupLabel>Quick Access</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {quickLinks.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild tooltip={item.label} className="rounded-xl text-sidebar-foreground/80">
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

          <SidebarGroup className="mt-auto">
            <div className="overflow-hidden rounded-3xl border border-sidebar-border/60 bg-[linear-gradient(145deg,rgba(51,184,201,0.14),rgba(255,255,255,0.9))] p-4 dark:bg-[linear-gradient(145deg,rgba(67,199,224,0.16),rgba(17,24,39,0.92))] group-data-[collapsible=icon]:hidden">
              <div className="flex items-center gap-2 text-sidebar-foreground">
                <div className="rounded-xl bg-primary/12 p-2 text-primary">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Sharper workflow</p>
                  <p className="text-xs text-sidebar-foreground/65">Jump between meetings and booking pages without losing context.</p>
                </div>
              </div>
              <Button asChild size="sm" className="mt-4 w-full rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground">
                <Link href="/calendars">
                  Open calendar studio
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </Button>
            </div>
          </SidebarGroup>
        </SidebarContent>

        <SidebarSeparator />

        <SidebarFooter className="p-3">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Back to site" className="rounded-2xl">
                <Link href="/">
                  <PanelTop className="w-4 h-4" />
                  <span>Public site</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={onLogout} tooltip="Sign out" className="rounded-2xl text-destructive hover:bg-destructive/10 hover:text-destructive">
                <LogOut className="w-4 h-4" />
                <span>Sign out</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>

      <SidebarInset className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(77,202,226,0.08),transparent_40%),linear-gradient(180deg,rgba(248,251,252,0.96),rgba(244,248,249,1))] dark:bg-[radial-gradient(circle_at_top,rgba(51,167,190,0.12),transparent_35%),linear-gradient(180deg,rgba(8,15,23,1),rgba(11,19,28,1))]">
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
    <div className="sticky top-0 z-20 border-b border-border/60 bg-background/75 px-4 py-3 backdrop-blur-xl md:px-6">
      <div className="flex items-center gap-3">
        <SidebarTrigger className="rounded-xl border border-border/60 bg-card/70 shadow-sm md:hidden" />
        <SidebarTrigger className="hidden rounded-xl border border-border/60 bg-card/70 shadow-sm md:inline-flex" />
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.24em] text-foreground/45">{eyebrow}</p>
          <h1 className="text-base font-semibold text-foreground">{title}</h1>
        </div>
      </div>
    </div>
  );
}
