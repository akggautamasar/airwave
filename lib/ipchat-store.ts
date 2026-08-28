/**
 * A minimal in-memory inbox for the "IP Chat" feature, keyed by the pair of
 * IP addresses talking to each other plus an optional passphrase.
 *
 * The pair is sorted before hashing, so it doesn't matter who "connects"
 * first — Alice entering Bob's IP and Bob entering Alice's IP land in the
 * same thread. See `deriveConversationKey` below.
 *
 * Same storage model as the rest of the app: one process, nothing persisted,
 * held on globalThis so dev hot-reloads don't wipe it. See lib/store.ts for
 * why that constraint exists.
 */

import { createHash } from 'node:crypto';
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

/**
 * The actual map key: the two addresses sorted (order-independent) plus the
 * passphrase (may be ''), hashed together. Hashing rather than storing the
 * raw string means the passphrase never sits in memory as a plain,
 * greppable map key, and normalises the varying shapes of IPv4/IPv6/zone-id
 * strings into something fixed-width.
 */
export function deriveConversationKey(ipA: string, ipB: string, passphrase: string): string {
  const [first, second] = [ipA, ipB].sort();
  return createHash('sha256').update(`${first}\u241F${second}\u241F${passphrase}`).digest('hex');
}

export function readThread(key: string): IpChatMessage[] {
  const { threads } = state();
  const thread = threads.get(key);
  if (!thread) return [];
  if (Date.now() - thread.lastActiveAt > IDLE_GRACE_MS) {
    threads.delete(key);
    return [];
  }
  return thread.messages;
}

/** Appends a message to a thread and returns the full thread. */
export function pushThread(key: string, message: IpChatMessage): IpChatMessage[] {
  const { threads } = state();
  let thread = threads.get(key);
  if (!thread) {
    if (threads.size >= MAX_THREADS) evictStalest();
    thread = { messages: [], lastActiveAt: Date.now() };
    threads.set(key, thread);
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
