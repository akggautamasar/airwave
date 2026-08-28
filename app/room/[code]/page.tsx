'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  AirwaveMark,
  ArrowRightIcon,
  ChatIcon,
  CheckIcon,
  CopyIcon,
  HandIcon,
  LeaveIcon,
  LockIcon,
  MicIcon,
  MicOffIcon,
  PeopleIcon,
  RemoveIcon,
  SendIcon,
  SpinnerIcon,
} from '@/components/Icons';
import { Banner, Button, Field, Sheet, ThemeToggle } from '@/components/ui';
import type { PeerView } from '@/hooks/useLiveRoom';
import { useLiveRoom } from '@/hooks/useLiveRoom';
import { clearHostKey, loadHostKey, saveHostKey, useLocalIdentity } from '@/hooks/useLocalIdentity';
import { useWakeLock } from '@/hooks/useWakeLock';
import { ApiError, joinChannel, moderate, peekRoom } from '@/lib/client';
import { takeSession } from '@/lib/session';
import { LIMITS, MODE_LABEL, type PublicRoom, type Role } from '@/lib/types';

type ViewState = 'loading' | 'join' | 'connecting' | 'live' | 'not_found' | 'error';

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = (params.code ?? '').toUpperCase();

  const { ready: identityReady, name, setName, deviceId } = useLocalIdentity();
  const live = useLiveRoom();

  const [view, setView] = useState<ViewState>('loading');
  const [peek, setPeek] = useState<PublicRoom | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [unreadChat, setUnreadChat] = useState(0);
  const [chatDraft, setChatDraft] = useState('');
  const [copied, setCopied] = useState(false);
  const [roomInfo, setRoomInfo] = useState<PublicRoom | null>(null);
  const [hostKey, setHostKey] = useState<string | null>(null);
  const [modBusy, setModBusy] = useState<string | null>(null);

  const attemptedAutoConnect = useRef(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useWakeLock(view === 'live' && (live.status === 'connected' || live.status === 'reconnecting'));

  /* ---------------------------------------------------------- bootstrap --- */

  useEffect(() => {
    if (!code || attemptedAutoConnect.current) return;
    attemptedAutoConnect.current = true;

    const pending = takeSession(code);
    if (pending) {
      setHostKey(loadHostKey(code));
      setRoomInfo(pending.room);
      setView('connecting');
      live.connect(pending);
      return;
    }

    void (async () => {
      try {
        const res = await peekRoom(code);
        setPeek(res.room);
        setNeedsPassword(res.needsPassword);
        setView('join');
      } catch (err) {
        setView(err instanceof ApiError && err.code === 'not_found' ? 'not_found' : 'error');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  useEffect(() => {
    if (live.status === 'connected' || live.status === 'reconnecting') setView('live');
  }, [live.status]);

  useEffect(() => {
    if (chatOpen) {
      setUnreadChat(0);
      chatEndRef.current?.scrollIntoView({ block: 'end' });
    }
  }, [chatOpen, live.messages.length]);

  useEffect(() => {
    if (!chatOpen && live.messages.length > 0) {
      setUnreadChat((n) => n + 1);
    }
    // Runs once per new message; unreadChat itself intentionally excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.messages.length]);

  /* ---------------------------------------------------------------- join --- */

  const submitJoin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (submitting || !name.trim()) return;
      setSubmitting(true);
      setJoinError(null);
      try {
        const claimedHostKey = loadHostKey(code) ?? undefined;
        const session = await joinChannel(code, {
          displayName: name.trim(),
          password: needsPassword ? password : undefined,
          hostKey: claimedHostKey,
          deviceId,
        });
        if (session.hostKey) saveHostKey(code, session.hostKey);
        setHostKey(session.hostKey ?? claimedHostKey ?? null);
        setRoomInfo(session.room);
        setView('connecting');
        live.connect(session);
      } catch (err) {
        setJoinError(
          err instanceof ApiError ? err.message : 'Could not reach the channel. Try again.',
        );
      } finally {
        setSubmitting(false);
      }
    },
    [submitting, name, code, needsPassword, password, deviceId, live],
  );

  /* ------------------------------------------------------------- moderate --- */

  const runModeration = useCallback(
    async (targetIdentity: string, action: 'mute' | 'kick' | 'grant' | 'revoke') => {
      if (!hostKey) return;
      setModBusy(`${action}:${targetIdentity}`);
      try {
        await moderate(code, { hostKey, action, targetIdentity });
      } catch {
        // The roster will settle on its own via LiveKit events either way.
      } finally {
        setModBusy(null);
      }
    },
    [code, hostKey],
  );

  /* ----------------------------------------------------------------- leave --- */

  const leaveRoom = useCallback(() => {
    live.leave();
    clearHostKey(code);
    router.push('/');
  }, [live, code, router]);

  const copyCode = useCallback(() => {
    void navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  }, [code]);

  const displayRoom = roomInfo ?? peek;
  const isHost = live.me?.role === 'host';
  const speakerCount = live.peers.filter((p) => p.canTalk).length;

  /* ------------------------------------------------------------------- UI --- */

  if (view === 'loading') {
    return <CenteredNote icon={<SpinnerIcon className="h-5 w-5 animate-spin" />} text="Tuning in…" />;
  }

  if (view === 'not_found') {
    return (
      <CenteredNote
        icon={<AirwaveMark className="h-7 w-7 text-faint" />}
        text="That channel is not on air."
        action={<Button tone="primary" label onClick={() => router.push('/')}>Back to the lobby</Button>}
      />
    );
  }

  if (view === 'error') {
    return (
      <CenteredNote
        icon={<AirwaveMark className="h-7 w-7 text-alert" />}
        text="Could not reach the channel. Check your connection."
        action={<Button tone="primary" label onClick={() => router.push('/')}>Back to the lobby</Button>}
      />
    );
  }

  if (view === 'join') {
    return (
      <main className="flex min-h-screen-dvh items-center justify-center px-5">
        <form
          onSubmit={submitJoin}
          className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-line bg-panel p-6 shadow-panel"
        >
          <div className="flex items-center gap-2">
            <AirwaveMark className="h-6 w-6 text-signal" />
            <div>
              <h1 className="truncate text-base font-medium text-ink">
                {peek?.title ?? 'Channel'}
              </h1>
              <p className="text-2xs text-faint">
                {peek ? MODE_LABEL[peek.mode] : ''} · {code}
              </p>
            </div>
            {peek?.isPrivate ? <LockIcon className="ml-auto h-4 w-4 text-faint" /> : null}
          </div>

          <Field
            label="Your display name"
            placeholder="How you'll appear to others"
            value={name}
            maxLength={LIMITS.nameMax}
            onChange={(e) => setName(e.target.value)}
            disabled={!identityReady}
            autoFocus
          />

          {needsPassword ? (
            <Field
              label="Channel password"
              type="password"
              placeholder="Ask the host"
              value={password}
              maxLength={LIMITS.passwordMax}
              onChange={(e) => setPassword(e.target.value)}
            />
          ) : null}

          {joinError ? <Banner tone="error">{joinError}</Banner> : null}

          <Button
            type="submit"
            tone="primary"
            label
            disabled={submitting || !name.trim() || (needsPassword && password.length < 4)}
          >
            {submitting ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : <ArrowRightIcon className="h-4 w-4" />}
            Join channel
          </Button>
          <button
            type="button"
            onClick={() => router.push('/')}
            className="text-center text-xs text-faint hover:text-dim"
          >
            Back to the lobby
          </button>
        </form>
      </main>
    );
  }

  if (view === 'connecting') {
    return <CenteredNote icon={<SpinnerIcon className="h-5 w-5 animate-spin" />} text="Connecting…" />;
  }

  if (live.status === 'closed') {
    return (
      <CenteredNote
        icon={<AirwaveMark className="h-7 w-7 text-faint" />}
        text={live.endedReason ?? 'You left the channel.'}
        action={<Button tone="primary" label onClick={() => router.push('/')}>Back to the lobby</Button>}
      />
    );
  }

  /* -------------------------------------------------------------- live UI --- */

  return (
    <main className="flex min-h-screen-dvh flex-col">
      <header className="top-pad flex items-center gap-3 border-b border-line bg-panel px-4 py-3">
        <AirwaveMark className="h-5 w-5 shrink-0 text-signal" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-medium text-ink">{displayRoom?.title ?? 'Channel'}</h1>
          <div className="flex items-center gap-2 text-2xs text-faint">
            <span className="label">{displayRoom ? MODE_LABEL[displayRoom.mode] : ''}</span>
            <button
              type="button"
              onClick={copyCode}
              className="readout inline-flex items-center gap-1 text-faint hover:text-dim"
            >
              {code}
              {copied ? <CheckIcon className="h-3 w-3 text-carrier" /> : <CopyIcon className="h-3 w-3" />}
            </button>
            {live.status === 'reconnecting' ? (
              <span className="text-signal">reconnecting…</span>
            ) : null}
          </div>
        </div>
        <span className="hidden items-center gap-1.5 text-dim sm:flex">
          <PeopleIcon className="h-4 w-4" />
          <span className="readout text-xs">{live.peers.length}</span>
        </span>
        <ThemeToggle />
        <Button tone="danger" onClick={leaveRoom} aria-label="Leave channel">
          <LeaveIcon className="h-4 w-4" />
        </Button>
      </header>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4 pb-40">
        {live.error ? <Banner tone="error">{live.error}</Banner> : null}
        {live.micError ? <Banner tone="warn">{live.micError}</Banner> : null}
        {live.notice ? (
          <Banner tone="info" onDismiss={live.clearNotice}>
            {live.notice}
          </Banner>
        ) : null}
        {live.needsAudioUnlock ? (
          <Banner tone="warn">
            <button type="button" onClick={live.unlockAudio} className="underline">
              Tap to enable audio
            </button>
          </Banner>
        ) : null}

        <ul className="flex flex-col gap-2">
          {live.peers.map((peer) => (
            <PeerRow
              key={peer.identity}
              peer={peer}
              level={live.levels[peer.identity]?.level ?? 0}
              speaking={live.activeSpeakers.includes(peer.identity)}
              canModerate={isHost && !peer.isLocal}
              mode={displayRoom?.mode ?? 'open'}
              busy={modBusy}
              onMute={() => runModeration(peer.identity, 'mute')}
              onKick={() => runModeration(peer.identity, 'kick')}
              onGrant={() => runModeration(peer.identity, 'grant')}
              onRevoke={() => runModeration(peer.identity, 'revoke')}
            />
          ))}
        </ul>
      </div>

      <ControlDock
        live={live}
        isBroadcastListener={Boolean(displayRoom && displayRoom.mode === 'broadcast' && !live.canTalk)}
        chatUnread={unreadChat}
        onOpenChat={() => setChatOpen(true)}
        speakerCount={speakerCount}
      />

      <Sheet open={chatOpen} title="Chat" onClose={() => setChatOpen(false)}>
        <div className="flex h-[60vh] flex-col">
          <div className="thin-scroll flex-1 overflow-y-auto pr-1">
            {live.messages.length === 0 ? (
              <p className="py-8 text-center text-sm text-faint">No messages yet.</p>
            ) : (
              <ul className="flex flex-col gap-2.5 pb-3">
                {live.messages.map((m) => (
                  <li key={m.id} className="text-sm">
                    <span className="font-medium text-ink">{m.name}</span>{' '}
                    <span className="text-2xs text-faint">
                      {new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <p className="text-dim">{m.text}</p>
                  </li>
                ))}
              </ul>
            )}
            <div ref={chatEndRef} />
          </div>
          <form
            className="dock-pad flex gap-2 border-t border-line pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              const text = chatDraft.trim();
              if (!text) return;
              live.sendChat(text);
              setChatDraft('');
            }}
          >
            <input
              value={chatDraft}
              onChange={(e) => setChatDraft(e.target.value)}
              maxLength={LIMITS.chatMax}
              placeholder="Say something…"
              className="w-full rounded border border-line bg-base px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-carrier"
            />
            <Button type="submit" tone="primary" aria-label="Send">
              <SendIcon className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </Sheet>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* Peer row                                                                   */
/* -------------------------------------------------------------------------- */

function PeerRow({
  peer,
  level,
  speaking,
  canModerate,
  mode,
  busy,
  onMute,
  onKick,
  onGrant,
  onRevoke,
}: {
  peer: PeerView;
  level: number;
  speaking: boolean;
  canModerate: boolean;
  mode: 'open' | 'broadcast';
  busy: string | null;
  onMute: () => void;
  onKick: () => void;
  onGrant: () => void;
  onRevoke: () => void;
}) {
  const roleLabel: Record<Role, string> = { host: 'Host', speaker: 'Speaker', listener: 'Listener' };

  return (
    <li
      className={[
        'flex items-center gap-3 rounded-lg border bg-panel px-3.5 py-3 transition-colors',
        speaking ? 'border-carrier/60' : 'border-line',
      ].join(' ')}
    >
      <div
        className={[
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-sm font-medium',
          speaking ? 'border-carrier bg-carrier/15 text-carrier' : 'border-line bg-raised text-dim',
        ].join(' ')}
        style={
          peer.canTalk
            ? { boxShadow: speaking ? `0 0 0 ${Math.round(2 + level * 6)}px rgb(var(--carrier) / 0.18)` : undefined }
            : undefined
        }
      >
        {peer.name.slice(0, 1).toUpperCase()}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm text-ink">
            {peer.name}
            {peer.isLocal ? ' (you)' : ''}
          </span>
          {peer.handRaised ? <HandIcon className="h-3.5 w-3.5 shrink-0 text-signal" /> : null}
        </div>
        <span className="label text-2xs text-faint">{roleLabel[peer.role]}</span>
      </div>

      <span className={peer.canTalk ? (peer.micMuted ? 'text-faint' : 'text-carrier') : 'text-faint'}>
        {peer.canTalk ? (
          peer.micMuted ? <MicOffIcon className="h-4 w-4" /> : <MicIcon className="h-4 w-4" />
        ) : (
          <MicOffIcon className="h-4 w-4 opacity-40" />
        )}
      </span>

      {canModerate ? (
        <div className="flex shrink-0 items-center gap-1">
          {mode === 'broadcast' ? (
            peer.canTalk ? (
              <Button tone="ghost" onClick={onRevoke} disabled={busy === `revoke:${peer.identity}`}>
                Take mic
              </Button>
            ) : (
              <Button tone="ghost" onClick={onGrant} disabled={busy === `grant:${peer.identity}`}>
                Give mic
              </Button>
            )
          ) : null}
          {peer.canTalk && !peer.micMuted ? (
            <Button
              tone="ghost"
              onClick={onMute}
              aria-label="Mute"
              disabled={busy === `mute:${peer.identity}`}
            >
              <MicOffIcon className="h-4 w-4" />
            </Button>
          ) : null}
          <Button
            tone="danger"
            onClick={onKick}
            aria-label="Remove"
            disabled={busy === `kick:${peer.identity}`}
          >
            <RemoveIcon className="h-4 w-4" />
          </Button>
        </div>
      ) : null}
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/* Control dock                                                              */
/* -------------------------------------------------------------------------- */

function ControlDock({
  live,
  isBroadcastListener,
  chatUnread,
  onOpenChat,
  speakerCount,
}: {
  live: ReturnType<typeof useLiveRoom>;
  isBroadcastListener: boolean;
  chatUnread: number;
  onOpenChat: () => void;
  speakerCount: number;
}) {
  const pressingRef = useRef(false);

  const onPressStart = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      if (pressingRef.current || live.openMic) return;
      pressingRef.current = true;
      live.startTalking();
    },
    [live],
  );

  const onPressEnd = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      if (!pressingRef.current) return;
      pressingRef.current = false;
      live.stopTalking();
    },
    [live],
  );

  return (
    <div className="dock-pad fixed inset-x-0 bottom-0 border-t border-line bg-panel/95 px-4 pt-3 backdrop-blur">
      <div className="mx-auto flex w-full max-w-2xl items-center gap-3">
        {live.canTalk ? (
          <>
            <button
              type="button"
              onPointerDown={onPressStart}
              onPointerUp={onPressEnd}
              onPointerLeave={onPressEnd}
              onPointerCancel={onPressEnd}
              disabled={live.openMic}
              className={[
                'ptt-surface flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 transition-all',
                live.micLive
                  ? 'border-signal bg-signal text-on-signal shadow-key-down scale-95'
                  : 'border-line bg-raised text-dim shadow-key',
                live.openMic ? 'opacity-60' : '',
              ].join(' ')}
              aria-label="Push to talk"
            >
              {live.micLive ? <MicIcon className="h-6 w-6" /> : <MicOffIcon className="h-6 w-6" />}
            </button>

            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="label text-2xs text-faint">
                {live.openMic ? 'On air — mic stays live' : 'Hold to talk'}
              </span>
              <label className="flex items-center gap-2 text-xs text-dim">
                <input
                  type="checkbox"
                  checked={live.openMic}
                  onChange={(e) => live.setOpenMic(e.target.checked)}
                  className="h-3.5 w-3.5 accent-signal"
                />
                Stay unmuted
              </label>
            </div>
          </>
        ) : isBroadcastListener ? (
          <Button
            tone={live.me?.handRaised ? 'primary' : 'quiet'}
            label
            className="flex-1"
            onClick={() => live.raiseHand(!live.me?.handRaised)}
          >
            <HandIcon className="h-4 w-4" />
            {live.me?.handRaised ? 'Hand raised' : 'Raise hand'}
          </Button>
        ) : (
          <div className="flex-1 text-xs text-faint">Listening · {speakerCount} on the mic</div>
        )}

        <Button tone="quiet" onClick={onOpenChat} aria-label="Open chat" className="relative">
          <ChatIcon className="h-5 w-5" />
          {chatUnread > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-signal px-1 text-[0.6rem] font-semibold text-on-signal">
              {chatUnread > 9 ? '9+' : chatUnread}
            </span>
          ) : null}
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Centered note (loading / error states)                                    */
/* -------------------------------------------------------------------------- */

function CenteredNote({
  icon,
  text,
  action,
}: {
  icon: React.ReactNode;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      {icon}
      <p className="max-w-xs text-sm text-dim">{text}</p>
      {action}
    </main>
  );
}
