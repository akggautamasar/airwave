/**
 * A minimal inbox keyed by public IP address, for the "IP Chat" feature.
 *
 * There is no login here at all — the address a request arrives from *is*
 * the identity. That is the whole feature (anyone who has your IP can read
 * and post into your thread, no join code needed) and also the whole caveat
 * (anyone who *shares* your IP — the rest of your office wifi, your phone
 * carrier's NAT — reads and posts into it too). The /ipchat page explains
 * this to users rather than implying any real privacy.
 *
 * Same storage model as the rest of the app: one process, nothing persisted,
 * held on globalThis so dev hot-reloads don't wipe it. See lib/store.ts for
 * why that constraint exists.
 */

import { LIMITS } from './types';
import type { IpChatMessage } from './types';

/** Upper bound on tracked threads, so memory can't run away. */
const MAX_THREADS = 2_000;
/** A thread with nobody posting to it this long is fair game to evict. */
const IDLE_GRACE_MS = 6 * 60 * 60 * 1000;

interface Thread {
  messages: IpChatMessage[];
  lastActiveAt: number;
}

interface IpChatState {
  threads: Map<string, Thread>;
}

const GLOBAL_KEY = '__airwave_ipchat__';

function state(): IpChatState {
  const g = globalThis as unknown as Record<string, IpChatState | undefined>;
  let existing = g[GLOBAL_KEY];
  if (!existing) {
    existing = { threads: new Map() };
    g[GLOBAL_KEY] = existing;
  }
  return existing;
}

export function readThread(ip: string): IpChatMessage[] {
  const { threads } = state();
  const thread = threads.get(ip);
  if (!thread) return [];
  if (Date.now() - thread.lastActiveAt > IDLE_GRACE_MS) {
    threads.delete(ip);
    return [];
  }
  return thread.messages;
}

/** Appends a message to the sender's own thread and returns the full thread. */
export function pushThread(ip: string, message: IpChatMessage): IpChatMessage[] {
  const { threads } = state();
  let thread = threads.get(ip);
  if (!thread) {
    if (threads.size >= MAX_THREADS) evictStalest();
    thread = { messages: [], lastActiveAt: Date.now() };
    threads.set(ip, thread);
  }
  thread.messages.push(message);
  thread.lastActiveAt = Date.now();
  if (thread.messages.length > LIMITS.ipChatHistory) {
    thread.messages.splice(0, thread.messages.length - LIMITS.ipChatHistory);
  }
  return thread.messages;
}

function evictStalest(): void {
  const { threads } = state();
  let victimKey: string | null = null;
  let victimAt = Infinity;
  for (const [key, thread] of threads) {
    if (thread.lastActiveAt < victimAt) {
      victimAt = thread.lastActiveAt;
      victimKey = key;
    }
  }
  if (victimKey) threads.delete(victimKey);
}
