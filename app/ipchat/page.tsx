'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AirwaveMark, CheckIcon, CopyIcon, SendIcon, SpinnerIcon } from '@/components/Icons';
import { Banner, Button, Eyebrow, ThemeToggle } from '@/components/ui';
import { ApiError, myIp, readIpThread, sendIpChat } from '@/lib/client';
import { LIMITS, type IpChatMessage } from '@/lib/types';

const OWN_POLL_MS = 4000;
const WATCH_POLL_MS = 3000;

function timeLabel(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function IpChatPage() {
  const router = useRouter();

  /* --------------------------------------------------------- your thread --- */
  const [ownIp, setOwnIp] = useState<string | null>(null);
  const [ownIpError, setOwnIpError] = useState<string | null>(null);
  const [ownMessages, setOwnMessages] = useState<IpChatMessage[]>([]);
  const [copied, setCopied] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  /* ------------------------------------------------------- looked-up ip --- */
  const [watchDraft, setWatchDraft] = useState('');
  const [watchTarget, setWatchTarget] = useState<string | null>(null);
  const [watchMessages, setWatchMessages] = useState<IpChatMessage[]>([]);
  const [watchLoading, setWatchLoading] = useState(false);
  const [watchError, setWatchError] = useState<string | null>(null);

  const ownEndRef = useRef<HTMLDivElement | null>(null);
  const watchEndRef = useRef<HTMLDivElement | null>(null);

  /* Resolve and then keep polling your own address's inbox. */
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const res = await myIp();
        if (cancelled) return;
        setOwnIp(res.ip);
      } catch (err) {
        if (cancelled) return;
        setOwnIpError(err instanceof ApiError ? err.message : 'Could not detect your address.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ownIp) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await readIpThread(ownIp);
        if (!cancelled) setOwnMessages(res.messages);
      } catch {
        // Transient — the next tick will retry.
      }
    };

    void poll();
    const id = window.setInterval(() => void poll(), OWN_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [ownIp]);

  useEffect(() => {
    ownEndRef.current?.scrollIntoView({ block: 'end' });
  }, [ownMessages.length]);

  /* Poll whatever address is currently being watched. */
  useEffect(() => {
    if (!watchTarget) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await readIpThread(watchTarget);
        if (cancelled) return;
        setWatchMessages(res.messages);
        setWatchError(null);
      } catch (err) {
        if (!cancelled) {
          setWatchError(err instanceof ApiError ? err.message : 'Could not reach that address.');
        }
      } finally {
        if (!cancelled) setWatchLoading(false);
      }
    };

    setWatchLoading(true);
    void poll();
    const id = window.setInterval(() => void poll(), WATCH_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [watchTarget]);

  useEffect(() => {
    watchEndRef.current?.scrollIntoView({ block: 'end' });
  }, [watchMessages.length]);

  const copyOwnIp = useCallback(() => {
    if (!ownIp) return;
    void navigator.clipboard?.writeText(ownIp).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  }, [ownIp]);

  const submitSend = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const text = draft.trim();
      if (!text || sending) return;
      setSending(true);
      setSendError(null);
      try {
        const res = await sendIpChat(text);
        setOwnMessages(res.messages);
        setDraft('');
      } catch (err) {
        setSendError(err instanceof ApiError ? err.message : 'Could not send. Try again.');
      } finally {
        setSending(false);
      }
    },
    [draft, sending],
  );

  const submitWatch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const target = watchDraft.trim();
      if (!target) return;
      setWatchMessages([]);
      setWatchError(null);
      setWatchTarget(target);
    },
    [watchDraft],
  );

  return (
    <main className="mx-auto flex min-h-screen-dvh w-full max-w-2xl flex-col gap-6 px-5 py-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AirwaveMark className="h-6 w-6 text-signal" />
          <div>
            <h1 className="text-base font-medium text-ink">IP Chat</h1>
            <p className="text-2xs text-faint">No room code — just an address</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => router.push('/')}
            className="text-xs text-faint hover:text-dim"
          >
            Lobby
          </button>
        </div>
      </header>

      <Banner tone="info">
        Messages you send here are posted under your own IP address, in the open — anyone who
        enters that address can read and reply to them. If you share a network (wifi, office,
        phone carrier) with other people, they may share your public IP too and see the same
        thread. Treat this like a public noticeboard, not a private chat.
      </Banner>

      {/* ---------------------------------------------------- your address --- */}
      <section className="flex flex-col gap-3 rounded-lg border border-line bg-panel p-4">
        <Eyebrow>Your address</Eyebrow>

        {ownIpError ? (
          <Banner tone="error">{ownIpError}</Banner>
        ) : ownIp ? (
          <button
            type="button"
            onClick={copyOwnIp}
            className="readout inline-flex w-fit items-center gap-2 rounded border border-line bg-base px-3 py-2 text-sm text-ink hover:border-dim"
          >
            {ownIp}
            {copied ? (
              <CheckIcon className="h-3.5 w-3.5 text-carrier" />
            ) : (
              <CopyIcon className="h-3.5 w-3.5 text-faint" />
            )}
          </button>
        ) : (
          <span className="inline-flex items-center gap-2 text-sm text-faint">
            <SpinnerIcon className="h-4 w-4 animate-spin" />
            Detecting…
          </span>
        )}
        <p className="text-xs text-faint">
          Share this with someone so they can look up what you post below.
        </p>

        <div className="thin-scroll flex max-h-64 flex-col gap-2 overflow-y-auto pt-1">
          {ownMessages.length === 0 ? (
            <p className="py-4 text-center text-sm text-faint">Nothing sent yet.</p>
          ) : (
            ownMessages.map((m) => (
              <div key={m.id} className="rounded border border-line bg-base px-3 py-2 text-sm">
                <p className="text-ink">{m.text}</p>
                <span className="text-2xs text-faint">{timeLabel(m.ts)}</span>
              </div>
            ))
          )}
          <div ref={ownEndRef} />
        </div>

        <form className="flex gap-2 pt-1" onSubmit={submitSend}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={LIMITS.chatMax}
            placeholder="Post to your address…"
            disabled={!ownIp}
            className="w-full rounded border border-line bg-base px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-carrier"
          />
          <Button type="submit" tone="primary" disabled={!ownIp || sending} aria-label="Send">
            {sending ? (
              <SpinnerIcon className="h-4 w-4 animate-spin" />
            ) : (
              <SendIcon className="h-4 w-4" />
            )}
          </Button>
        </form>
        {sendError ? <Banner tone="error">{sendError}</Banner> : null}
      </section>

      {/* ------------------------------------------------------- look up --- */}
      <section className="flex flex-col gap-3 rounded-lg border border-line bg-panel p-4">
        <Eyebrow>Look up an address</Eyebrow>

        <form className="flex gap-2" onSubmit={submitWatch}>
          <input
            value={watchDraft}
            onChange={(e) => setWatchDraft(e.target.value)}
            placeholder="Enter their IP address…"
            className="readout w-full rounded border border-line bg-base px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-carrier"
          />
          <Button type="submit" tone="quiet" label>
            View
          </Button>
        </form>

        {watchTarget ? (
          <>
            <p className="readout text-2xs text-faint">Watching {watchTarget}</p>
            {watchError ? <Banner tone="error">{watchError}</Banner> : null}
            <div className="thin-scroll flex max-h-72 flex-col gap-2 overflow-y-auto">
              {watchLoading ? (
                <span className="inline-flex items-center gap-2 py-4 text-sm text-faint">
                  <SpinnerIcon className="h-4 w-4 animate-spin" />
                  Loading…
                </span>
              ) : watchMessages.length === 0 ? (
                <p className="py-4 text-center text-sm text-faint">
                  Nothing posted from that address yet.
                </p>
              ) : (
                watchMessages.map((m) => (
                  <div key={m.id} className="rounded border border-line bg-base px-3 py-2 text-sm">
                    <p className="text-ink">{m.text}</p>
                    <span className="text-2xs text-faint">{timeLabel(m.ts)}</span>
                  </div>
                ))
              )}
              <div ref={watchEndRef} />
            </div>
          </>
        ) : (
          <p className="text-xs text-faint">
            Ask the other person for the address shown at the top of their screen.
          </p>
        )}
      </section>
    </main>
  );
}
