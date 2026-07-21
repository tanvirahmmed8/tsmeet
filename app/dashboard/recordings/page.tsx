'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowUpRight, Disc3, Download, FileAudio, Film, RefreshCw, Search, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { UserSidebar, UserSidebarHeader } from '@/components/dashboard/user-sidebar';
import { Input } from '@/components/ui/input';

interface Recording {
  id: string;
  room_id: string;
  room_title?: string | null;
  status: string;
  started_at: string;
  completed_at?: string | null;
  video_path?: string | null;
  audio_path?: string | null;
}

function formatDate(value?: string | null) {
  if (!value) return 'In progress';
  return new Date(value).toLocaleString();
}

export default function RecordingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ready' | 'recording' | 'paused' | 'stopping' | 'failed'>('all');
  const [page, setPage] = useState(1);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const userData = localStorage.getItem('user');

    if (!userData) {
      router.push('/auth/login');
      return;
    }

    setUser(JSON.parse(userData));
    void loadRecordings();
  }, [router]);

  const logoutToLogin = (message?: string) => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    if (message) setError(message);
    router.push('/auth/login');
  };

  const loadRecordings = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError('');

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
      setRecordings(Array.isArray(data) ? data : []);
    } catch (fetchError) {
      console.error('Error loading recordings:', fetchError);
      setError('Failed to load recordings. Is the backend running on port 3002?');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const downloadRecording = async (recordingId: string, kind: 'video' | 'audio') => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/recordings/${recordingId}/${kind}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || `Failed to download ${kind} recording`);
        return;
      }

      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition') || '';
      const fileNameMatch = disposition.match(/filename="([^"]+)"/i);
      const fileName = fileNameMatch?.[1] || `${recordingId}-${kind}.webm`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      console.error(`Error downloading ${kind} recording:`, downloadError);
      setError(`Failed to download ${kind} recording`);
    }
  };

  const deleteRecording = async (recordingId: string) => {
    const confirmed = window.confirm('Delete this recording and remove its saved files?');
    if (!confirmed) return;

    try {
      setDeletingId(recordingId);
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/recordings/${recordingId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || 'Failed to delete recording');
        return;
      }

      setRecordings((current) => current.filter((recording) => recording.id !== recordingId));
    } catch (deleteError) {
      console.error('Error deleting recording:', deleteError);
      setError('Failed to delete recording');
    } finally {
      setDeletingId(null);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.push('/');
  };

  const readyCount = useMemo(
    () => recordings.filter((recording) => recording.status === 'ready').length,
    [recordings]
  );
  const failedCount = useMemo(
    () => recordings.filter((recording) => recording.status === 'failed').length,
    [recordings]
  );
  const filteredRecordings = useMemo(() => {
    const query = search.trim().toLowerCase();
    return recordings.filter((recording) => {
      const statusMatches = statusFilter === 'all' ? true : recording.status === statusFilter;
      const title = `${recording.room_title || ''} ${recording.id} ${recording.room_id}`.toLowerCase();
      const queryMatches = query ? title.includes(query) : true;
      return statusMatches && queryMatches;
    });
  }, [recordings, search, statusFilter]);
  const pageSize = 8;
  const totalPages = Math.max(1, Math.ceil(filteredRecordings.length / pageSize));
  const pagedRecordings = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRecordings.slice(start, start + pageSize);
  }, [filteredRecordings, page]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  if (!user) return null;

  return (
    <UserSidebar user={user} onLogout={handleLogout}>
      <UserSidebarHeader title="Recordings" eyebrow="Archive" />

      {error ? (
        <div className="px-4 pt-4 md:px-6">
          <div className="rounded-2xl border border-destructive/20 bg-destructive/10 p-3">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        </div>
      ) : null}

      <main className="flex-1 px-4 py-6 md:px-6 md:py-8">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_360px]">
            <Card className="rounded-[30px] border-border/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(246,250,251,0.96))] p-6 shadow-[0_20px_60px_-42px_rgba(17,48,58,0.28)] md:p-7">
              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div className="max-w-2xl">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/90">Meeting archive</p>
                    <h2 className="mt-2 text-[clamp(2rem,4vw,3rem)] font-semibold tracking-tight text-foreground">
                      Server-saved recordings, ready for download.
                    </h2>
                    <p className="mt-3 max-w-xl text-sm leading-6 text-foreground/62 md:text-base">
                      Recorder workers publish video and audio files here after sessions complete. Use this page as the single archive for meeting output.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      className="h-11 rounded-2xl border-primary/15 bg-background/85 px-4"
                      onClick={() => void loadRecordings(true)}
                      disabled={refreshing}
                    >
                      <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                      Refresh
                    </Button>
                    <Button asChild variant="outline" className="h-11 rounded-2xl border-primary/15 bg-background/85 px-4">
                      <Link href="/dashboard">
                        Back to dashboard
                        <ArrowUpRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[24px] border border-border/70 bg-background/78 p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/44">Total</p>
                      <Disc3 className="h-4 w-4 text-primary/85" />
                    </div>
                    <p className="mt-4 text-3xl font-semibold text-foreground">{recordings.length}</p>
                  </div>
                  <div className="rounded-[24px] border border-border/70 bg-background/78 p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/44">Ready</p>
                      <Film className="h-4 w-4 text-primary/85" />
                    </div>
                    <p className="mt-4 text-3xl font-semibold text-foreground">{readyCount}</p>
                  </div>
                  <div className="rounded-[24px] border border-border/70 bg-background/78 p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/44">Pending</p>
                      <FileAudio className="h-4 w-4 text-primary/85" />
                    </div>
                    <p className="mt-4 text-3xl font-semibold text-foreground">{recordings.length - readyCount}</p>
                  </div>
                  <div className="rounded-[24px] border border-border/70 bg-background/78 p-4 sm:col-span-3 xl:hidden">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/44">Failed</p>
                      <Trash2 className="h-4 w-4 text-primary/85" />
                    </div>
                    <p className="mt-4 text-3xl font-semibold text-foreground">{failedCount}</p>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="rounded-[30px] border-border/70 bg-card/88 p-6 shadow-[0_20px_60px_-42px_rgba(17,48,58,0.22)]">
              <div className="flex h-full flex-col gap-5">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/90">Archive rules</p>
                  <h3 className="mt-2 text-2xl font-semibold text-foreground">How files appear</h3>
                  <p className="mt-2 text-sm leading-6 text-foreground/62">
                    Recordings show up here after the recorder worker uploads artifacts and marks the session complete.
                  </p>
                </div>

                <div className="grid gap-3 text-sm text-foreground/62">
                  <div className="rounded-[22px] border border-border/70 bg-background/76 p-4">
                    `ready` means both archive metadata and downloadable files are available.
                  </div>
                  <div className="rounded-[22px] border border-border/70 bg-background/76 p-4">
                    `recording`, `paused`, and `stopping` indicate the worker is still processing the session.
                  </div>
                  <div className="rounded-[22px] border border-border/70 bg-background/76 p-4">
                    `failed` means the worker or upload pipeline did not complete cleanly.
                  </div>
                  <div className="rounded-[22px] border border-border/70 bg-background/76 p-4">
                    Failed archive count: <span className="font-medium text-foreground">{failedCount}</span>
                  </div>
                </div>
              </div>
            </Card>
          </section>

          <section>
            <Card className="rounded-[30px] border-border/70 bg-card/90 p-6 shadow-[0_18px_50px_-40px_rgba(17,48,58,0.16)]">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/90">Files</p>
                  <h3 className="mt-2 text-2xl font-semibold text-foreground">All recordings</h3>
                </div>
                {!loading ? (
                  <p className="text-sm text-foreground/52">{filteredRecordings.length} filtered</p>
                ) : null}
              </div>

              <div className="mb-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search by room title, meeting id, or room id"
                    className="h-11 rounded-2xl border-border/70 bg-background/76 pl-10"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
                  className="h-11 rounded-2xl border border-border/70 bg-background/76 px-3 text-sm text-foreground outline-none"
                >
                  <option value="all">All statuses</option>
                  <option value="ready">Ready</option>
                  <option value="recording">Recording</option>
                  <option value="paused">Paused</option>
                  <option value="stopping">Stopping</option>
                  <option value="failed">Failed</option>
                </select>
              </div>

              {loading ? (
                <div className="py-16 text-center">
                  <p className="text-foreground/60">Loading recordings...</p>
                </div>
              ) : filteredRecordings.length === 0 ? (
                <div className="rounded-[26px] border border-dashed border-border/70 bg-background/72 px-6 py-14 text-center">
                  <Disc3 className="mx-auto mb-4 h-10 w-10 text-foreground/25" />
                  <p className="text-base font-medium text-foreground">No recordings match this view</p>
                  <p className="mt-2 text-sm text-foreground/55">
                    Adjust the search or status filter, or wait for the recorder worker to finish processing sessions.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pagedRecordings.map((recording) => {
                    const canDownloadVideo = recording.status === 'ready' && Boolean(recording.video_path);
                    const canDownloadAudio = recording.status === 'ready' && Boolean(recording.audio_path);

                    return (
                      <div
                        key={recording.id}
                        className="rounded-[24px] border border-border/70 bg-background/76 px-4 py-4 md:px-5"
                      >
                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                          <div className="min-w-0">
                            <p className="text-base font-semibold text-foreground">
                              {recording.room_title || `Meeting ${recording.room_id.slice(0, 8)}`}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-foreground/58">
                              <span>Started: {formatDate(recording.started_at)}</span>
                              <span>Completed: {formatDate(recording.completed_at)}</span>
                              <span>ID: {recording.id.slice(0, 8)}</span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                              {recording.status}
                            </span>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-10 rounded-2xl border-red-400/20 bg-background/82 text-red-600 hover:bg-red-500/10 hover:text-red-600"
                              disabled={deletingId === recording.id}
                              onClick={() => void deleteRecording(recording.id)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              {deletingId === recording.id ? 'Deleting...' : 'Delete'}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-10 rounded-2xl border-primary/15 bg-background/82"
                              disabled={!canDownloadVideo}
                              onClick={() => downloadRecording(recording.id, 'video')}
                            >
                              <Download className="mr-2 h-4 w-4" />
                              Video
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-10 rounded-2xl border-primary/15 bg-background/82"
                              disabled={!canDownloadAudio}
                              onClick={() => downloadRecording(recording.id, 'audio')}
                            >
                              <Download className="mr-2 h-4 w-4" />
                              Audio
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {!loading && filteredRecordings.length > pageSize ? (
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-5">
                  <p className="text-sm text-foreground/52">
                    Page {page} of {totalPages}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-10 rounded-2xl border-primary/15 bg-background/82"
                      disabled={page <= 1}
                      onClick={() => setPage((current) => Math.max(1, current - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-10 rounded-2xl border-primary/15 bg-background/82"
                      disabled={page >= totalPages}
                      onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              ) : null}
            </Card>
          </section>
        </div>
      </main>
    </UserSidebar>
  );
}
