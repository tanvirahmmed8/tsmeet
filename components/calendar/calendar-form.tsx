'use client';

import type { Dispatch, SetStateAction } from 'react';
import { CalendarPlus, CalendarRange, Clock3, Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

export type Weekday = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export type BookingField = {
  id: string;
  label: string;
  type: string;
  required: boolean;
};

export type CalendarSettings = {
  calendarType: 'personal' | 'event' | 'round_robin';
  eventCapacity: number;
  autoRecordMeeting: boolean;
  roundRobinMembers: Array<{
    id?: number;
    name?: string;
    email?: string;
    availability?: Record<string, Array<{ start: string; end: string }>>;
  }>;
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

export type CalendarSummary = {
  id: string;
  slug: string;
  title: string;
  description: string;
  timezone: string;
  confirmationMessage: string;
  settings: CalendarSettings;
  bookingForm: { fields: Array<Record<string, any>> };
  shareUrl: string;
  embedUrl: string;
  embedCode: string;
  createdAt?: string;
  updatedAt?: string;
  endedAt?: string | null;
};

export type CalendarDetail = CalendarSummary & {
  disabledSlots: Array<{ id?: number; start_at: string; end_at: string; reason?: string }>;
  holidays: Array<{ id?: number; holiday_date: string; label?: string; is_full_day?: boolean }>;
  bookings: Array<{
    id: string;
    assignedUserId?: number;
    assignedUserName?: string;
    assignedUserEmail?: string;
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

export type CalendarFormState = {
  title: string;
  description: string;
  slug: string;
  timezone: string;
  confirmationMessage: string;
  calendarType: 'personal' | 'event' | 'round_robin';
  eventCapacity: string;
  autoRecordMeeting: boolean;
  roundRobinMembers: string;
  slotDurationMinutes: string;
  slotIntervalMinutes: string;
  bufferBeforeMinutes: string;
  bookingWindowDays: string;
  dailySlotLimit: string;
  reminderOffsets: string;
  creatorEmailEnabled: boolean;
  bookerEmailEnabled: boolean;
  embedEnabled: boolean;
  shareEnabled: boolean;
  allowCancellation: boolean;
  allowRescheduling: boolean;
};

export const weekdays: Weekday[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export const initialCalendarForm: CalendarFormState = {
  title: '',
  description: '',
  slug: '',
  timezone: 'UTC',
  confirmationMessage: 'Thanks {{bookerName}} - your booking is confirmed. Meeting link: {{meetingUrl}}',
  calendarType: 'personal',
  eventCapacity: '1',
  autoRecordMeeting: false,
  roundRobinMembers: '',
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

export function defaultAvailability() {
  return weekdays.reduce<Record<string, Array<{ start: string; end: string }>>>((acc, day) => {
    acc[day] = day === 'saturday' || day === 'sunday' ? [] : [{ start: '09:00', end: '17:00' }];
    return acc;
  }, {});
}

export function defaultField(): BookingField {
  return {
    id: `field-${Date.now()}`,
    label: 'Company',
    type: 'text',
    required: false,
  };
}

export function toSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

export function createCalendarPayload(
  form: CalendarFormState,
  availability: Record<string, Array<{ start: string; end: string }>>,
  fields: BookingField[]
) {
  const parseAvailabilitySpec = (spec: string) => {
    const output: Record<string, Array<{ start: string; end: string }>> = {};
    const normalized = spec.trim();
    if (!normalized) return output;
    for (const dayToken of normalized.split(';')) {
      const [dayRaw, windowsRaw = ''] = dayToken.split('=').map((value) => value.trim());
      const day = dayRaw.toLowerCase();
      if (!day) continue;
      const windows = windowsRaw
        .split('|')
        .map((window) => window.trim())
        .filter(Boolean)
        .map((window) => {
          const [start = '', end = ''] = window.split('-').map((value) => value.trim());
          return { start, end };
        })
        .filter((window) => /^\d{2}:\d{2}$/.test(window.start) && /^\d{2}:\d{2}$/.test(window.end));
      output[day] = windows;
    }
    return output;
  };

  const roundRobinMembers = form.roundRobinMembers
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [firstPart = '', secondPart = '', thirdPart = '', fourthPart = ''] = line.split(',').map((value) => value.trim());
      const firstLooksLikeEmail = firstPart.includes('@');
      const idValue = firstLooksLikeEmail ? undefined : Number(firstPart);
      const emailValue = firstLooksLikeEmail ? firstPart : thirdPart;
      const nameValue = secondPart || undefined;
      const availabilitySpec = firstLooksLikeEmail ? thirdPart : fourthPart;
      return {
        id: Number.isFinite(idValue as number) ? (idValue as number) : undefined,
        name: nameValue,
        email: emailValue || undefined,
        availability: parseAvailabilitySpec(availabilitySpec),
      };
    })
    .filter((member) => Number.isFinite(member.id) || Boolean(member.email));

  return {
    title: form.title.trim(),
    description: form.description.trim(),
    timezone: form.timezone.trim(),
    slug: form.slug.trim(),
    confirmationMessage: form.confirmationMessage.trim(),
    settings: {
      calendarType: form.calendarType,
      eventCapacity: Math.max(1, Number(form.eventCapacity || '1')),
      autoRecordMeeting: form.autoRecordMeeting,
      roundRobinMembers,
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

export function hydrateCalendarForm(calendar: CalendarDetail) {
  return {
    form: {
      title: calendar.title || '',
      description: calendar.description || '',
      slug: calendar.slug || '',
      timezone: calendar.timezone || 'UTC',
      confirmationMessage: calendar.confirmationMessage || '',
      calendarType: (calendar.settings?.calendarType as CalendarFormState['calendarType']) || 'personal',
      eventCapacity: String(calendar.settings?.eventCapacity ?? 1),
      autoRecordMeeting: Boolean(calendar.settings?.autoRecordMeeting),
      roundRobinMembers: (calendar.settings?.roundRobinMembers || [])
        .map((member) => {
          const availability = Object.entries((member as any).availability || {})
            .map(([day, windows]) => {
              const value = (windows as Array<{ start: string; end: string }>)
                .map((window) => `${window.start}-${window.end}`)
                .join('|');
              return value ? `${day}=${value}` : '';
            })
            .filter(Boolean)
            .join(';');
          return `${member.id || member.email || ''},${member.name || ''},${member.email || ''},${availability}`.replace(/,+$/, '');
        })
        .join('\n'),
      slotDurationMinutes: String(calendar.settings?.slotDurationMinutes ?? 30),
      slotIntervalMinutes: String(calendar.settings?.slotIntervalMinutes ?? 30),
      bufferBeforeMinutes: String(calendar.settings?.bufferBeforeMinutes ?? 0),
      bookingWindowDays: String(calendar.settings?.bookingWindowDays ?? 30),
      dailySlotLimit: String(calendar.settings?.dailySlotLimit ?? 0),
      reminderOffsets: (calendar.settings?.reminderOffsetsMinutes || []).join(',') || '10,5,1',
      creatorEmailEnabled: Boolean(calendar.settings?.notificationPreferences?.creatorEmailEnabled),
      bookerEmailEnabled: Boolean(calendar.settings?.notificationPreferences?.bookerEmailEnabled),
      embedEnabled: Boolean(calendar.settings?.embedEnabled),
      shareEnabled: Boolean(calendar.settings?.shareEnabled),
      allowCancellation: Boolean(calendar.settings?.allowCancellation),
      allowRescheduling: Boolean(calendar.settings?.allowRescheduling),
    } satisfies CalendarFormState,
    availability: calendar.settings?.availability || defaultAvailability(),
    fields: (calendar.bookingForm?.fields || []).map((field, index) => ({
      id: String(field.id || `field-${index}`),
      label: String(field.label || 'Field'),
      type: String(field.type || 'text'),
      required: Boolean(field.required),
    })) as BookingField[],
  };
}

type CalendarFormProps = {
  mode: 'create' | 'edit';
  form: CalendarFormState;
  setForm: Dispatch<SetStateAction<CalendarFormState>>;
  availability: Record<string, Array<{ start: string; end: string }>>;
  setAvailability: Dispatch<SetStateAction<Record<string, Array<{ start: string; end: string }>>>>;
  fields: BookingField[];
  setFields: Dispatch<SetStateAction<BookingField[]>>;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  saving: boolean;
  submitLabel: string;
};

export function CalendarForm({
  mode,
  form,
  setForm,
  availability,
  setAvailability,
  fields,
  setFields,
  onSubmit,
  saving,
  submitLabel,
}: CalendarFormProps) {
  const isCreate = mode === 'create';

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Title</label>
          <Input
            value={form.title}
            onChange={(event) => {
              const value = event.target.value;
              setForm((current) => ({
                ...current,
                title: value,
                slug: isCreate && !current.slug ? toSlug(value) : current.slug,
              }));
            }}
            placeholder="Consultation Calendar"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Slug</label>
          <Input
            value={form.slug}
            disabled={!isCreate}
            onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))}
            placeholder="consultation-calendar"
          />
          {!isCreate ? <p className="text-xs text-foreground/55">Slug is fixed after calendar creation.</p> : null}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Description</label>
        <Textarea
          value={form.description}
          onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
          placeholder="Short public description"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Timezone</label>
          <Input
            value={form.timezone}
            onChange={(event) => setForm((current) => ({ ...current, timezone: event.target.value }))}
            placeholder="Asia/Dhaka"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Calendar type</label>
          <Select
            value={form.calendarType}
            onValueChange={(value) =>
              setForm((current) => ({ ...current, calendarType: value as CalendarFormState['calendarType'] }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="personal">Personal</SelectItem>
              <SelectItem value="event">Event</SelectItem>
              <SelectItem value="round_robin">Round Robin</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Slot duration</label>
          <Input
            type="number"
            min="5"
            value={form.slotDurationMinutes}
            onChange={(event) => setForm((current) => ({ ...current, slotDurationMinutes: event.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Slot interval</label>
          <Input
            type="number"
            min="5"
            value={form.slotIntervalMinutes}
            onChange={(event) => setForm((current) => ({ ...current, slotIntervalMinutes: event.target.value }))}
          />
        </div>
      </div>

      {form.calendarType === 'event' ? (
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Event capacity per slot</label>
          <Input
            type="number"
            min="1"
            value={form.eventCapacity}
            onChange={(event) => setForm((current) => ({ ...current, eventCapacity: event.target.value }))}
          />
        </div>
      ) : null}

      {form.calendarType === 'round_robin' ? (
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Round-robin members</label>
          <Textarea
            value={form.roundRobinMembers}
            onChange={(event) => setForm((current) => ({ ...current, roundRobinMembers: event.target.value }))}
            placeholder={
              'One per line:\n' +
              'id,name,email,day=HH:MM-HH:MM|HH:MM-HH:MM;day=HH:MM-HH:MM\n' +
              'or email,name,day=HH:MM-HH:MM\n' +
              'Example: alex@example.com,Alex,monday=10:00-12:00;tuesday=09:00-11:00'
            }
          />
          <p className="text-xs text-foreground/55">
            Each available member can take one booking in the same slot.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Buffer before</label>
          <Input
            type="number"
            min="0"
            value={form.bufferBeforeMinutes}
            onChange={(event) => setForm((current) => ({ ...current, bufferBeforeMinutes: event.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Booking window (days)</label>
          <Input
            type="number"
            min="1"
            value={form.bookingWindowDays}
            onChange={(event) => setForm((current) => ({ ...current, bookingWindowDays: event.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Daily slot limit</label>
          <Input
            type="number"
            min="0"
            value={form.dailySlotLimit}
            onChange={(event) => setForm((current) => ({ ...current, dailySlotLimit: event.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Reminder offsets</label>
          <Input
            value={form.reminderOffsets}
            onChange={(event) => setForm((current) => ({ ...current, reminderOffsets: event.target.value }))}
            placeholder="10,5,1"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Confirmation message</label>
          <Textarea
            value={form.confirmationMessage}
            onChange={(event) => setForm((current) => ({ ...current, confirmationMessage: event.target.value }))}
            placeholder="Your booking is confirmed"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          {[
            ['creatorEmailEnabled', 'Creator email'],
            ['bookerEmailEnabled', 'Booker email'],
            ['autoRecordMeeting', 'Auto-record prompt'],
            ['embedEnabled', 'Embed enabled'],
            ['shareEnabled', 'Share enabled'],
            ['allowCancellation', 'Allow cancellation'],
            ['allowRescheduling', 'Allow rescheduling'],
          ].map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 rounded-lg border border-border bg-background/60 px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={(form as Record<string, boolean | string>)[key] as boolean}
                onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.checked }))}
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-primary/10 bg-background/50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-semibold text-foreground">
              <CalendarRange className="w-4 h-4 text-primary" />
              Weekly availability
            </h3>
            <span className="text-xs text-foreground/50">One window per day</span>
          </div>

          <div className="max-h-[420px] space-y-3 overflow-auto pr-1">
            {weekdays.map((day) => (
              <div key={day} className="grid grid-cols-[100px_1fr_1fr] items-center gap-2">
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

        <Card className="border-primary/10 bg-background/50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-semibold text-foreground">
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

          <div className="max-h-[420px] space-y-3 overflow-auto pr-1">
            {fields.map((field, index) => (
              <Card key={field.id} className="border-border bg-card/60 p-3">
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

                  <label className="flex h-9 items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-foreground/70">
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

            {fields.length === 0 ? <p className="text-sm text-foreground/60">No extra fields yet.</p> : null}
          </div>
        </Card>
      </div>

      <Button type="submit" disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
        <Clock3 className="w-4 h-4 mr-2" />
        {saving ? 'Saving...' : submitLabel}
      </Button>
    </form>
  );
}
