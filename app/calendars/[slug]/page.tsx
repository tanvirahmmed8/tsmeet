'use client';

import { use } from 'react';
import { PublicCalendarBooking } from '@/components/calendar/public-calendar-booking';

export default function PublicCalendarPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  return <PublicCalendarBooking slug={slug} />;
}
