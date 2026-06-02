'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { Calendar as DayCalendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Copy, ExternalLink, Loader2, CalendarDays, Link as LinkIcon, CheckCircle2, Sparkles } from 'lucide-react';

type PublicCalendar = {
  id: string;
  slug: string;
  title: string;
  description: string;
  timezone: string;
  confirmationMessage: string;
  settings: {
    slotDurationMinutes: number;
    bookingWindowDays: number;
    availability: Record<string, Array<{ start: string; end: string }>>;
    reminderOffsetsMinutes: number[];
    notificationPreferences: { creatorEmailEnabled: boolean; bookerEmailEnabled: boolean };
    embedEnabled: boolean;
    shareEnabled: boolean;
  };
  bookingForm: { fields: Array<{ id: string; label: string; type: string; required: boolean }> };
  shareUrl: string;
  embedUrl: string;
  embedCode: string;
};

type SlotRecord = {
  startAt: string;
  endAt: string;
  startLocal: string;
  endLocal: string;
  status: 'available' | 'disabled' | 'booked';
  reason?: string;
  capacity?: number;
  remainingCapacity?: number;
};

type Props = {
  slug: string;
  embed?: boolean;
};

function copyToClipboard(value: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    return navigator.clipboard.writeText(value);
  }
  return Promise.resolve();
}

function getFieldKey(field: { id: string; label: string }, index: number) {
  return field.id || `${field.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${index}`;
}

function parseDateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function PublicCalendarBooking({ slug, embed = false }: Props) {
  const [calendar, setCalendar] = useState<PublicCalendar | null>(null);
  const [loading, setLoading] = useState(true);
  const [slotLoading, setSlotLoading] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [slots, setSlots] = useState<SlotRecord[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<SlotRecord | null>(null);
  const [bookerName, setBookerName] = useState('');
  const [bookerEmail, setBookerEmail] = useState('');
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [confirmation, setConfirmation] = useState<any>(null);

  useEffect(() => {
    loadCalendar();
  }, [slug]);

  useEffect(() => {
    if (!calendar) return;
    loadSlots(selectedDate);
  }, [calendar, selectedDate]);

  const loadCalendar = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/public/calendars/${slug}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || 'Calendar not found');
        return;
      }

      setCalendar(data);
      setError('');
    } catch (err) {
      console.error(err);
      setError('Failed to load calendar');
    } finally {
      setLoading(false);
    }
  };

  const loadSlots = async (date: Date) => {
    try {
      if (!calendar) return;
      setSlotLoading(true);
      setSelectedSlot(null);

      const dateValue = format(date, 'yyyy-MM-dd');
      const res = await fetch(`/api/public/calendars/${slug}/slots?date=${dateValue}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || 'Failed to load slots');
        setSlots([]);
        return;
      }

      setSlots(data?.slots || []);
      setError('');
    } catch (err) {
      console.error(err);
      setError('Failed to load slots');
    } finally {
      setSlotLoading(false);
    }
  };

  const submitBooking = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!calendar || !selectedSlot) return;

    try {
      setBookingLoading(true);
      const res = await fetch(`/api/public/calendars/${slug}/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slotStartAt: selectedSlot.startAt,
          bookerName,
          bookerEmail,
          responses,
          confirmationMessage: calendar.confirmationMessage,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || 'Failed to create booking');
        return;
      }

      setConfirmation(data);
      setError('');
    } catch (err) {
      console.error(err);
      setError('Failed to create booking');
    } finally {
      setBookingLoading(false);
    }
  };

  const copyEmbed = async () => {
    if (!calendar) return;
    await copyToClipboard(calendar.embedCode);
  };

  const publicActionBar = calendar && !embed ? (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" asChild>
        <Link href={calendar.shareUrl} target="_blank" rel="noreferrer">
          <ExternalLink className="w-4 h-4 mr-2" />
          Open public page
        </Link>
      </Button>
      <Button variant="outline" size="sm" onClick={() => copyToClipboard(calendar.shareUrl)}>
        <LinkIcon className="w-4 h-4 mr-2" />
        Copy link
      </Button>
      <Button variant="outline" size="sm" onClick={copyEmbed}>
        <Copy className="w-4 h-4 mr-2" />
        Copy embed code
      </Button>
    </div>
  ) : null;

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-gradient-to-br from-background via-background to-slate-900/5 dark:from-background dark:via-slate-950/50 dark:to-slate-900/20">
        <div className="flex items-center gap-2 text-foreground/70">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading calendar...
        </div>
      </div>
    );
  }

  if (error && !calendar) {
    return (
      <div className="min-h-screen grid place-items-center bg-gradient-to-br from-background via-background to-slate-900/5 dark:from-background dark:via-slate-950/50 dark:to-slate-900/20 p-4">
        <Card className="max-w-md w-full p-6 border-destructive/20 bg-card/60">
          <h1 className="text-xl font-bold mb-2 text-foreground">Calendar not available</h1>
          <p className="text-sm text-destructive">{error}</p>
        </Card>
      </div>
    );
  }

  if (!calendar) return null;

  if (confirmation) {
    const meetingUrl = confirmation.meetingUrl || confirmation?.booking?.meeting_url;
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-slate-900/5 dark:from-background dark:via-slate-950/50 dark:to-slate-900/20 p-4">
        <Card className="max-w-2xl mx-auto mt-10 p-6 sm:p-8 border-primary/10 bg-card/65 backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-4 text-primary">
            <CheckCircle2 className="w-5 h-5" />
            <span className="font-medium">Booking confirmed</span>
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">{calendar.title}</h1>
          <p className="text-foreground/60 mb-6">{confirmation.confirmationMessage || calendar.confirmationMessage}</p>

          <div className="grid gap-3 mb-6">
            <Card className="p-4 border-border bg-background/60">
              <p className="text-xs uppercase tracking-wide text-foreground/50 mb-1">Meeting link</p>
              <a href={meetingUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline break-all">
                {meetingUrl}
              </a>
            </Card>
            {confirmation.reminders?.length > 0 && (
              <Card className="p-4 border-border bg-background/60">
                <p className="text-xs uppercase tracking-wide text-foreground/50 mb-2">Reminders</p>
                <div className="flex flex-wrap gap-2">
                  {confirmation.reminders.map((reminder: any) => (
                    <Badge key={String(reminder.minutesBefore)} variant="outline">
                      {reminder.minutesBefore} min before
                    </Badge>
                  ))}
                </div>
              </Card>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <a href={meetingUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="w-4 h-4 mr-2" />
                Open meeting
              </a>
            </Button>
            <Button variant="outline" onClick={() => setConfirmation(null)}>
              Book another slot
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-gradient-to-br from-background via-background to-slate-900/5 dark:from-background dark:via-slate-950/50 dark:to-slate-900/20 ${embed ? 'p-0' : 'p-4 sm:p-8'}`}>
      <Card className={`mx-auto border-primary/10 bg-card/65 backdrop-blur-sm ${embed ? 'w-full rounded-none border-0' : 'max-w-6xl p-6 sm:p-8'}`}>
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/20 bg-primary/5 mb-4">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-xs font-medium text-primary">Public booking</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-2">{calendar.title}</h1>
            <p className="text-foreground/60 max-w-3xl">{calendar.description}</p>
          </div>
          {publicActionBar}
        </div>

        <div className="grid lg:grid-cols-[0.9fr_1.1fr] gap-6">
          <div className="space-y-4">
            <Card className="p-4 border-border bg-background/50">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-foreground flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-primary" />
                  Select a day
                </h2>
                <Badge variant="outline">{calendar.timezone}</Badge>
              </div>
              <DayCalendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => setSelectedDate(date || new Date())}
                className="w-full"
              />
            </Card>

            <Card className="p-4 border-border bg-background/50">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-foreground">Available slots</h2>
                {slotLoading && <Loader2 className="w-4 h-4 animate-spin text-foreground/60" />}
              </div>
              <div className="flex flex-wrap gap-2">
                {slots.map((slot) => (
                  <Button
                    key={slot.startAt}
                    variant={selectedSlot?.startAt === slot.startAt ? 'default' : 'outline'}
                    className="min-w-[120px]"
                    disabled={slot.status !== 'available'}
                    onClick={() => setSelectedSlot(slot)}
                  >
                    {slot.startLocal}
                    {typeof slot.remainingCapacity === 'number' && slot.remainingCapacity > 1 ? ` (${slot.remainingCapacity} left)` : ''}
                  </Button>
                ))}
                {slots.length === 0 && <p className="text-sm text-foreground/60">No slots for this day.</p>}
              </div>
            </Card>
          </div>

          <Card className="p-4 border-border bg-background/50">
            <h2 className="font-semibold text-foreground mb-3">Booking details</h2>

            {selectedSlot ? (
              <div className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg border border-border bg-card/60 p-3">
                    <p className="text-xs uppercase tracking-wide text-foreground/50 mb-1">Selected slot</p>
                    <p className="text-foreground font-medium">{selectedSlot.startLocal} - {selectedSlot.endLocal}</p>
                    <p className="text-xs text-foreground/50">{parseDateLabel(selectedSlot.startAt)}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-card/60 p-3">
                    <p className="text-xs uppercase tracking-wide text-foreground/50 mb-1">Booking window</p>
                    <p className="text-foreground font-medium">{calendar.settings.bookingWindowDays} days</p>
                    <p className="text-xs text-foreground/50">Slot duration {calendar.settings.slotDurationMinutes} minutes</p>
                  </div>
                </div>

                <form onSubmit={submitBooking} className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Your name</label>
                      <Input value={bookerName} onChange={(event) => setBookerName(event.target.value)} required />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Email</label>
                      <Input type="email" value={bookerEmail} onChange={(event) => setBookerEmail(event.target.value)} />
                    </div>
                  </div>

                  <div className="space-y-3">
                    {(calendar.bookingForm.fields || []).map((field, index) => {
                      const key = getFieldKey(field, index);
                      return (
                        <div key={key} className="space-y-2">
                          <label className="text-sm font-medium text-foreground">
                            {field.label} {field.required && <span className="text-destructive">*</span>}
                          </label>
                          {field.type === 'textarea' ? (
                            <Textarea
                              value={responses[key] || ''}
                              onChange={(event) => setResponses((current) => ({ ...current, [key]: event.target.value }))}
                              required={field.required}
                            />
                          ) : (
                            <Input
                              type={field.type}
                              value={responses[key] || ''}
                              onChange={(event) => setResponses((current) => ({ ...current, [key]: event.target.value }))}
                              required={field.required}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="rounded-xl border border-border bg-primary/5 p-4">
                    <p className="text-sm text-foreground/70 mb-2">Confirmation message</p>
                    <p className="text-sm text-foreground">{calendar.confirmationMessage}</p>
                  </div>

                  <Button type="submit" disabled={bookingLoading} className="w-full">
                    {bookingLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    Confirm booking
                  </Button>
                </form>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border p-6 text-center text-foreground/60">
                Choose a slot to continue with the booking form.
              </div>
            )}
          </Card>
        </div>
      </Card>
    </div>
  );
}
