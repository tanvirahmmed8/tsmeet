'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';

import { type CalendarDetail } from '@/components/calendar/calendar-form';
import { CalendarWorkspaceShell } from '@/components/calendar/calendar-workspace-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type CreatorBooking = {
  id: string;
  assignedUserId?: number;
  assignedUserName?: string;
  assignedUserEmail?: string;
  slotStartAt: string;
  slotEndAt: string;
  status: string;
  bookerName: string;
  bookerEmail?: string;
  meetingUrl?: string;
  cancelReason?: string;
};

function normalizeBooking(booking: any): CreatorBooking {
  return {
    id: booking.id,
    assignedUserId: booking.assignedUserId ?? booking.assigned_user_id,
    assignedUserName: booking.assignedUserName ?? booking.assigned_user_name,
    assignedUserEmail: booking.assignedUserEmail ?? booking.assigned_user_email,
    slotStartAt: booking.slotStartAt || booking.slot_start_at,
    slotEndAt: booking.slotEndAt || booking.slot_end_at,
    status: booking.status,
    bookerName: booking.bookerName || booking.booker_name,
    bookerEmail: booking.bookerEmail || booking.booker_email,
    meetingUrl: booking.meetingUrl || booking.meeting_url,
    cancelReason: booking.cancelReason || booking.cancel_reason,
  };
}

export default function CalendarBookingsPage() {
  const params = useParams();
  const router = useRouter();
  const calendarId = params.calendarId as string;

  const [user, setUser] = useState<any>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [calendar, setCalendar] = useState<CalendarDetail | null>(null);
  const [bookings, setBookings] = useState<CreatorBooking[]>([]);
  const [bookingFilterDate, setBookingFilterDate] = useState(new Date().toISOString().slice(0, 10));
  const [bookingFilterStatus, setBookingFilterStatus] = useState('all');

  const loadCalendar = async () => {
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/calendars/${calendarId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401 || res.status === 403) {
      router.push('/auth/login');
      return null;
    }

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(data?.error || 'Failed to load calendar');
    }

    return data as CalendarDetail;
  };

  const loadBookings = async (date?: string, status?: string) => {
    const token = localStorage.getItem('token');
    const search = new URLSearchParams();
    if (date) search.set('date', date);
    if (status) search.set('status', status);

    const res = await fetch(`/api/calendars/${calendarId}/bookings${search.toString() ? `?${search.toString()}` : ''}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401 || res.status === 403) {
      router.push('/auth/login');
      return [];
    }

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(data?.error || 'Failed to load bookings');
    }

    return (data?.bookings || []).map(normalizeBooking) as CreatorBooking[];
  };

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

    const bootstrap = async () => {
      try {
        setLoading(true);
        setError('');
        const [calendarData, bookingData] = await Promise.all([
          loadCalendar(),
          loadBookings(bookingFilterDate, ''),
        ]);
        if (calendarData) {
          setCalendar(calendarData);
        }
        setBookings(bookingData);
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : 'Failed to load bookings');
      } finally {
        setLoading(false);
      }
    };

    bootstrap();
  }, [ready, calendarId]);

  const refreshBookings = async () => {
    try {
      setRefreshing(true);
      setError('');
      const next = await loadBookings(bookingFilterDate, bookingFilterStatus === 'all' ? '' : bookingFilterStatus);
      setBookings(next);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to refresh bookings');
    } finally {
      setRefreshing(false);
    }
  };

  const handleCancelBooking = async (bookingId: string) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/bookings/${bookingId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ cancelReason: 'Canceled by creator' }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || 'Failed to cancel booking');
        return;
      }

      await refreshBookings();
    } catch (err) {
      console.error(err);
      setError('Failed to cancel booking');
    }
  };

  if (!ready || !user) {
    return null;
  }

  return (
    <CalendarWorkspaceShell
      user={user}
      title={calendar ? `${calendar.title} bookings` : 'Calendar bookings'}
      description="See one calendar's booking queue on its own page, filter the results, and cancel confirmed bookings."
      actions={
        <>
          <Button asChild variant="outline">
            <Link href="/calendars">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to list
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/calendars/manage/${calendarId}/edit`}>Edit calendar</Link>
          </Button>
        </>
      }
    >
      {error ? (
        <div className="mb-6 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      ) : null}

      {loading || !calendar ? (
        <Card className="rounded-[28px] border-primary/10 bg-card/55 p-10 text-center text-foreground/60 backdrop-blur-sm">
          Loading bookings...
        </Card>
      ) : (
        <div className="space-y-6">
          <Card className="rounded-[28px] border-primary/10 bg-card/55 p-6 shadow-sm backdrop-blur-sm">
            <div className="grid gap-3 md:grid-cols-3">
              <Input type="date" value={bookingFilterDate} onChange={(event) => setBookingFilterDate(event.target.value)} />
              <Select value={bookingFilterStatus} onValueChange={setBookingFilterStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="canceled">Canceled</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={refreshBookings}>
                {refreshing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Refresh
              </Button>
            </div>
          </Card>

          <div className="space-y-3">
            {bookings.length === 0 ? (
              <Card className="rounded-[28px] border-primary/10 bg-card/55 p-10 text-center text-foreground/60 backdrop-blur-sm">
                No bookings found for this filter.
              </Card>
            ) : null}

            {bookings.map((booking) => (
              <Card key={booking.id} className="rounded-[24px] border-primary/10 bg-card/55 p-5 shadow-sm backdrop-blur-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-foreground">{booking.bookerName}</h3>
                      <Badge variant={booking.status === 'confirmed' ? 'default' : 'secondary'}>{booking.status}</Badge>
                    </div>
                    <p className="text-sm text-foreground/60">{booking.bookerEmail || 'No email provided'}</p>
                    {booking.assignedUserName || booking.assignedUserEmail ? (
                      <p className="text-sm text-foreground/70">
                        Assigned to: {booking.assignedUserName || booking.assignedUserEmail}
                      </p>
                    ) : null}
                    <p className="text-sm text-foreground">{new Date(booking.slotStartAt).toLocaleString()} - {new Date(booking.slotEndAt).toLocaleString()}</p>
                    {booking.meetingUrl ? (
                      <a href={booking.meetingUrl} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline">
                        Open meeting link
                      </a>
                    ) : null}
                    {booking.cancelReason ? <p className="text-xs text-foreground/55">Canceled: {booking.cancelReason}</p> : null}
                  </div>

                  {booking.status !== 'canceled' ? (
                    <Button variant="destructive" size="sm" onClick={() => handleCancelBooking(booking.id)}>
                      Cancel booking
                    </Button>
                  ) : null}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </CalendarWorkspaceShell>
  );
}
