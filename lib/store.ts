/**
 * The channel registry.
 *
 * Everything lives in one process-local Map. There is no database, and that is
 * a deliberate constraint of this app, not an oversight — but it has real
 * consequences worth naming:
 *
 *   1. The app MUST run as a single instance. Two Render instances would each
 *      hold half the channels and disagree about passwords. render.yaml pins
 *      numInstances to 1 for exactly this reason.
 *   2. A restart or redeploy forgets channel titles, passwords and chat
 *      scrollback. Live audio itself is unaffected, because LiveKit holds that
 *      state; a channel simply reappears as an untitled public one.
 *
 * Sweeping is lazy — it happens whenever counts are refreshed from LiveKit —
 * so importing this module has no side effects and nothing runs at build time.
 */

import { LIMITS, type ChatMessage, type PublicRoom, type RoomMode } from './types';

/** How long an empty channel's record survives, so a host can reconnect. */
const EMPTY_GRACE_MS = 10 * 60 * 1000;
/** Upper bound on tracked channels, so memory can't run away. */
const MAX_ROOMS = 400;
/** A kick lasts this long, then the identity may return. */
const BAN_MS = 30 * 60 * 1000;

export interface BanEntry {
  identity: string;
  deviceId: string;
  until: number;
}

export interface RoomRecord {
  code: string;
  title: string;
  mode: RoomMode;
  isPrivate: boolean;
  /** Hidden from the public list; reachable by code. */
  unlisted: boolean;
  pwSalt: string | null;
  pwHash: string | null;
  /** Secret handed only to the creator; proves host powers without a login. */
  hostKey: string;
  hostIdentity: string | null;
  createdAt: number;
  /** Last moment LiveKit reported at least one participant. */
  lastActiveAt: number;
  /** Cached from the most recent LiveKit poll. */
  participants: number;
  /** Identities handed the mic in broadcast mode. */
  grantedSpeakers: Set<string>;
  bans: BanEntry[];
  chat: ChatMessage[];
}

interface StoreState {
  rooms: Map<string, RoomRecord>;
}

const GLOBAL_KEY = '__airwave_store__';

/**
 * Held on globalThis so Next.js dev hot-reloads don't wipe live channels
 * every time a file is saved.
 */
function state(): StoreState {
  const g = globalThis as unknown as Record<string, StoreState | undefined>;
  let existing = g[GLOBAL_KEY];
  if (!existing) {
    existing = { rooms: new Map() };
    g[GLOBAL_KEY] = existing;
  }
  return existing;
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

export function getRoom(code: string): RoomRecord | undefined {
  return state().rooms.get(code);
}

export function allRooms(): RoomRecord[] {
  return [...state().rooms.values()];
}

export function listedRooms(): RoomRecord[] {
  return allRooms()
    .filter((r) => !r.unlisted)
    .sort((a, b) => b.participants - a.participants || b.createdAt - a.createdAt);
}

export function roomCount(): number {
  return state().rooms.size;
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                     */
/* -------------------------------------------------------------------------- */

export interface NewRoomInput {
  code: string;
  title: string;
  mode: RoomMode;
  isPrivate: boolean;
  unlisted: boolean;
  pwSalt: string | null;
  pwHash: string | null;
  hostKey: string;
  hostIdentity: string;
}

export function createRoom(input: NewRoomInput): RoomRecord {
  const now = Date.now();
  const record: RoomRecord = {
    ...input,
    createdAt: now,
    lastActiveAt: now,
    participants: 0,
    grantedSpeakers: new Set(),
    bans: [],
    chat: [],
  };
  const { rooms } = state();
  if (rooms.size >= MAX_ROOMS) evictStalest();
  rooms.set(record.code, record);
  return record;
}

export function dropRoom(code: string): void {
  state().rooms.delete(code);
}

/**
 * Reconciles the registry against what LiveKit says is actually live, then
 * discards records for channels that have been empty past the grace period.
 *
 * A channel that exists in LiveKit but not here (because we restarted) is
 * adopted as an untitled public channel so it still shows up in the lobby.
 */
export function reconcile(live: Map<string, number>): void {
  const { rooms } = state();
  const now = Date.now();

  for (const record of rooms.values()) {
    const count = live.get(record.code);
    record.participants = count ?? 0;
    if (count && count > 0) record.lastActiveAt = now;
  }

  for (const [code, count] of live) {
    if (rooms.has(code) || count <= 0) continue;
    rooms.set(code, {
      code,
      title: `Channel ${code}`,
      mode: 'open',
      isPrivate: false,
      unlisted: false,
      pwSalt: null,
      pwHash: null,
      // Nobody holds this key, so an adopted channel has no host until the
      // original creator rejoins with the key they still have in their tab.
      hostKey: '',
      hostIdentity: null,
      createdAt: now,
      lastActiveAt: now,
      participants: count,
      grantedSpeakers: new Set(),
      bans: [],
      chat: [],
    });
  }

  for (const [code, record] of rooms) {
    if (record.participants === 0 && now - record.lastActiveAt > EMPTY_GRACE_MS) {
      rooms.delete(code);
    }
  }
}

function evictStalest(): void {
  const { rooms } = state();
  let victim: RoomRecord | null = null;
  for (const record of rooms.values()) {
    if (record.participants > 0) continue;
    if (!victim || record.lastActiveAt < victim.lastActiveAt) victim = record;
  }
  if (victim) rooms.delete(victim.code);
}

/* -------------------------------------------------------------------------- */
/* Chat                                                                       */
/* -------------------------------------------------------------------------- */

export function pushChat(record: RoomRecord, message: ChatMessage): void {
  record.chat.push(message);
  if (record.chat.length > LIMITS.chatHistory) {
    record.chat.splice(0, record.chat.length - LIMITS.chatHistory);
  }
}

/* -------------------------------------------------------------------------- */
/* Speaking rights                                                            */
/* -------------------------------------------------------------------------- */

export function grantSpeaker(record: RoomRecord, identity: string): void {
  record.grantedSpeakers.add(identity);
}

export function revokeSpeaker(record: RoomRecord, identity: string): void {
  record.grantedSpeakers.delete(identity);
}

export function canPublishOnJoin(
  record: RoomRecord,
  identity: string,
  isHost: boolean,
): boolean {
  if (isHost) return true;
  if (record.mode === 'open') return true;
  return record.grantedSpeakers.has(identity);
}

/** How many people in this channel are currently allowed to talk. */
export function allowedSpeakerCount(record: RoomRecord): number {
  if (record.mode === 'open') return record.participants;
  const host = record.hostIdentity ? 1 : 0;
  return Math.min(host + record.grantedSpeakers.size, record.participants);
}

/* -------------------------------------------------------------------------- */
/* Kicks                                                                      */
/* -------------------------------------------------------------------------- */

export function addBan(
  record: RoomRecord,
  identity: string,
  deviceId: string,
): void {
  const now = Date.now();
  record.bans = record.bans.filter((b) => b.until > now);
  record.bans.push({ identity, deviceId, until: now + BAN_MS });
}

/**
 * Soft enforcement, and honestly so: with no accounts there is no durable
 * identity to ban. Matching on the browser-generated device id raises the
 * effort past "hit refresh" without pretending to be airtight.
 */
export function isBanned(
  record: RoomRecord,
  identity: string,
  deviceId: string,
): boolean {
  const now = Date.now();
  record.bans = record.bans.filter((b) => b.until > now);
  return record.bans.some(
    (b) =>
      b.identity === identity ||
      (deviceId !== 'unknown' && b.deviceId === deviceId),
  );
}

/** Device id of a participant, remembered at join time so kicks can match it. */
const deviceKey = (code: string, identity: string) => `${code}:${identity}`;

interface DeviceState {
  devices: Map<string, string>;
}

function devices(): DeviceState {
  const g = globalThis as unknown as Record<string, DeviceState | undefined>;
  let existing = g['__airwave_devices__'];
  if (!existing) {
    existing = { devices: new Map() };
    g['__airwave_devices__'] = existing;
  }
  return existing;
}

export function rememberDevice(
  code: string,
  identity: string,
  deviceId: string,
): void {
  const { devices: map } = devices();
  if (map.size > 10_000) map.clear();
  map.set(deviceKey(code, identity), deviceId);
}

export function recallDevice(code: string, identity: string): string {
  return devices().devices.get(deviceKey(code, identity)) ?? 'unknown';
}

/* -------------------------------------------------------------------------- */
/* Serialisation                                                              */
/* -------------------------------------------------------------------------- */

export function toPublicRoom(record: RoomRecord): PublicRoom {
  return {
    code: record.code,
    title: record.title,
    mode: record.mode,
    isPrivate: record.isPrivate,
    participants: record.participants,
    speakers: allowedSpeakerCount(record),
    createdAt: record.createdAt,
  };
}
