'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { Calendar as DayCalendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  CalendarDays,
  CalendarPlus,
  Copy,
  ExternalLink,
  Link as LinkIcon,
  Loader2,
  Plus,
  Trash2,
  ClipboardList,
  Clock3,
  ShieldCheck,
  Share2,
  Code2,
  Ban,
  CalendarRange,
} from 'lucide-react';

type Weekday = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

type CalendarSummary = {
  id: string;
  slug: string;
  title: string;
  description: string;
  timezone: string;
  confirmationMessage: string;
  settings: {
    slotDurationMinutes: number;
    slotIntervalMinutes: number;
    bufferBeforeMinutes: number;
    bookingWindowDays: number;
    dailySlotLimit: number;
    availability: Record<string, Array<{ start: string; end: string }>>;
    notificationPreferences: {
      creatorEmailEnabled: boolean;
      bookerEmailEnabled: boolean;
    };
    reminderOffsetsMinutes: number[];
    embedEnabled: boolean;
    shareEnabled: boolean;
    allowCancellation: boolean;
    allowRescheduling: boolean;
    customFields: Array<Record<string, any>>;
  };
  bookingForm: { fields: Array<Record<string, any>> };
  shareUrl: string;
  embedUrl: string;
  embedCode: string;
  createdAt?: string;
  updatedAt?: string;
  endedAt?: string | null;
};

type CalendarDetail = CalendarSummary & {
  disabledSlots: Array<{ id?: number; start_at: string; end_at: string; reason?: string }>;
  holidays: Array<{ id?: number; holiday_date: string; label?: string; is_full_day?: boolean }>;
  bookings: Array<{
    id: string;
    slotStartAt: string;
    slotEndAt: string;
    status: string;
    bookerName: string;
    bookerEmail?: string;
    responses?: Record<string, string>;
    meetingUrl?: string;
    confirmationMessage?: string;
    createdAt?: string;
    canceledAt?: string;
    cancelReason?: string;
  }>;
};

type SlotRecord = {
  startAt: string;
  endAt: string;
  startLocal: string;
  endLocal: string;
  timezone: string;
  status: 'available' | 'disabled' | 'booked';
  reason?: string;
};

type BookingField = {
  id: string;
  label: string;
  type: string;
  required: boolean;
};

const weekdays: Weekday[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const defaultAvailability = () =>
  weekdays.reduce<Record<string, Array<{ start: string; end: string }>>>((acc, day) => {
    acc[day] = day === 'saturday' || day === 'sunday' ? [] : [{ start: '09:00', end: '17:00' }];
    return acc;
  }, {});

const defaultField = (): BookingField => ({
  id: `field-${Date.now()}`,
  label: 'Company',
  type: 'text',
  required: false,
});

function toSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function copyToClipboard(value: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    return navigator.clipboard.writeText(value);
  }
  return Promise.resolve();
}

function formatDate(value?: string | null) {
  if (!value) return 'N/A';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function createCalendarPayload(form: typeof initialForm, availability: Record<string, Array<{ start: string; end: string }>>, fields: BookingField[]) {
  return {
    title: form.title.trim(),
    description: form.description.trim(),
    timezone: form.timezone.trim(),
    slug: form.slug.trim(),
    confirmationMessage: form.confirmationMessage.trim(),
    settings: {
      slotDurationMinutes: Number(form.slotDurationMinutes),
      slotIntervalMinutes: Number(form.slotIntervalMinutes),
      bufferBeforeMinutes: Number(form.bufferBeforeMinutes),
      bookingWindowDays: Number(form.bookingWindowDays),
      dailySlotLimit: Number(form.dailySlotLimit),
      availability,
      notificationPreferences: {
        creatorEmailEnabled: form.creatorEmailEnabled,
        bookerEmailEnabled: form.bookerEmailEnabled,
      },
      reminderOffsetsMinutes: form.reminderOffsets
        .split(',')
        .map((item) => Number(item.trim()))
        .filter((item) => Number.isFinite(item)),
      embedEnabled: form.embedEnabled,
      shareEnabled: form.shareEnabled,
      allowCancellation: form.allowCancellation,
      allowRescheduling: form.allowRescheduling,
      customFields: fields.map((field) => ({ ...field })),
    },
    bookingForm: {
      fields: fields.map((field) => ({ ...field })),
    },
  };
}

const initialForm = {
  title: '',
  description: '',
  slug: '',
  timezone: 'UTC',
  confirmationMessage: 'Thanks {{bookerName}} - your booking is confirmed. Meeting link: {{meetingUrl}}',
  slotDurationMinutes: '30',
  slotIntervalMinutes: '30',
  bufferBeforeMinutes: '0',
  bookingWindowDays: '30',
  dailySlotLimit: '8',
  reminderOffsets: '10,5,1',
  creatorEmailEnabled: true,
  bookerEmailEnabled: true,
  embedEnabled: true,
  shareEnabled: true,
  allowCancellation: true,
  allowRescheduling: false,
};

export function CalendarManager() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [user, setUser] = useState<any>(null);
  const [calendars, setCalendars] = useState<CalendarSummary[]>([]);
  const [selectedCalendarId, setSelectedCalendarId] = useState<string | null>(null);
  const [selectedCalendar, setSelectedCalendar] = useState<CalendarDetail | null>(null);
  const [saving, setSaving] = useState(false);
  const [createForm, setCreateForm] = useState(initialForm);
  const [availability, setAvailability] = useState<Record<string, Array<{ start: string; end: string }>>>(defaultAvailability());
  const [fields, setFields] = useState<BookingField[]>([defaultField()]);
  const [previewDate, setPreviewDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [slotPreview, setSlotPreview] = useState<SlotRecord[]>([]);
  const [slotPreviewLoading, setSlotPreviewLoading] = useState(false);
  const [holidayDate, setHolidayDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [holidayLabel, setHolidayLabel] = useState('Holiday');
  const [disabledStartAt, setDisabledStartAt] = useState('');
  const [disabledEndAt, setDisabledEndAt] = useState('');
  const [disabledReason, setDisabledReason] = useState('Maintenance');
  const [bookingFilterDate, setBookingFilterDate] = useState('');
  const [bookingFilterStatus, setBookingFilterStatus] = useState('all');
  const [refreshingBookings, setRefreshingBookings] = useState(false);

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
    if (!ready) return;
    loadCalendars();
  }, [ready]);

  useEffect(() => {
    if (!selectedCalendarId) return;
    loadCalendarDetail(selectedCalendarId);
  }, [selectedCalendarId]);

  useEffect(() => {
    if (!selectedCalendarId) return;
    loadSlots(selectedCalendarId, previewDate);
  }, [previewDate, selectedCalendarId]);

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
      if (!selectedCalendarId && data.length > 0) {
        setSelectedCalendarId(data[0].id);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to load calendars. Is the backend running on port 3002?');
    } finally {
      setLoading(false);
    }
  };

  const loadCalendarDetail = async (calendarId: string) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/calendars/${calendarId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || 'Failed to load calendar details');
        return;
      }

      setSelectedCalendar(data);
      setBookingFilterDate(format(new Date(), 'yyyy-MM-dd'));
      setBookingFilterStatus('all');
      await loadSlots(calendarId, previewDate);
      await loadBookings(calendarId, format(new Date(), 'yyyy-MM-dd'), '');
    } catch (err) {
      console.error(err);
      setError('Failed to load calendar details');
    }
  };

  const loadSlots = async (calendarId: string, date: string) => {
    try {
      setSlotPreviewLoading(true);
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/calendars/${calendarId}/slots?date=${encodeURIComponent(date)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || 'Failed to load slot preview');
        setSlotPreview([]);
        return;
      }

      setSlotPreview(data?.slots || []);
    } catch (err) {
      console.error(err);
      setError('Failed to load slot preview');
    } finally {
      setSlotPreviewLoading(false);
    }
  };

  const loadBookings = async (calendarId: string, date?: string, status?: string) => {
    try {
      setRefreshingBookings(true);
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      if (date) params.set('date', date);
      if (status) params.set('status', status);

      const res = await fetch(`/api/calendars/${calendarId}/bookings${params.toString() ? `?${params.toString()}` : ''}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || 'Failed to load bookings');
        return;
      }

      setSelectedCalendar((current) =>
        current
          ? {
              ...current,
              bookings: data?.bookings || [],
            }
          : current
      );
    } catch (err) {
      console.error(err);
      setError('Failed to load bookings');
    } finally {
      setRefreshingBookings(false);
    }
  };

  const handleCreateCalendar = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      setSaving(true);
      setError('');
      const token = localStorage.getItem('token');
      const payload = createCalendarPayload(createForm, availability, fields);

      const res = await fetch('/api/calendars', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || 'Failed to create calendar');
        return;
      }

      setCalendars((current) => [data, ...current]);
      setSelectedCalendarId(data.id);
      setCreateForm((current) => ({
        ...initialForm,
        timezone: current.timezone,
      }));
      setAvailability(defaultAvailability());
      setFields([defaultField()]);
    } catch (err) {
      console.error(err);
      setError('Failed to create calendar');
    } finally {
      setSaving(false);
    }
  };

  const handleAddHoliday = async () => {
    if (!selectedCalendarId) return;
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/calendars/${selectedCalendarId}/holidays`, {
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

    await loadCalendarDetail(selectedCalendarId);
  };

  const handleAddDisabledSlot = async () => {
    if (!selectedCalendarId || !disabledStartAt || !disabledEndAt) return;
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/calendars/${selectedCalendarId}/disabled-slots`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ startAt: disabledStartAt, endAt: disabledEndAt, reason: disabledReason }),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error || 'Failed to add disabled slot');
      return;
    }

    setDisabledStartAt('');
    setDisabledEndAt('');
    await loadCalendarDetail(selectedCalendarId);
  };

  const handleCancelBooking = async (bookingId: string) => {
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

    if (selectedCalendarId) {
      await loadCalendarDetail(selectedCalendarId);
    }
  };

  const selectedDetails = useMemo<CalendarDetail | null>(() => {
    if (!selectedCalendar) return null;
    const base = calendars.find((calendar) => calendar.id === selectedCalendar.id);
    return base ? { ...selectedCalendar, ...base } : selectedCalendar;
  }, [calendars, selectedCalendar]);

  if (!ready || !user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-slate-900/5 dark:from-background dark:via-slate-950/50 dark:to-slate-900/20">
      <nav className="border-b border-border bg-card/50 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <CalendarDays className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-bold text-lg text-foreground dark:text-accent">TSMeet Calendars</h1>
              <p className="text-xs text-foreground/50">API-first scheduling</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-sm text-right hidden sm:block">
              <p className="font-medium text-foreground">{user?.name}</p>
              <p className="text-foreground/60">{user?.email}</p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard">Meetings</Link>
            </Button>
          </div>
        </div>
      </nav>

      {error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <section className="grid lg:grid-cols-[1.2fr_0.8fr] gap-6 items-start">
          <Card className="border-primary/10 bg-card/55 backdrop-blur-sm p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/20 bg-primary/5 mb-4">
                  <ShieldCheck className="w-4 h-4 text-primary" />
                  <span className="text-xs font-medium text-primary">Creator workspace</span>
                </div>
                <h2 className="text-3xl font-bold text-foreground mb-2">Create a booking calendar</h2>
                <p className="text-foreground/60 max-w-2xl">
                  Define availability, custom forms, public share links, embed code, slot rules, holiday blackout days, and creator notifications from one API-backed workspace.
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard">
                  <ClipboardList className="w-4 h-4 mr-2" />
                  Back to meetings
                </Link>
              </Button>
            </div>

            <form onSubmit={handleCreateCalendar} className="space-y-6">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Title</label>
                  <Input
                    value={createForm.title}
                    onChange={(event) => {
                      const value = event.target.value;
                      setCreateForm((current) => ({ ...current, title: value, slug: current.slug || toSlug(value) }));
                    }}
                    placeholder="Consultation Calendar"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Slug</label>
                  <Input
                    value={createForm.slug}
                    onChange={(event) => setCreateForm((current) => ({ ...current, slug: event.target.value }))}
                    placeholder="consultation-calendar"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Description</label>
                <Textarea
                  value={createForm.description}
                  onChange={(event) => setCreateForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder="Short public description"
                />
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Timezone</label>
                  <Input
                    value={createForm.timezone}
                    onChange={(event) => setCreateForm((current) => ({ ...current, timezone: event.target.value }))}
                    placeholder="Asia/Dhaka"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Slot duration</label>
                  <Input
                    type="number"
                    min="5"
                    value={createForm.slotDurationMinutes}
                    onChange={(event) => setCreateForm((current) => ({ ...current, slotDurationMinutes: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Slot interval</label>
                  <Input
                    type="number"
                    min="5"
                    value={createForm.slotIntervalMinutes}
                    onChange={(event) => setCreateForm((current) => ({ ...current, slotIntervalMinutes: event.target.value }))}
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Buffer before</label>
                  <Input
                    type="number"
                    min="0"
                    value={createForm.bufferBeforeMinutes}
                    onChange={(event) => setCreateForm((current) => ({ ...current, bufferBeforeMinutes: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Booking window (days)</label>
                  <Input
                    type="number"
                    min="1"
                    value={createForm.bookingWindowDays}
                    onChange={(event) => setCreateForm((current) => ({ ...current, bookingWindowDays: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Daily slot limit</label>
                  <Input
                    type="number"
                    min="0"
                    value={createForm.dailySlotLimit}
                    onChange={(event) => setCreateForm((current) => ({ ...current, dailySlotLimit: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Reminder offsets</label>
                  <Input
                    value={createForm.reminderOffsets}
                    onChange={(event) => setCreateForm((current) => ({ ...current, reminderOffsets: event.target.value }))}
                    placeholder="10,5,1"
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Confirmation message</label>
                  <Textarea
                    value={createForm.confirmationMessage}
                    onChange={(event) => setCreateForm((current) => ({ ...current, confirmationMessage: event.target.value }))}
                    placeholder="Your booking is confirmed"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ['creatorEmailEnabled', 'Creator email'],
                    ['bookerEmailEnabled', 'Booker email'],
                    ['embedEnabled', 'Embed enabled'],
                    ['shareEnabled', 'Share enabled'],
                    ['allowCancellation', 'Allow cancellation'],
                    ['allowRescheduling', 'Allow rescheduling'],
                  ].map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 rounded-lg border border-border bg-background/60 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={(createForm as any)[key]}
                        onChange={(event) => setCreateForm((current) => ({ ...current, [key]: event.target.checked }))}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid lg:grid-cols-2 gap-4">
                <Card className="p-4 border-primary/10 bg-background/50">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-foreground flex items-center gap-2">
                      <CalendarRange className="w-4 h-4 text-primary" />
                      Weekly availability
                    </h3>
                    <span className="text-xs text-foreground/50">One window per day</span>
                  </div>
                  <div className="space-y-3 max-h-[420px] overflow-auto pr-1">
                    {weekdays.map((day) => (
                      <div key={day} className="grid grid-cols-[100px_1fr_1fr] gap-2 items-center">
                        <span className="text-sm font-medium capitalize text-foreground">{day}</span>
                        <Input
                          type="time"
                          value={availability[day]?.[0]?.start || ''}
                          onChange={(event) =>
                            setAvailability((current) => ({
                              ...current,
                              [day]: [{ start: event.target.value, end: current[day]?.[0]?.end || '' }],
                            }))
                          }
                        />
                        <Input
                          type="time"
                          value={availability[day]?.[0]?.end || ''}
                          onChange={(event) =>
                            setAvailability((current) => ({
                              ...current,
                              [day]: [{ start: current[day]?.[0]?.start || '', end: event.target.value }],
                            }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                </Card>

                <Card className="p-4 border-primary/10 bg-background/50">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-foreground flex items-center gap-2">
                      <CalendarPlus className="w-4 h-4 text-primary" />
                      Custom booking form
                    </h3>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setFields((current) => [...current, { ...defaultField(), id: `field-${Date.now()}-${current.length}` }])}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add field
                    </Button>
                  </div>

                  <div className="space-y-3 max-h-[420px] overflow-auto pr-1">
                    {fields.map((field, index) => (
                      <Card key={field.id} className="p-3 border-border bg-card/60">
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_160px_110px_auto] md:items-end">
                          <div>
                            <label className="text-xs font-medium text-foreground/70">Label</label>
                            <Input
                              value={field.label}
                              onChange={(event) => {
                                const next = [...fields];
                                next[index] = { ...field, label: event.target.value };
                                setFields(next);
                              }}
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-foreground/70">Type</label>
                            <Select
                              value={field.type}
                              onValueChange={(value) => {
                                const next = [...fields];
                                next[index] = { ...field, type: value };
                                setFields(next);
                              }}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Type" />
                              </SelectTrigger>
                              <SelectContent>
                                {['text', 'email', 'phone', 'url', 'number', 'textarea'].map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {option}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <label className="flex items-center gap-2 text-sm text-foreground/70 rounded-md border border-border px-3 py-2 h-9">
                            <input
                              type="checkbox"
                              checked={field.required}
                              onChange={(event) => {
                                const next = [...fields];
                                next[index] = { ...field, required: event.target.checked };
                                setFields(next);
                              }}
                            />
                            Required
                          </label>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setFields((current) => current.filter((item) => item.id !== field.id))}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                </Card>
              </div>

              <Button type="submit" disabled={saving} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                Create calendar
              </Button>
            </form>
          </Card>

          <Card className="border-primary/10 bg-card/55 backdrop-blur-sm p-6 shadow-sm h-full">
            <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <Share2 className="w-4 h-4 text-primary" />
              Your calendars
            </h3>

            {loading ? (
              <div className="flex items-center gap-2 text-foreground/60 py-10 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading calendars...
              </div>
            ) : calendars.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-6 text-center text-foreground/60">
                No calendars created yet. Build one with the form on the left.
              </div>
            ) : (
              <ScrollArea className="h-[980px] pr-3">
                <div className="space-y-3">
                  {calendars.map((calendar) => {
                    const active = calendar.id === selectedCalendarId;
                    return (
                      <button
                        key={calendar.id}
                        onClick={() => setSelectedCalendarId(calendar.id)}
                        className={`w-full text-left rounded-xl border p-4 transition-all ${
                          active
                            ? 'border-primary/30 bg-primary/5 shadow-sm'
                            : 'border-border bg-background/40 hover:bg-background/70'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div>
                            <h4 className="font-semibold text-foreground">{calendar.title}</h4>
                            <p className="text-sm text-foreground/60 line-clamp-2">{calendar.description || 'No description'}</p>
                          </div>
                          <Badge variant={active ? 'default' : 'outline'}>{calendar.timezone}</Badge>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs text-foreground/60">
                          <span>/{calendar.slug}</span>
                          <span>•</span>
                          <span>{calendar.settings.slotDurationMinutes} min slots</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </Card>
        </section>

        {selectedDetails ? (
          <Card className="border-primary/10 bg-card/55 backdrop-blur-sm p-6 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between mb-6">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <Badge variant="secondary">Public share</Badge>
                  <Badge variant="outline">Embed ready</Badge>
                  <Badge variant="outline">Booking API</Badge>
                </div>
                <h3 className="text-2xl font-bold text-foreground">{selectedDetails.title}</h3>
                <p className="text-foreground/60 max-w-3xl">{selectedDetails.description}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href={selectedDetails.shareUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Open public page
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(selectedDetails.shareUrl)}
                >
                  <LinkIcon className="w-4 h-4 mr-2" />
                  Copy share link
                </Button>
              </div>
            </div>

            <Tabs defaultValue="overview" className="space-y-4">
              <TabsList className="w-full flex flex-wrap gap-2 h-auto bg-transparent p-0">
                {(
                  [
                    ['overview', 'Overview', Code2],
                    ['availability', 'Availability', CalendarRange],
                    ['slots', 'Slots', Clock3],
                    ['holidays', 'Holidays', Ban],
                    ['bookings', 'Bookings', ClipboardList],
                  ] as const
                ).map(([value, label, Icon]) => (
                  <TabsTrigger key={value} value={value} className="flex-1 min-w-[120px]">
                    <Icon className="w-4 h-4" />
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                <div className="grid lg:grid-cols-3 gap-4">
                  <Card className="p-4 border-border bg-background/50">
                    <p className="text-xs uppercase tracking-wide text-foreground/50 mb-1">Share URL</p>
                    <p className="text-sm break-all text-foreground">{selectedDetails.shareUrl}</p>
                  </Card>
                  <Card className="p-4 border-border bg-background/50">
                    <p className="text-xs uppercase tracking-wide text-foreground/50 mb-1">Embed URL</p>
                    <p className="text-sm break-all text-foreground">{selectedDetails.embedUrl}</p>
                  </Card>
                  <Card className="p-4 border-border bg-background/50">
                    <p className="text-xs uppercase tracking-wide text-foreground/50 mb-1">Timezone</p>
                    <p className="text-sm text-foreground">{selectedDetails.timezone}</p>
                  </Card>
                </div>

                <div className="grid lg:grid-cols-2 gap-4">
                  <Card className="p-4 border-border bg-background/50">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-foreground flex items-center gap-2">
                        <Share2 className="w-4 h-4 text-primary" />
                        Embed code
                      </h4>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(selectedDetails.embedCode)}
                      >
                        <Copy className="w-4 h-4 mr-2" />
                        Copy embed
                      </Button>
                    </div>
                    <Textarea value={selectedDetails.embedCode} readOnly className="min-h-32 font-mono text-xs" />
                  </Card>

                  <Card className="p-4 border-border bg-background/50 space-y-3">
                    <h4 className="font-semibold text-foreground flex items-center gap-2">
                      <CalendarDays className="w-4 h-4 text-primary" />
                      Booking form fields
                    </h4>
                    <div className="space-y-2">
                      {(selectedDetails.bookingForm.fields || []).map((field) => (
                        <div key={String(field.id)} className="rounded-lg border border-border bg-card/60 px-3 py-2 text-sm flex items-center justify-between">
                          <span>{String(field.label || field.id)}</span>
                          <Badge variant="outline">{String(field.type || 'text')}</Badge>
                        </div>
                      ))}
                      {(selectedDetails.bookingForm.fields || []).length === 0 && (
                        <p className="text-sm text-foreground/60">No custom fields added yet.</p>
                      )}
                    </div>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="availability" className="space-y-4">
                <Card className="p-4 border-border bg-background/50">
                  <h4 className="font-semibold text-foreground mb-3">Weekly availability summary</h4>
                  <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
                    {weekdays.map((day) => (
                      <div key={day} className="rounded-lg border border-border bg-card/60 p-3">
                        <p className="text-sm font-medium capitalize text-foreground mb-2">{day}</p>
                        <div className="space-y-1">
                          {(selectedDetails.settings.availability?.[day] || []).map((window, index) => (
                            <div key={`${day}-${index}`} className="text-xs text-foreground/70 flex items-center gap-2">
                              <Clock3 className="w-3 h-3" />
                              {window.start} - {window.end}
                            </div>
                          ))}
                          {(selectedDetails.settings.availability?.[day] || []).length === 0 && (
                            <p className="text-xs text-foreground/50">Closed</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>

                <div className="grid lg:grid-cols-2 gap-4">
                  <Card className="p-4 border-border bg-background/50 space-y-3">
                    <h4 className="font-semibold text-foreground flex items-center gap-2">
                      <Ban className="w-4 h-4 text-primary" />
                      Disable a specific slot
                    </h4>
                    <div className="grid md:grid-cols-3 gap-3">
                      <Input type="datetime-local" value={disabledStartAt} onChange={(event) => setDisabledStartAt(event.target.value)} />
                      <Input type="datetime-local" value={disabledEndAt} onChange={(event) => setDisabledEndAt(event.target.value)} />
                      <Input value={disabledReason} onChange={(event) => setDisabledReason(event.target.value)} placeholder="Reason" />
                    </div>
                    <Button type="button" onClick={handleAddDisabledSlot} className="bg-primary text-primary-foreground">
                      Add blackout slot
                    </Button>
                    <div className="space-y-2">
                      {selectedDetails.disabledSlots.map((slot) => (
                        <div key={`${slot.start_at}-${slot.end_at}`} className="rounded-lg border border-border px-3 py-2 text-sm">
                          <div className="font-medium text-foreground">{formatDate(slot.start_at)} - {formatDate(slot.end_at)}</div>
                          <p className="text-foreground/60">{slot.reason || 'Blocked'}</p>
                        </div>
                      ))}
                      {selectedDetails.disabledSlots.length === 0 && <p className="text-sm text-foreground/60">No blocked time ranges yet.</p>}
                    </div>
                  </Card>

                  <Card className="p-4 border-border bg-background/50 space-y-3">
                    <h4 className="font-semibold text-foreground flex items-center gap-2">
                      <CalendarRange className="w-4 h-4 text-primary" />
                      Add holiday / full-day disable
                    </h4>
                    <div className="grid md:grid-cols-2 gap-3">
                      <Input type="date" value={holidayDate} onChange={(event) => setHolidayDate(event.target.value)} />
                      <Input value={holidayLabel} onChange={(event) => setHolidayLabel(event.target.value)} placeholder="Holiday name" />
                    </div>
                    <Button type="button" onClick={handleAddHoliday} className="bg-primary text-primary-foreground">
                      Add holiday
                    </Button>
                    <div className="space-y-2">
                      {selectedDetails.holidays.map((holiday) => (
                        <div key={`${holiday.holiday_date}-${holiday.label}`} className="rounded-lg border border-border px-3 py-2 text-sm">
                          <div className="font-medium text-foreground">{holiday.holiday_date}</div>
                          <p className="text-foreground/60">{holiday.label || 'Holiday'}</p>
                        </div>
                      ))}
                      {selectedDetails.holidays.length === 0 && <p className="text-sm text-foreground/60">No holidays added yet.</p>}
                    </div>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="slots" className="space-y-4">
                <Card className="p-4 border-border bg-background/50">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between mb-4">
                    <div>
                      <h4 className="font-semibold text-foreground">Generate slots for a day</h4>
                      <p className="text-sm text-foreground/60">Uses the server-side slot generator and blocked-time rules.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input type="date" value={previewDate} onChange={(event) => setPreviewDate(event.target.value)} className="w-44" />
                      <Button variant="outline" onClick={() => loadSlots(selectedDetails.id, previewDate)}>
                        Refresh
                      </Button>
                    </div>
                  </div>

                  {slotPreviewLoading ? (
                    <div className="flex items-center gap-2 text-foreground/60 py-8 justify-center">
                      <Loader2 className="w-4 h-4 animate-spin" /> Generating slots...
                    </div>
                  ) : (
                    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
                      {slotPreview.map((slot) => (
                        <div key={slot.startAt} className="rounded-lg border border-border bg-card/60 p-3">
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <div>
                              <p className="text-sm font-medium text-foreground">{slot.startLocal} - {slot.endLocal}</p>
                              <p className="text-xs text-foreground/50">{formatDate(slot.startAt)}</p>
                            </div>
                            <Badge variant={slot.status === 'available' ? 'default' : slot.status === 'booked' ? 'secondary' : 'destructive'}>
                              {slot.status}
                            </Badge>
                          </div>
                          {slot.reason && <p className="text-xs text-foreground/60">{slot.reason}</p>}
                        </div>
                      ))}
                      {slotPreview.length === 0 && <p className="text-sm text-foreground/60">Choose a day to generate slots.</p>}
                    </div>
                  )}
                </Card>
              </TabsContent>

              <TabsContent value="bookings" className="space-y-4">
                <Card className="p-4 border-border bg-background/50 space-y-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <h4 className="font-semibold text-foreground">Creator bookings</h4>
                      <p className="text-sm text-foreground/60">Filter by day or status and cancel bookings directly.</p>
                    </div>
                    <div className="grid md:grid-cols-3 gap-2">
                      <Input type="date" value={bookingFilterDate} onChange={(event) => setBookingFilterDate(event.target.value)} />
                      <Select value={bookingFilterStatus} onValueChange={setBookingFilterStatus}>
                        <SelectTrigger className="w-full md:w-40">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="confirmed">Confirmed</SelectItem>
                          <SelectItem value="canceled">Canceled</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        onClick={() => loadBookings(selectedDetails.id, bookingFilterDate, bookingFilterStatus === 'all' ? '' : bookingFilterStatus)}
                      >
                        {refreshingBookings ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                        Refresh
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {selectedDetails.bookings.map((booking) => (
                      <div key={booking.id} className="rounded-xl border border-border bg-card/60 p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h5 className="font-semibold text-foreground">{booking.bookerName}</h5>
                              <Badge variant={booking.status === 'confirmed' ? 'default' : 'secondary'}>{booking.status}</Badge>
                            </div>
                            <p className="text-sm text-foreground/60">{booking.bookerEmail || 'No email'}</p>
                            <p className="text-sm text-foreground">{formatDate(booking.slotStartAt)} - {formatDate(booking.slotEndAt)}</p>
                            {booking.meetingUrl && (
                              <a href={booking.meetingUrl} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline">
                                Open meeting link
                              </a>
                            )}
                            {booking.cancelReason && <p className="text-xs text-foreground/60">Canceled: {booking.cancelReason}</p>}
                          </div>
                          {booking.status !== 'canceled' && (
                            <Button variant="destructive" size="sm" onClick={() => handleCancelBooking(booking.id)}>
                              Cancel booking
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                    {selectedDetails.bookings.length === 0 && <p className="text-sm text-foreground/60">No bookings yet.</p>}
                  </div>
                </Card>
              </TabsContent>
            </Tabs>
          </Card>
        ) : (
          <Card className="border-dashed border-border bg-card/40 p-8 text-center text-foreground/60">
            Select or create a calendar to manage it.
          </Card>
        )}
      </main>
    </div>
  );
}
