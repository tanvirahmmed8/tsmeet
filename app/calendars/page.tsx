'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, CalendarDays, Clock3, ExternalLink, FilePenLine, Plus, Rows3, Tickets } from 'lucide-react';

import { CalendarWorkspaceShell } from '@/components/calendar/calendar-workspace-shell';
import { type CalendarSummary } from '@/components/calendar/calendar-form';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function CalendarsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [calendars, setCalendars] = useState<CalendarSummary[]>([]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const rawUser = localStorage.getItem('user');

    if (!token || !rawUser) {
      router.push('/auth/login');
      return;
    }

    setUser(JSON.parse(rawUser));
    setReady(true);
  }, [router]);

  useEffect(() => {
    if (!ready) return;

    const loadCalendars = async () => {
      try {
        setLoading(true);
        setError('');
        const token = localStorage.getItem('token');
        const res = await fetch('/api/calendars', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.status === 401 || res.status === 403) {
          router.push('/auth/login');
          return;
        }

        const data = await res.json().catch(() => []);
        if (!res.ok) {
          setError(data?.error || 'Failed to load calendars');
          return;
        }

        setCalendars(data);
      } catch (err) {
        console.error(err);
        setError('Failed to load calendars. Is the backend running on port 3002?');
      } finally {
        setLoading(false);
      }
    };

    loadCalendars();
  }, [ready, router]);

  if (!ready || !user) {
    return null;
  }

  return (
    <CalendarWorkspaceShell
      user={user}
      title="Calendar list"
      description="Browse every booking calendar, then jump directly into creation, editing, or that calendar's booking queue."
      actions={
        <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Link href="/calendars/create">
            <Plus className="w-4 h-4 mr-2" />
            Create calendar
          </Link>
        </Button>
      }
    >
      {error ? (
        <div className="mb-6 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      ) : null}

      {loading ? (
        <Card className="rounded-[28px] border-primary/10 bg-card/55 p-10 text-center text-foreground/60 backdrop-blur-sm">
          Loading calendars...
        </Card>
      ) : calendars.length === 0 ? (
        <Card className="rounded-[28px] border-primary/10 bg-card/55 p-12 text-center backdrop-blur-sm">
          <CalendarDays className="mx-auto mb-4 h-12 w-12 text-foreground/25" />
          <h3 className="text-xl font-semibold text-foreground">No calendars yet</h3>
          <p className="mt-2 text-foreground/60">Create your first calendar to start sharing booking links.</p>
          <Button asChild className="mt-6 bg-primary text-primary-foreground hover:bg-primary/90">
            <Link href="/calendars/create">Create calendar</Link>
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4">
          {calendars.map((calendar) => (
            <Card key={calendar.id} className="rounded-[28px] border-primary/10 bg-card/55 p-6 shadow-sm backdrop-blur-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <h3 className="text-xl font-semibold text-foreground">{calendar.title}</h3>
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">/{calendar.slug}</span>
                  </div>
                  <p className="text-sm text-foreground/60">{calendar.description || 'No public description yet.'}</p>
                  <div className="mt-4 flex flex-wrap gap-4 text-sm text-foreground/55">
                    <span className="flex items-center gap-1.5"><Rows3 className="w-4 h-4" /> {calendar.settings.slotDurationMinutes} min slots</span>
                    <span className="flex items-center gap-1.5"><Clock3 className="w-4 h-4" /> {calendar.timezone}</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline">
                    <Link href={`/calendars/manage/${calendar.id}/edit`}>
                      <FilePenLine className="w-4 h-4 mr-2" />
                      Edit
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href={`/calendars/manage/${calendar.id}/bookings`}>
                      <Tickets className="w-4 h-4 mr-2" />
                      Bookings
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href={calendar.shareUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Public page
                    </Link>
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <Button asChild variant="ghost">
          <Link href="/calendars/create">
            Create another calendar
            <ArrowRight className="w-4 h-4 ml-2" />
          </Link>
        </Button>
      </div>
    </CalendarWorkspaceShell>
  );
}
