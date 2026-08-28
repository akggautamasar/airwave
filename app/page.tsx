'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AirwaveMark,
  ArrowRightIcon,
  LockIcon,
  PeopleIcon,
  PlusIcon,
  SpinnerIcon,
} from '@/components/Icons';
import { Banner, Button, Eyebrow, Field, Readout, Sheet, ThemeToggle } from '@/components/ui';
import { saveHostKey, useLocalIdentity } from '@/hooks/useLocalIdentity';
import { ApiError, joinChannel, listRooms, openChannel, peekRoom } from '@/lib/client';
import { stashSession } from '@/lib/session';
import {
  LIMITS,
  MODE_HINT,
  MODE_LABEL,
  type PublicRoom,
  type RoomMode,
  type SessionResponse,
} from '@/lib/types';

const POLL_MS = 4000;

export default function LobbyPage() {
  const router = useRouter();
  const { ready, name, setName, deviceId } = useLocalIdentity();

  const [rooms, setRooms] = useState<PublicRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinRoom, setJoinRoom] = useState<PublicRoom | null>(null);
  const [joinCodeDraft, setJoinCodeDraft] = useState('');

  const refresh = useCallback(async () => {
    try {
      const res = await listRooms();
      setRooms(res.rooms);
      setListError(null);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'Could not reach the lobby.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  const enterChannel = useCallback(
    async (code: string, password?: string) => {
      const displayName = name.trim();
      const session = await joinChannel(code, {
        displayName,
        password,
        deviceId,
      });
      if (session.hostKey) saveHostKey(code, session.hostKey);
      stashSession(code, session);
      router.push(`/room/${code}`);
    },
    [name, deviceId, router],
  );

  const openJoinSheet = useCallback(
    async (codeRaw: string) => {
      const code = codeRaw.trim().toUpperCase();
      if (code.length < 4) return;
      try {
        const peek = await peekRoom(code);
        setJoinRoom({ ...peek.room, code });
        setJoinOpen(true);
      } catch (err) {
        setListError(
          err instanceof ApiError ? err.message : 'That channel could not be found.',
        );
      }
    },
    [],
  );

  return (
    <main className="min-h-screen-dvh top-pad">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-5 pb-24 pt-8 sm:pt-14">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <AirwaveMark className="h-7 w-7 text-signal" />
            <div>
              <h1 className="label text-lg tracking-wordmark text-ink">AIRWAVE</h1>
              <p className="text-xs text-faint">No accounts. Nothing saved. Just talk.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.push('/ipchat')}
              className="text-xs text-faint hover:text-dim"
            >
              IP Chat
            </button>
            <ThemeToggle />
          </div>
        </header>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="flex flex-col items-start gap-3 rounded-lg border border-line bg-panel p-5 text-left shadow-panel transition-colors hover:border-signal/60"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded bg-signal text-on-signal">
              <PlusIcon className="h-5 w-5" />
            </span>
            <span className="label text-sm text-ink">Open a channel</span>
            <span className="text-xs text-faint">
              Start broadcasting or open a floor for group chat.
            </span>
          </button>

          <div className="flex flex-col gap-3 rounded-lg border border-line bg-panel p-5 shadow-panel">
            <span className="flex h-10 w-10 items-center justify-center rounded bg-raised text-carrier">
              <ArrowRightIcon className="h-5 w-5" />
            </span>
            <span className="label text-sm text-ink">Tune in by code</span>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void openJoinSheet(joinCodeDraft);
              }}
            >
              <input
                value={joinCodeDraft}
                onChange={(e) => setJoinCodeDraft(e.target.value.toUpperCase())}
                placeholder="K7M4Q2"
                maxLength={8}
                aria-label="Channel code"
                className="readout w-full min-w-0 rounded border border-line bg-base px-3 py-2 uppercase tracking-[0.3em] text-ink placeholder:tracking-[0.3em] placeholder:text-faint focus:border-carrier"
              />
              <Button type="submit" tone="quiet" aria-label="Tune in">
                <ArrowRightIcon className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Eyebrow>On air now</Eyebrow>
            {loading ? <SpinnerIcon className="h-3.5 w-3.5 animate-spin text-faint" /> : null}
          </div>

          {listError ? <Banner tone="error">{listError}</Banner> : null}

          {!loading && rooms.length === 0 && !listError ? (
            <div className="rounded-lg border border-dashed border-line px-5 py-10 text-center">
              <p className="text-sm text-dim">Nothing on air right now.</p>
              <p className="mt-1 text-xs text-faint">Open a channel and be the first signal.</p>
            </div>
          ) : null}

          <ul className="flex flex-col gap-2">
            {rooms.map((room) => (
              <li key={room.code}>
                <button
                  type="button"
                  onClick={() => {
                    setJoinRoom(room);
                    setJoinOpen(true);
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-line bg-panel px-4 py-3.5 text-left transition-colors hover:border-carrier/60"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-ink">{room.title}</span>
                      {room.isPrivate ? <LockIcon className="h-3.5 w-3.5 shrink-0 text-faint" /> : null}
                    </div>
                    <div className="flex items-center gap-2 text-2xs text-faint">
                      <span className="label">{MODE_LABEL[room.mode]}</span>
                      <span className="readout text-faint">{room.code}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="flex items-center gap-1.5 text-dim">
                      <PeopleIcon className="h-4 w-4" />
                      <Readout value={room.participants} unit="" />
                    </span>
                    <span className="hidden items-center gap-1.5 text-carrier sm:flex">
                      <span className="h-1.5 w-1.5 animate-lamp rounded-full bg-carrier" />
                      <Readout value={room.speakers} unit="live" tone="carrier" />
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <CreateSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        name={name}
        setName={setName}
        deviceId={deviceId}
        nameReady={ready}
        onCreated={(code, session) => {
          if (session.hostKey) saveHostKey(code, session.hostKey);
          stashSession(code, session);
          router.push(`/room/${code}`);
        }}
      />

      <JoinSheet
        open={joinOpen}
        room={joinRoom}
        name={name}
        setName={setName}
        nameReady={ready}
        onClose={() => setJoinOpen(false)}
        onSubmit={enterChannel}
      />
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* Create sheet                                                               */
/* -------------------------------------------------------------------------- */

function CreateSheet({
  open,
  onClose,
  name,
  setName,
  deviceId,
  nameReady,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  setName: (v: string) => void;
  deviceId: string;
  nameReady: boolean;
  onCreated: (code: string, session: SessionResponse) => void;
}) {
  const [title, setTitle] = useState('');
  const [mode, setMode] = useState<RoomMode>('open');
  const [isPrivate, setIsPrivate] = useState(false);
  const [password, setPassword] = useState('');
  const [unlisted, setUnlisted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(
    () =>
      title.trim().length > 0 &&
      name.trim().length > 0 &&
      (!isPrivate || password.length >= 4),
    [title, name, isPrivate, password],
  );

  useEffect(() => {
    if (!open) {
      setTitle('');
      setMode('open');
      setIsPrivate(false);
      setPassword('');
      setUnlisted(false);
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const session = await openChannel({
        title: title.trim(),
        displayName: name.trim(),
        mode,
        isPrivate,
        unlisted,
        password: isPrivate ? password : undefined,
        deviceId,
      });
      onCreated(session.room.code, session);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not open the channel.');
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} title="Open a channel" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4 pb-6">
        <Field
          label="Channel name"
          placeholder="Late night radio"
          value={title}
          maxLength={LIMITS.titleMax}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
        <Field
          label="Your display name"
          placeholder="How you'll appear to others"
          value={name}
          maxLength={LIMITS.nameMax}
          onChange={(e) => setName(e.target.value)}
          disabled={!nameReady}
        />

        <div className="flex flex-col gap-1.5">
          <span className="label text-2xs text-dim">Mode</span>
          <div className="grid grid-cols-2 gap-2">
            {(['open', 'broadcast'] as RoomMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={[
                  'rounded border px-3 py-2.5 text-left transition-colors',
                  mode === m ? 'border-signal bg-signal/10' : 'border-line hover:border-dim',
                ].join(' ')}
              >
                <span className="label block text-xs text-ink">{MODE_LABEL[m]}</span>
                <span className="mt-0.5 block text-2xs text-faint">{MODE_HINT[m]}</span>
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center justify-between rounded border border-line px-3 py-2.5">
          <span className="text-sm text-ink">Password protect</span>
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
            className="h-4 w-4 accent-signal"
          />
        </label>
        {isPrivate ? (
          <Field
            label="Password"
            type="text"
            placeholder="4+ characters"
            value={password}
            maxLength={LIMITS.passwordMax}
            onChange={(e) => setPassword(e.target.value)}
          />
        ) : null}

        <label className="flex items-center justify-between rounded border border-line px-3 py-2.5">
          <span className="text-sm text-ink">Unlisted (code only)</span>
          <input
            type="checkbox"
            checked={unlisted}
            onChange={(e) => setUnlisted(e.target.checked)}
            className="h-4 w-4 accent-signal"
          />
        </label>

        {error ? <Banner tone="error">{error}</Banner> : null}

        <Button type="submit" tone="primary" label disabled={!canSubmit || submitting}>
          {submitting ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : null}
          Go live
        </Button>
      </form>
    </Sheet>
  );
}

/* -------------------------------------------------------------------------- */
/* Join sheet                                                                 */
/* -------------------------------------------------------------------------- */

function JoinSheet({
  open,
  room,
  name,
  setName,
  nameReady,
  onClose,
  onSubmit,
}: {
  open: boolean;
  room: (PublicRoom & { code: string }) | null;
  name: string;
  setName: (v: string) => void;
  nameReady: boolean;
  onClose: () => void;
  onSubmit: (code: string, password?: string) => Promise<void>;
}) {
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setPassword('');
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  if (!room) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(room.code, room.isPrivate ? password : undefined);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not join that channel.');
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} title={room.title} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4 pb-6">
        <div className="flex items-center gap-3 rounded border border-line px-3 py-2.5">
          <span className="label text-2xs text-faint">Mode</span>
          <span className="text-sm text-ink">{MODE_LABEL[room.mode]}</span>
          <span className="ml-auto readout text-xs text-faint">{room.code}</span>
        </div>

        <Field
          label="Your display name"
          placeholder="How you'll appear to others"
          value={name}
          maxLength={LIMITS.nameMax}
          onChange={(e) => setName(e.target.value)}
          disabled={!nameReady}
          autoFocus
        />

        {room.isPrivate ? (
          <Field
            label="Channel password"
            type="password"
            placeholder="Ask the host"
            value={password}
            maxLength={LIMITS.passwordMax}
            onChange={(e) => setPassword(e.target.value)}
          />
        ) : null}

        {error ? <Banner tone="error">{error}</Banner> : null}

        <Button
          type="submit"
          tone="primary"
          label
          disabled={!name.trim() || submitting || (room.isPrivate && password.length < 4)}
        >
          {submitting ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : null}
          Join channel
        </Button>
      </form>
    </Sheet>
  );
}
