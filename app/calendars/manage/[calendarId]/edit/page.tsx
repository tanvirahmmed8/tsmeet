'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ExternalLink, Link as LinkIcon, Plus } from 'lucide-react';

import {
  CalendarForm,
  createCalendarPayload,
  defaultAvailability,
  defaultField,
  hydrateCalendarForm,
  initialCalendarForm,
  type BookingField,
  type CalendarDetail,
  type CalendarFormState,
} from '@/components/calendar/calendar-form';
import { CalendarWorkspaceShell } from '@/components/calendar/calendar-workspace-shell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export default function EditCalendarPage() {
  const params = useParams();
  const router = useRouter();
  const calendarId = params.calendarId as string;

  const [user, setUser] = useState<any>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [calendar, setCalendar] = useState<CalendarDetail | null>(null);
  const [form, setForm] = useState<CalendarFormState>(initialCalendarForm);
  const [availability, setAvailability] = useState(defaultAvailability());
  const [fields, setFields] = useState<BookingField[]>([defaultField()]);
  const [holidayDate, setHolidayDate] = useState(new Date().toISOString().slice(0, 10));
  const [holidayLabel, setHolidayLabel] = useState('Holiday');
  const [disabledStartAt, setDisabledStartAt] = useState('');
  const [disabledEndAt, setDisabledEndAt] = useState('');
  const [disabledReason, setDisabledReason] = useState('Maintenance');

  const loadCalendar = async () => {
    try {
      setLoading(true);
      setError('');
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/calendars/${calendarId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401 || res.status === 403) {
        router.push('/auth/login');
        return;
      }

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || 'Failed to load calendar');
        return;
      }

      setCalendar(data);
      const hydrated = hydrateCalendarForm(data);
      setForm(hydrated.form);
      setAvailability(hydrated.availability);
      setFields(hydrated.fields.length > 0 ? hydrated.fields : [defaultField()]);
    } catch (err) {
      console.error(err);
      setError('Failed to load calendar. Is the backend running on port 3002?');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const rawUser = localStorage.getItem('user');

    if (!rawUser) {
      router.push('/auth/login');
      return;
    }

    setUser(JSON.parse(rawUser));
    setReady(true);
  }, [router]);

  useEffect(() => {
    if (!ready || !calendarId) return;
    loadCalendar();
  }, [ready, calendarId]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setSaving(true);
      setError('');
      const token = localStorage.getItem('token');
      const payload = createCalendarPayload(form, availability, fields);
      const { slug: _slug, ...updatePayload } = payload;

      const res = await fetch(`/api/calendars/${calendarId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updatePayload),
      });

      const data = await res.json().catch(() => null);
      if (res.status === 401 || res.status === 403) {
        router.push('/auth/login');
        return;
      }

      if (!res.ok) {
        setError(data?.error || 'Failed to update calendar');
        return;
      }

      await loadCalendar();
    } catch (err) {
      console.error(err);
      setError('Failed to update calendar');
    } finally {
      setSaving(false);
    }
  };

  const handleAddHoliday = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/calendars/${calendarId}/holidays`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ holidayDate, label: holidayLabel, isFullDay: true }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || 'Failed to add holiday');
        return;
      }

      await loadCalendar();
    } catch (err) {
      console.error(err);
      setError('Failed to add holiday');
    }
  };

  const handleAddDisabledSlot = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/calendars/${calendarId}/disabled-slots`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ startAt: disabledStartAt, endAt: disabledEndAt, reason: disabledReason }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || 'Failed to add blackout slot');
        return;
      }

      setDisabledStartAt('');
      setDisabledEndAt('');
      await loadCalendar();
    } catch (err) {
      console.error(err);
      setError('Failed to add blackout slot');
    }
  };

  if (!ready || !user) {
    return null;
  }

  return (
    <CalendarWorkspaceShell
      user={user}
      title={calendar ? `Edit ${calendar.title}` : 'Edit calendar'}
      description="Manage settings, form fields, blocked time, and public sharing from a dedicated edit page."
      actions={
        <>
          <Button asChild variant="outline">
            <Link href="/calendars">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to list
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/calendars/manage/${calendarId}/bookings`}>
              View bookings
            </Link>
          </Button>
        </>
      }
    >
      {error ? (
        <div className="mb-6 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      ) : null}

      {loading || !calendar ? (
        <Card className="rounded-[28px] border-primary/10 bg-card/55 p-10 text-center text-foreground/60 backdrop-blur-sm">
          Loading calendar...
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="rounded-[24px] border-primary/10 bg-card/55 p-5 backdrop-blur-sm">
              <p className="text-xs uppercase tracking-[0.2em] text-foreground/45">Share URL</p>
              <p className="mt-2 break-all text-sm text-foreground">{calendar.shareUrl}</p>
              <div className="mt-4 flex gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link href={calendar.shareUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Open
                  </Link>
                </Button>
              </div>
            </Card>
            <Card className="rounded-[24px] border-primary/10 bg-card/55 p-5 backdrop-blur-sm">
              <p className="text-xs uppercase tracking-[0.2em] text-foreground/45">Embed URL</p>
              <p className="mt-2 break-all text-sm text-foreground">{calendar.embedUrl}</p>
            </Card>
            <Card className="rounded-[24px] border-primary/10 bg-card/55 p-5 backdrop-blur-sm">
              <p className="text-xs uppercase tracking-[0.2em] text-foreground/45">Public slug</p>
              <p className="mt-2 text-sm text-foreground">/{calendar.slug}</p>
              <div className="mt-4 flex gap-2 text-xs text-foreground/55">
                <LinkIcon className="w-4 h-4" />
                Fixed after creation
              </div>
            </Card>
          </div>

          <Card className="rounded-[28px] border-primary/10 bg-card/55 p-6 shadow-sm backdrop-blur-sm md:p-8">
            <CalendarForm
              mode="edit"
              form={form}
              setForm={setForm}
              availability={availability}
              setAvailability={setAvailability}
              fields={fields}
              setFields={setFields}
              onSubmit={handleSubmit}
              saving={saving}
              submitLabel="Save changes"
            />
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="rounded-[28px] border-primary/10 bg-card/55 p-6 shadow-sm backdrop-blur-sm">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-foreground">Disabled slots</h3>
                <span className="text-xs text-foreground/50">Blackout ranges</span>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <Input type="datetime-local" value={disabledStartAt} onChange={(event) => setDisabledStartAt(event.target.value)} />
                <Input type="datetime-local" value={disabledEndAt} onChange={(event) => setDisabledEndAt(event.target.value)} />
                <Input value={disabledReason} onChange={(event) => setDisabledReason(event.target.value)} placeholder="Reason" />
              </div>
              <Button type="button" className="mt-3 bg-primary text-primary-foreground hover:bg-primary/90" onClick={handleAddDisabledSlot}>
                <Plus className="w-4 h-4 mr-2" />
                Add blackout slot
              </Button>

              <div className="mt-4 space-y-2">
                {calendar.disabledSlots.length === 0 ? <p className="text-sm text-foreground/60">No blocked ranges yet.</p> : null}
                {calendar.disabledSlots.map((slot) => (
                  <div key={`${slot.start_at}-${slot.end_at}`} className="rounded-xl border border-border bg-background/45 px-3 py-2 text-sm">
                    <div className="font-medium text-foreground">{new Date(slot.start_at).toLocaleString()} - {new Date(slot.end_at).toLocaleString()}</div>
                    <p className="text-foreground/60">{slot.reason || 'Blocked'}</p>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="rounded-[28px] border-primary/10 bg-card/55 p-6 shadow-sm backdrop-blur-sm">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-foreground">Holidays</h3>
                <span className="text-xs text-foreground/50">Full-day blocks</span>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Input type="date" value={holidayDate} onChange={(event) => setHolidayDate(event.target.value)} />
                <Input value={holidayLabel} onChange={(event) => setHolidayLabel(event.target.value)} placeholder="Holiday label" />
              </div>
              <Button type="button" className="mt-3 bg-primary text-primary-foreground hover:bg-primary/90" onClick={handleAddHoliday}>
                <Plus className="w-4 h-4 mr-2" />
                Add holiday
              </Button>

              <div className="mt-4 space-y-2">
                {calendar.holidays.length === 0 ? <p className="text-sm text-foreground/60">No holidays added yet.</p> : null}
                {calendar.holidays.map((holiday) => (
                  <div key={`${holiday.holiday_date}-${holiday.label}`} className="rounded-xl border border-border bg-background/45 px-3 py-2 text-sm">
                    <div className="font-medium text-foreground">{holiday.holiday_date}</div>
                    <p className="text-foreground/60">{holiday.label || 'Holiday'}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}
    </CalendarWorkspaceShell>
  );
}
