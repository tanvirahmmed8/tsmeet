'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import {
  CalendarForm,
  createCalendarPayload,
  defaultAvailability,
  defaultField,
  initialCalendarForm,
  type BookingField,
  type CalendarFormState,
} from '@/components/calendar/calendar-form';
import { CalendarWorkspaceShell } from '@/components/calendar/calendar-workspace-shell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function CreateCalendarPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CalendarFormState>(initialCalendarForm);
  const [availability, setAvailability] = useState(defaultAvailability());
  const [fields, setFields] = useState<BookingField[]>([defaultField()]);

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

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setSaving(true);
      setError('');
      const token = localStorage.getItem('token');
      const payload = createCalendarPayload(form, availability, fields);

      const res = await fetch('/api/calendars', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);
      if (res.status === 401 || res.status === 403) {
        router.push('/auth/login');
        return;
      }

      if (!res.ok) {
        setError(data?.error || 'Failed to create calendar');
        return;
      }

      router.push(`/calendars/manage/${data.id}/edit`);
    } catch (err) {
      console.error(err);
      setError('Failed to create calendar. Is the backend running on port 3002?');
    } finally {
      setSaving(false);
    }
  };

  if (!ready || !user) {
    return null;
  }

  return (
    <CalendarWorkspaceShell
      user={user}
      title="Create calendar"
      description="Set up availability, booking rules, reminders, and custom intake fields on a dedicated creation page."
      actions={
        <Button asChild variant="outline">
          <Link href="/calendars">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to list
          </Link>
        </Button>
      }
    >
      {error ? (
        <div className="mb-6 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      ) : null}

      <Card className="rounded-[28px] border-primary/10 bg-card/55 p-6 shadow-sm backdrop-blur-sm md:p-8">
        <CalendarForm
          mode="create"
          form={form}
          setForm={setForm}
          availability={availability}
          setAvailability={setAvailability}
          fields={fields}
          setFields={setFields}
          onSubmit={handleSubmit}
          saving={saving}
          submitLabel="Create calendar"
        />
      </Card>
    </CalendarWorkspaceShell>
  );
}
