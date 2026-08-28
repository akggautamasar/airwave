'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AirwaveMark,
  CheckIcon,
  CloseIcon,
  CopyIcon,
  SendIcon,
  SpinnerIcon,
} from '@/components/Icons';
import { Banner, Button, Eyebrow, Field, ThemeToggle } from '@/components/ui';
import { ApiError, myIp, readIpThread, sendIpChat } from '@/lib/client';
import { LIMITS, type IpChatMessage } from '@/lib/types';

const POLL_MS = 2500;

interface Connection {
  targetIp: string;
  passphrase: string;
}

function timeLabel(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function IpChatPage() {
  const router = useRouter();

  const [ownIp, setOwnIp] = useState<string | null>(null);
  const [ownIpError, setOwnIpError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [targetDraft, setTargetDraft] = useState('');
  const [passDraft, setPassDraft] = useState('');
  const [connectError, setConnectError] = useState<string | null>(null);

  const [connection, setConnection] = useState<Connection | null>(null);
  const [messages, setMessages] = useState<IpChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const endRef = useRef<HTMLDivElement | null>(null);

  /* Resolve your own address once, so you have something to share. */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await myIp();
        if (!cancelled) setOwnIp(res.ip);
      } catch (err) {
        if (!cancelled) {
          setOwnIpError(err instanceof ApiError ? err.message : 'Could not detect your address.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* Poll the active conversation. */
  useEffect(() => {
    if (!connection) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await readIpThread(connection.targetIp, connection.passphrase);
        if (cancelled) return;
        setMessages(res.messages);
        setChatError(null);
      } catch (err) {
        if (!cancelled) {
          setChatError(err instanceof ApiError ? err.message : 'Lost connection. Retrying…');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    setLoading(true);
    void poll();
    const id = window.setInterval(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [connection]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const copyOwnIp = useCallback(() => {
    if (!ownIp) return;
    void navigator.clipboard?.writeText(ownIp).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  }, [ownIp]);

  const connect = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const targetIp = targetDraft.trim();
      const pass = passDraft.trim();
      if (!targetIp) {
        setConnectError('Enter the IP address you want to chat with.');
        return;
      }
      if (ownIp && targetIp.toLowerCase() === ownIp.toLowerCase()) {
        setConnectError("That's your own address.");
        return;
      }
      if (pass && pass.length < LIMITS.ipChatPassphraseMin) {
        setConnectError(`Passphrase must be blank or at least ${LIMITS.ipChatPassphraseMin} characters.`);
        return;
      }
      setConnectError(null);
      setMessages([]);
      setChatError(null);
      setConnection({ targetIp, passphrase: pass });
    },
    [targetDraft, passDraft, ownIp],
  );

  const disconnect = useCallback(() => {
    setConnection(null);
    setMessages([]);
    setChatError(null);
    setDraft('');
  }, []);

  const submitSend = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!connection) return;
      const text = draft.trim();
      if (!text || sending) return;
      setSending(true);
      try {
        const res = await sendIpChat(connection.targetIp, text, connection.passphrase);
        setMessages(res.messages);
        setDraft('');
        setChatError(null);
      } catch (err) {
        setChatError(err instanceof ApiError ? err.message : 'Could not send. Try again.');
      } finally {
        setSending(false);
      }
    },
    [connection, draft, sending],
  );

  /* ------------------------------------------------------- connected view --- */

  if (connection) {
    return (
      <main className="flex min-h-screen-dvh flex-col">
        <header className="top-pad flex items-center gap-3 border-b border-line bg-panel px-4 py-3">
          <AirwaveMark className="h-5 w-5 shrink-0 text-signal" />
          <div className="min-w-0 flex-1">
            <h1 className="readout truncate text-sm font-medium text-ink">
              {connection.targetIp}
            </h1>
            <p className="text-2xs text-faint">
              {connection.passphrase ? 'Passphrase-protected' : 'No passphrase'}
            </p>
          </div>
          <ThemeToggle />
          <Button tone="danger" onClick={disconnect} aria-label="Disconnect">
            <CloseIcon className="h-4 w-4" />
          </Button>
        </header>

        <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-4">
          {chatError ? <Banner tone="error">{chatError}</Banner> : null}
          {loading && messages.length === 0 ? (
            <span className="mx-auto inline-flex items-center gap-2 py-8 text-sm text-faint">
              <SpinnerIcon className="h-4 w-4 animate-spin" />
              Connecting…
            </span>
          ) : messages.length === 0 ? (
            <p className="py-8 text-center text-sm text-faint">
              No messages yet. Say something to start the conversation.
            </p>
          ) : (
            messages.map((m) => {
              const mine = m.fromIp === ownIp;
              return (
                <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={[
                      'max-w-[75%] rounded-lg px-3 py-2 text-sm',
                      mine ? 'bg-signal text-on-signal' : 'border border-line bg-panel text-ink',
                    ].join(' ')}
                  >
                    <p>{m.text}</p>
                    <span
                      className={[
                        'mt-0.5 block text-[0.65rem]',
                        mine ? 'text-on-signal/70' : 'text-faint',
                      ].join(' ')}
                    >
                      {timeLabel(m.ts)}
                    </span>
                  </div>
                </div>
              );
            })
          )}
          <div ref={endRef} />
        </div>

        <form
          className="dock-pad flex gap-2 border-t border-line bg-panel px-4 pt-3"
          onSubmit={submitSend}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={LIMITS.chatMax}
            placeholder="Message…"
            autoFocus
            className="w-full rounded border border-line bg-base px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-carrier"
          />
          <Button type="submit" tone="primary" disabled={sending} aria-label="Send">
            {sending ? (
              <SpinnerIcon className="h-4 w-4 animate-spin" />
            ) : (
              <SendIcon className="h-4 w-4" />
            )}
          </Button>
        </form>
      </main>
    );
  }

  /* --------------------------------------------------------- connect view --- */

  return (
    <main className="mx-auto flex min-h-screen-dvh w-full max-w-md flex-col gap-6 px-5 py-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AirwaveMark className="h-6 w-6 text-signal" />
          <div>
            <h1 className="text-base font-medium text-ink">IP Chat</h1>
            <p className="text-2xs text-faint">Connect with an address, then just chat</p>
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

      <section className="flex flex-col gap-2 rounded-lg border border-line bg-panel p-4">
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
        <p className="text-xs text-faint">Share this with whoever you want to chat with.</p>
      </section>

      <form
        onSubmit={connect}
        className="flex flex-col gap-4 rounded-lg border border-line bg-panel p-5 shadow-panel"
      >
        <Field
          label="Their IP address"
          placeholder="e.g. 203.0.113.24"
          value={targetDraft}
          onChange={(e) => setTargetDraft(e.target.value)}
          codeStyle
          autoFocus
        />
        <Field
          label="Passphrase (optional)"
          type="password"
          placeholder="Leave blank if you don't need one"
          value={passDraft}
          maxLength={LIMITS.ipChatPassphraseMax}
          onChange={(e) => setPassDraft(e.target.value)}
          hint="Adds separation if you two share a public IP with others on your network."
        />
        {connectError ? <Banner tone="error">{connectError}</Banner> : null}
        <Button type="submit" tone="primary" label>
          Connect
        </Button>
      </form>

      <Banner tone="info">
        There's no server-side account here — a conversation is just the pair of IP addresses
        talking, plus your optional passphrase. Anyone who knows both can open the same thread,
        so treat the passphrase like a shared PIN if you use one.
      </Banner>
    </main>
  );
}
