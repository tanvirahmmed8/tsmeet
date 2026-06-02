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
  Sparkles,
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
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.95fr)]">
            <Card className="overflow-hidden rounded-[28px] border-primary/10 bg-[radial-gradient(circle_at_top_left,rgba(70,210,232,0.16),transparent_33%),linear-gradient(135deg,rgba(255,255,255,0.92),rgba(244,250,251,0.92))] p-6 shadow-[0_22px_80px_-48px_rgba(33,113,130,0.7)] dark:bg-[radial-gradient(circle_at_top_left,rgba(54,197,221,0.18),transparent_30%),linear-gradient(135deg,rgba(14,21,30,0.98),rgba(11,17,26,0.95))] md:p-8">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-2xl">
                  <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-white/65 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-primary dark:bg-white/5">
                    <Sparkles className="w-3.5 h-3.5" />
                    Collaboration workspace
                  </div>
                  <h2 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                    Build the room, invite the team, and keep your schedule in one place.
                  </h2>
                  <p className="mt-3 max-w-xl text-sm leading-6 text-foreground/65 md:text-base">
                    Launch instant meetings from the dashboard and switch to calendar booking pages when you need a polished external scheduling flow.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[320px]">
                  <div className="rounded-3xl border border-white/50 bg-white/75 p-4 dark:border-white/10 dark:bg-white/5">
                    <p className="text-xs uppercase tracking-[0.2em] text-foreground/45">Created</p>
                    <p className="mt-2 text-3xl font-semibold text-foreground">{rooms.length}</p>
                  </div>
                  <div className="rounded-3xl border border-white/50 bg-white/75 p-4 dark:border-white/10 dark:bg-white/5">
                    <p className="text-xs uppercase tracking-[0.2em] text-foreground/45">Open</p>
                    <p className="mt-2 text-3xl font-semibold text-foreground">{activeRooms.length}</p>
                  </div>
                  <div className="rounded-3xl border border-white/50 bg-white/75 p-4 dark:border-white/10 dark:bg-white/5">
                    <p className="text-xs uppercase tracking-[0.2em] text-foreground/45">Ended</p>
                    <p className="mt-2 text-3xl font-semibold text-foreground">{rooms.length - activeRooms.length}</p>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="rounded-[28px] border-primary/10 bg-card/70 p-6 backdrop-blur-sm md:p-8">
              <div className="flex h-full flex-col justify-between gap-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Booking tools</p>
                  <h3 className="mt-3 text-2xl font-semibold text-foreground">Turn availability into a shareable flow.</h3>
                  <p className="mt-3 text-sm leading-6 text-foreground/65">
                    Open your calendar workspace to manage public booking links, disabled slots, holiday blocks, and custom intake forms.
                  </p>
                </div>

                <Button asChild variant="outline" className="h-12 justify-between rounded-2xl border-primary/15 bg-background/65 px-4">
                  <Link href="/calendars">
                    <span className="flex items-center gap-2">
                      <CalendarDays className="w-4 h-4" />
                      Manage calendars
                    </span>
                    <ArrowUpRight className="w-4 h-4" />
                  </Link>
                </Button>

                <Button asChild variant="outline" className="h-12 justify-between rounded-2xl border-primary/15 bg-background/65 px-4">
                  <Link href="/dashboard/api-docs">
                    <span className="flex items-center gap-2">
                      <Code2 className="w-4 h-4" />
                      Open API docs
                    </span>
                    <ArrowUpRight className="w-4 h-4" />
                  </Link>
                </Button>
              </div>
            </Card>
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.75fr)]">
            <Card id="create-meeting" className="rounded-[28px] border-primary/10 bg-card/75 p-6 backdrop-blur-sm md:p-8">
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                  <h3 className="text-2xl font-semibold text-foreground">Start a fresh room</h3>
                  <p className="text-sm text-foreground/60">Name the meeting once and share the room link instantly.</p>
                </div>

                <form onSubmit={createRoom} className="flex flex-col gap-3 sm:flex-row">
                  <Input
                    type="text"
                    placeholder="Give your meeting a name..."
                    value={newRoomTitle}
                    onChange={(e) => setNewRoomTitle(e.target.value)}
                    className="h-12 rounded-2xl border-primary/10 bg-background/70"
                  />
                  <Button
                    type="submit"
                    disabled={creating || !newRoomTitle.trim()}
                    className="h-12 rounded-2xl bg-primary px-6 text-primary-foreground hover:bg-primary/90"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    {creating ? 'Creating...' : 'New Meeting'}
                  </Button>
                </form>
              </div>
            </Card>

            <Card className="rounded-[28px] border-primary/10 bg-card/70 p-6 backdrop-blur-sm">
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Quick notes</p>
                  <h3 className="mt-2 text-xl font-semibold text-foreground">Ready when your team is.</h3>
                </div>
                <div className="space-y-3 text-sm text-foreground/65">
                  <div className="rounded-2xl border border-border/60 bg-background/60 p-4">Create ad-hoc meetings here and move into the room immediately.</div>
                  <div className="rounded-2xl border border-border/60 bg-background/60 p-4">Use calendar pages when you need external guests to self-book.</div>
                </div>
              </div>
            </Card>
          </section>

          <section id="recent-meetings">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-2xl font-semibold text-foreground">Your meetings</h3>
                <p className="mt-1 text-sm text-foreground/60">Recent rooms stay one click away.</p>
              </div>
            </div>

            {loading ? (
              <div className="py-16 text-center">
                <p className="text-foreground/60">Loading meetings...</p>
              </div>
            ) : rooms.length === 0 ? (
              <Card className="rounded-[28px] border-primary/10 bg-card/70 p-14 text-center backdrop-blur-sm">
                <Video className="mx-auto mb-4 h-12 w-12 text-foreground/30" />
                <p className="text-foreground/60">No meetings yet. Create one to get started.</p>
              </Card>
            ) : (
              <div className="grid gap-4">
                {rooms.map((room) => (
                  <Card
                    key={room.id}
                    className="rounded-[26px] border-primary/10 bg-card/75 p-6 backdrop-blur-sm transition-all duration-300 hover:border-primary/30 hover:shadow-[0_18px_60px_-45px_rgba(34,120,138,0.7)]"
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
                        <div className="flex items-center gap-4 text-sm text-foreground/60">
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
          </section>
        </div>
      </main>
    </UserSidebar>
  );
}
