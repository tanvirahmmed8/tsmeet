'use client';

import React, { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type MeetingData = {
  booking: {
    id: string;
    status: string;
    slotStartAt: string;
    slotEndAt: string;
    bookerName: string;
    meetingUrl: string;
    confirmationMessage: string;
    canceledAt: string | null;
    cancelReason: string | null;
  };
  calendar: {
    id: string;
    title: string;
    timezone: string;
    slug: string;
    settings?: {
      autoRecordMeeting?: boolean;
      calendarType?: 'personal' | 'event' | 'round_robin';
    };
  } | null;
};

function MeetingContent({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [meeting, setMeeting] = useState<MeetingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchMeeting() {
      try {
        const res = await fetch(`/api/meetings/${bookingId}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || 'Meeting not found');
          return;
        }
        const data: MeetingData = await res.json();
        setMeeting(data);
      } catch {
        setError('Failed to load meeting details');
      } finally {
        setLoading(false);
      }
    }
    fetchMeeting();
  }, [bookingId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground">Loading meeting details…</p>
        </div>
      </div>
    );
  }

  if (error || !meeting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle className="text-destructive">Meeting Not Found</CardTitle>
            <CardDescription>{error || 'This meeting link is invalid or has expired.'}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push('/')} variant="outline">
              Go Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { booking, calendar } = meeting;
  const isCanceled = booking.status === 'canceled';
  const slotStart = new Date(booking.slotStartAt);
  const slotEnd = new Date(booking.slotEndAt);
  const now = new Date();
  const isUpcoming = slotStart > now;
  const isLive = now >= slotStart && now <= slotEnd;
  const isPast = now > slotEnd;

  const formatDate = (date: Date) =>
    date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

  const formatTime = (date: Date) =>
    date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });

  const handleJoinRoom = () => {
    const shouldPromptAutoRecord = Boolean(calendar?.settings?.autoRecordMeeting);
    router.push(`/room/${bookingId}${shouldPromptAutoRecord ? '?autoRecord=1' : ''}`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl">
              {calendar?.title || 'Meeting'}
            </CardTitle>
            {isCanceled ? (
              <Badge variant="destructive">Canceled</Badge>
            ) : isLive ? (
              <Badge className="bg-green-600 text-white animate-pulse">Live Now</Badge>
            ) : isPast ? (
              <Badge variant="secondary">Ended</Badge>
            ) : (
              <Badge variant="outline">Upcoming</Badge>
            )}
          </div>
          {booking.confirmationMessage && (
            <CardDescription>{booking.confirmationMessage}</CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Meeting Details */}
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
              <span>{formatDate(slotStart)}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span>{formatTime(slotStart)} – {formatTime(slotEnd)}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              <span>{booking.bookerName}</span>
            </div>
            {calendar?.timezone && (
              <div className="flex items-center gap-3 text-sm">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
                <span className="text-muted-foreground">{calendar.timezone}</span>
              </div>
            )}
          </div>

          {/* Cancellation info */}
          {isCanceled && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm">
              <p className="font-medium text-destructive">This meeting has been canceled.</p>
              {booking.cancelReason && (
                <p className="text-muted-foreground mt-1">Reason: {booking.cancelReason}</p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-2">
            {(isLive || isUpcoming) && !isCanceled && (
              <Button size="lg" className="w-full" onClick={handleJoinRoom}>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>
                {isLive ? 'Join Meeting Now' : 'Join Meeting'}
              </Button>
            )}
            {isPast && !isCanceled && (
              <p className="text-center text-sm text-muted-foreground">
                This meeting has ended.
              </p>
            )}
            <Button variant="outline" className="w-full" onClick={() => router.push('/')}>
              Back to Home
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function MeetingPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = use(params);
  return <MeetingContent bookingId={bookingId} />;
}
