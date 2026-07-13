'use client';

import React from "react"

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { UserSidebar, UserSidebarHeader } from '@/components/dashboard/user-sidebar';
import { useRouter } from 'next/navigation';
import {
  ArrowUpRight,
  Code2,
  Video,
  Plus,
  Link as LinkIcon,
  Copy,
  Trash2,
  MoreVertical,
  Clock,
  CalendarDays,
  Radio,
  Users,
  Disc3,
} from 'lucide-react';
import Link from 'next/link';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';

interface Room {
  id: string;
  title: string;
  description?: string;
  created_at: string;
  ended_at?: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [newRoomTitle, setNewRoomTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string>('');
  const [recordingCount, setRecordingCount] = useState(0);
  const [readyRecordingCount, setReadyRecordingCount] = useState(0);
  useEffect(() => {
    // Check authentication
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('user');

    if (!token || !userData) {
      router.push('/auth/login');
      return;
    }

    setUser(JSON.parse(userData));
    fetchRooms();
    fetchRecordings();
  }, [router]);

  const logoutToLogin = (message?: string) => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    if (message) setError(message);
    router.push('/auth/login');
  };

  const fetchRooms = async () => {
    try {
      setError('');
      const token = localStorage.getItem('token');
      const res = await fetch('/api/rooms', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401 || res.status === 403) {
        logoutToLogin('Session expired. Please sign in again.');
        return;
      }

      if (res.ok) {
        const data = await res.json();
        setRooms(data);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error || 'Failed to load rooms');
      }
    } catch (error) {
      console.error('Error fetching rooms:', error);
      setError('Failed to load rooms. Is the backend running on port 3002?');
    } finally {
      setLoading(false);
    }
  };

  const fetchRecordings = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/recordings', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401 || res.status === 403) {
        logoutToLogin('Session expired. Please sign in again.');
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || 'Failed to load recordings');
        return;
      }

      const data = await res.json();
      const items = Array.isArray(data) ? data : [];
      setRecordingCount(items.length);
      setReadyRecordingCount(items.filter((item: any) => item.status === 'ready').length);
    } catch (error) {
      console.error('Error fetching recordings:', error);
    }
  };

  const createRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomTitle.trim()) return;

    setCreating(true);
    try {
      setError('');
      const token = localStorage.getItem('token');
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title: newRoomTitle }),
      });

      if (res.status === 401 || res.status === 403) {
        logoutToLogin('Session expired. Please sign in again.');
        return;
      }

      if (res.ok) {
        const newRoom = await res.json();
        setRooms([newRoom, ...rooms]);
        setNewRoomTitle('');
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error || 'Failed to create room');
      }
    } catch (error) {
      console.error('Error creating room:', error);
      setError('Failed to create room. Is the backend running on port 3002?');
    } finally {
      setCreating(false);
    }
  };

  const joinRoom = (roomId: string) => {
    router.push(`/room/${roomId}`);
  };

  const copyRoomLink = (roomId: string) => {
    const link = `${window.location.origin}/room/${roomId}`;
    navigator.clipboard.writeText(link);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.push('/');
  };

  if (!user) {
    return null;
  }

  const activeRooms = rooms.filter((room) => !room.ended_at);

  return (
    <UserSidebar
      user={user}
      roomCount={rooms.length}
      activeRoomCount={activeRooms.length}
      onLogout={handleLogout}
    >
      <UserSidebarHeader />

      {error && (
        <div className="px-4 pt-4 md:px-6">
          <div className="rounded-2xl border border-destructive/20 bg-destructive/10 p-3">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        </div>
      )}

      <main className="flex-1 px-4 py-6 md:px-6 md:py-8">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_360px]">
            <Card className="rounded-[30px] border-border/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(246,250,251,0.96))] p-6 shadow-[0_20px_60px_-42px_rgba(17,48,58,0.28)] md:p-7">
              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div className="max-w-2xl">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/90">Workspace overview</p>
                    <h2 className="mt-2 text-[clamp(2rem,4vw,3.1rem)] font-semibold tracking-tight text-foreground">
                      Meetings, bookings, and access points in one clean control panel.
                    </h2>
                    <p className="mt-3 max-w-xl text-sm leading-6 text-foreground/62 md:text-base">
                      Start an instant room, hand out a join link, or move into scheduling when the conversation needs a time slot.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" className="h-11 rounded-2xl border-primary/15 bg-background/85 px-4">
                      <Link href="/calendars">
                        <CalendarDays className="w-4 h-4 mr-2" />
                        Calendars
                      </Link>
                    </Button>
                    <Button asChild variant="outline" className="h-11 rounded-2xl border-primary/15 bg-background/85 px-4">
                      <Link href="/dashboard/api-docs">
                        <Code2 className="w-4 h-4 mr-2" />
                        API Docs
                      </Link>
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    { label: 'Rooms created', value: rooms.length, icon: Video },
                    { label: 'Live rooms', value: activeRooms.length, icon: Radio },
                    { label: 'Ended', value: rooms.length - activeRooms.length, icon: Users },
                  ].map((item) => (
                    <div key={item.label} className="rounded-[24px] border border-border/70 bg-background/78 p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/44">{item.label}</p>
                        <item.icon className="h-4 w-4 text-primary/85" />
                      </div>
                      <p className="mt-4 text-3xl font-semibold text-foreground">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <Card id="create-meeting" className="rounded-[30px] border-border/70 bg-card/88 p-6 shadow-[0_20px_60px_-42px_rgba(17,48,58,0.22)]">
              <div className="flex h-full flex-col gap-5">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/90">Create room</p>
                  <h3 className="mt-2 text-2xl font-semibold text-foreground">Start a meeting fast</h3>
                  <p className="mt-2 text-sm leading-6 text-foreground/62">
                    Give it a clear title and move directly into the room.
                  </p>
                </div>

                <form onSubmit={createRoom} className="flex flex-1 flex-col gap-3">
                  <Input
                    type="text"
                    placeholder="Weekly team review"
                    value={newRoomTitle}
                    onChange={(e) => setNewRoomTitle(e.target.value)}
                    className="h-12 rounded-2xl border-border/70 bg-background/72"
                  />
                  <Button
                    type="submit"
                    disabled={creating || !newRoomTitle.trim()}
                    className="h-12 rounded-2xl bg-primary px-6 text-primary-foreground hover:bg-primary/90"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    {creating ? 'Creating...' : 'New meeting'}
                  </Button>
                </form>
              </div>
            </Card>
          </section>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.9fr)]">
            <Card className="rounded-[30px] border-border/70 bg-card/90 p-6 shadow-[0_18px_50px_-40px_rgba(17,48,58,0.16)]">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/90">Recent meetings</p>
                  <h3 className="mt-2 text-2xl font-semibold text-foreground">Your rooms</h3>
                </div>
                {!loading && rooms.length > 0 ? (
                  <p className="text-sm text-foreground/52">{rooms.length} total</p>
                ) : null}
              </div>

              {loading ? (
                <div className="py-16 text-center">
                  <p className="text-foreground/60">Loading meetings...</p>
                </div>
              ) : rooms.length === 0 ? (
                <div className="rounded-[26px] border border-dashed border-border/70 bg-background/72 px-6 py-14 text-center">
                  <Video className="mx-auto mb-4 h-10 w-10 text-foreground/25" />
                  <p className="text-base font-medium text-foreground">No meetings yet</p>
                  <p className="mt-2 text-sm text-foreground/58">Create your first room to start collaborating.</p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {rooms.map((room) => (
                    <Card
                      key={room.id}
                      className="rounded-[24px] border-border/70 bg-background/80 p-5 shadow-none hover:border-primary/22 hover:-translate-y-1 hover:shadow-md transition-all duration-300"
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="mb-2 flex flex-wrap items-center gap-3">
                            <h4 className="text-lg font-semibold text-foreground">{room.title}</h4>
                            {room.ended_at ? (
                              <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                                Ended
                              </span>
                            ) : (
                              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                                Live room
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-foreground/56">
                            <div className="flex items-center gap-1.5">
                              <Clock className="w-4 h-4" />
                              {new Date(room.created_at).toLocaleDateString()}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-start lg:self-auto">
                          {!room.ended_at && (
                            <>
                              <Button
                                size="sm"
                                className="rounded-xl bg-primary px-4 text-primary-foreground hover:bg-primary/90"
                                onClick={() => joinRoom(room.id)}
                              >
                                Join
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="rounded-xl"
                                onClick={() => copyRoomLink(room.id)}
                                title="Copy room link"
                              >
                                <LinkIcon className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="sm" variant="ghost" className="rounded-xl">
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => copyRoomLink(room.id)}>
                                <Copy className="w-4 h-4 mr-2" />
                                Copy Link
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive">
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </Card>

            <div className="grid gap-5">
              <Card className="rounded-[30px] border-border/70 bg-card/88 p-6 shadow-[0_18px_50px_-40px_rgba(17,48,58,0.16)]">
                <div className="flex items-start gap-4">
                  <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                    <CalendarDays className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/90">Booking tools</p>
                    <h3 className="mt-2 text-xl font-semibold text-foreground">Scheduling workspace</h3>
                    <p className="mt-2 text-sm leading-6 text-foreground/62">
                      Manage public booking pages, disabled slots, and API-first scheduling from one place.
                    </p>
                    <div className="mt-5 grid gap-3">
                      <Button asChild variant="outline" className="h-11 justify-between rounded-2xl border-primary/15 bg-background/76 px-4">
                        <Link href="/calendars">
                          <span className="flex items-center gap-2">
                            <CalendarDays className="w-4 h-4" />
                            Manage calendars
                          </span>
                          <ArrowUpRight className="w-4 h-4" />
                        </Link>
                      </Button>
                      <Button asChild variant="outline" className="h-11 justify-between rounded-2xl border-primary/15 bg-background/76 px-4">
                        <Link href="/dashboard/api-docs">
                          <span className="flex items-center gap-2">
                            <Code2 className="w-4 h-4" />
                            Open API docs
                          </span>
                          <ArrowUpRight className="w-4 h-4" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="rounded-[30px] border-border/70 bg-card/88 p-6 shadow-[0_18px_50px_-40px_rgba(17,48,58,0.16)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/90">Operator notes</p>
                <h3 className="mt-2 text-xl font-semibold text-foreground">Keep the flow tight</h3>
                <div className="mt-4 grid gap-3 text-sm text-foreground/64">
                  <div className="rounded-[22px] border border-border/70 bg-background/76 p-4">
                    Instant rooms work best for internal calls and fast follow-ups.
                  </div>
                  <div className="rounded-[22px] border border-border/70 bg-background/76 p-4">
                    Use calendar pages when guests need a controlled self-booking flow.
                  </div>
                  <div className="rounded-[22px] border border-border/70 bg-background/76 p-4">
                    API docs are available directly in the workspace for product integrations.
                  </div>
                </div>
              </Card>

              <Card className="rounded-[30px] border-border/70 bg-card/88 p-6 shadow-[0_18px_50px_-40px_rgba(17,48,58,0.16)]">
                <div className="flex items-start gap-4">
                  <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                    <Disc3 className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/90">Recordings archive</p>
                    <h3 className="mt-2 text-xl font-semibold text-foreground">Dedicated download workspace</h3>
                    <p className="mt-2 text-sm leading-6 text-foreground/62">
                      Keep the dashboard focused on rooms and use the archive page for recorded files, status tracking, and downloads.
                    </p>

                    <div className="mt-5 grid gap-3">
                      <div className="rounded-[22px] border border-border/70 bg-background/76 p-4 text-sm text-foreground/58">
                        {recordingCount} archived recording{recordingCount === 1 ? '' : 's'} total.
                      </div>
                      <div className="rounded-[22px] border border-border/70 bg-background/76 p-4 text-sm text-foreground/58">
                        {readyRecordingCount} ready for download right now.
                      </div>
                      <Button asChild variant="outline" className="h-11 justify-between rounded-2xl border-primary/15 bg-background/82 px-4">
                        <Link href="/dashboard/recordings">
                          <span className="flex items-center gap-2">
                            <Disc3 className="h-4 w-4" />
                            Open recordings archive
                          </span>
                          <ArrowUpRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </section>

          {/* Footer */}
          <footer className="mt-16 pb-8 border-t border-border/10 pt-8 flex flex-col items-center gap-2">
            <p className="text-sm text-foreground/60 dark:text-foreground/70 text-center">
              © 2026 TSMeet. Private collaboration software for modern teams.
            </p>
            <p className="text-sm text-foreground/60 dark:text-foreground/70 text-center">
              Developed by <a href="https://tanvirsoft.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">Tanvir Ahmmed</a>
            </p>
          </footer>
        </div>
      </main>
    </UserSidebar>
  );
}
