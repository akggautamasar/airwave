import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import type { Role } from './types';

/**
 * Thin wrapper around livekit-server-sdk.
 *
 * Every call into the SDK is funnelled through this file on purpose: if a
 * future SDK release changes a signature, there is exactly one place to fix.
 * The signatures used here are the positional v2 forms, pinned by
 * package.json to livekit-server-sdk 2.9.7.
 */

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export interface LiveKitConfig {
  /** wss:// URL handed to the browser. */
  wsUrl: string;
  /** https:// URL used for server-side management calls. */
  httpUrl: string;
  apiKey: string;
  apiSecret: string;
  emptyTimeout: number;
  maxParticipants: number;
}

function toHttpUrl(wsUrl: string): string {
  if (wsUrl.startsWith('wss://')) return `https://${wsUrl.slice(6)}`;
  if (wsUrl.startsWith('ws://')) return `http://${wsUrl.slice(5)}`;
  if (wsUrl.startsWith('http://') || wsUrl.startsWith('https://')) return wsUrl;
  throw new ConfigError(
    `LIVEKIT_URL must start with wss:// or ws:// (received "${wsUrl}").`,
  );
}

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getConfig(): LiveKitConfig {
  const wsUrl = process.env.LIVEKIT_URL?.trim();
  const apiKey = process.env.LIVEKIT_API_KEY?.trim();
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();

  const missing = [
    !wsUrl && 'LIVEKIT_URL',
    !apiKey && 'LIVEKIT_API_KEY',
    !apiSecret && 'LIVEKIT_API_SECRET',
  ].filter(Boolean);

  if (missing.length || !wsUrl || !apiKey || !apiSecret) {
    throw new ConfigError(
      `Missing ${missing.join(', ')}. Copy .env.example to .env.local and fill in your LiveKit credentials.`,
    );
  }

  return {
    wsUrl,
    httpUrl: toHttpUrl(wsUrl),
    apiKey,
    apiSecret,
    emptyTimeout: intFromEnv('LIVEKIT_EMPTY_TIMEOUT', 120),
    maxParticipants: intFromEnv('MAX_PARTICIPANTS', 100),
  };
}

/** Cached on globalThis so dev hot-reloads don't leak HTTP clients. */
function getRoomService(): RoomServiceClient {
  const { httpUrl, apiKey, apiSecret } = getConfig();
  const g = globalThis as unknown as {
    __airwaveSvc?: { key: string; svc: RoomServiceClient };
  };
  const key = `${httpUrl}|${apiKey}`;
  if (g.__airwaveSvc?.key !== key) {
    g.__airwaveSvc = {
      key,
      svc: new RoomServiceClient(httpUrl, apiKey, apiSecret),
    };
  }
  return g.__airwaveSvc.svc;
}

/* -------------------------------------------------------------------------- */
/* Tokens                                                                     */
/* -------------------------------------------------------------------------- */

export interface MintTokenInput {
  code: string;
  identity: string;
  displayName: string;
  canPublish: boolean;
  role: Role;
}

export async function mintToken(input: MintTokenInput): Promise<string> {
  const { apiKey, apiSecret } = getConfig();

  const at = new AccessToken(apiKey, apiSecret, {
    identity: input.identity,
    name: input.displayName,
    metadata: JSON.stringify({ role: input.role }),
    // Long enough for a lengthy show, short enough that a leaked token expires.
    ttl: '6h',
  });

  at.addGrant({
    room: input.code,
    roomJoin: true,
    canPublish: input.canPublish,
    canSubscribe: true,
    // Text chat and raise-hand ride the data channel, so everyone needs this.
    canPublishData: true,
    canUpdateOwnMetadata: true,
  });

  // v2 returns a promise here; awaiting is required.
  return at.toJwt();
}

/* -------------------------------------------------------------------------- */
/* Room lifecycle                                                             */
/* -------------------------------------------------------------------------- */

/** Idempotent: LiveKit returns the existing room if the name is already live. */
export async function ensureRoom(code: string): Promise<void> {
  const { emptyTimeout, maxParticipants } = getConfig();
  await getRoomService().createRoom({
    name: code,
    emptyTimeout,
    maxParticipants,
  });
}

/** Channel code -> participant count, for every room LiveKit currently holds. */
export async function fetchLiveRooms(): Promise<Map<string, number>> {
  const rooms = await getRoomService().listRooms();
  const out = new Map<string, number>();
  for (const room of rooms) {
    out.set(room.name, room.numParticipants ?? 0);
  }
  return out;
}

export async function participantCount(code: string): Promise<number> {
  const rooms = await getRoomService().listRooms([code]);
  return rooms[0]?.numParticipants ?? 0;
}

/* -------------------------------------------------------------------------- */
/* Moderation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Changes what someone is allowed to publish, live, without a reconnect.
 * The browser learns about it via RoomEvent.ParticipantPermissionsChanged.
 */
export async function setPublishPermission(
  code: string,
  identity: string,
  canPublish: boolean,
): Promise<void> {
  const role: Role = canPublish ? 'speaker' : 'listener';
  // updateParticipant(room, identity, metadata?, permission?, name?)
  await getRoomService().updateParticipant(
    code,
    identity,
    JSON.stringify({ role }),
    {
      canPublish,
      canSubscribe: true,
      canPublishData: true,
      canUpdateMetadata: true,
    },
  );
}

/**
 * Server-side mute. Unlike asking the client politely, this stops the media at
 * the SFU, so it works on someone who is ignoring the UI.
 */
export async function forceMute(code: string, identity: string): Promise<void> {
  const svc = getRoomService();
  const participants = await svc.listParticipants(code);
  const target = participants.find((p) => p.identity === identity);
  if (!target) return;

  // Audio is the only thing anyone publishes here, so every track qualifies.
  await Promise.all(
    (target.tracks ?? [])
      .filter((track) => !track.muted)
      .map((track) => svc.mutePublishedTrack(code, identity, track.sid, true)),
  );
}

export async function removeFromRoom(
  code: string,
  identity: string,
): Promise<void> {
  await getRoomService().removeParticipant(code, identity);
}

export async function roomExists(code: string): Promise<boolean> {
  const rooms = await getRoomService().listRooms([code]);
  return rooms.length > 0;
}

/* -------------------------------------------------------------------------- */
/* Identity verification                                                      */
/* -------------------------------------------------------------------------- */

interface RosterCache {
  roster: Map<string, { at: number; names: Map<string, string> }>;
}

/** Rosters change slowly relative to typing speed; a 2s memo is plenty. */
const ROSTER_TTL_MS = 2_000;

function rosterCache(): RosterCache {
  const g = globalThis as unknown as Record<string, RosterCache | undefined>;
  let existing = g['__airwave_roster__'];
  if (!existing) {
    existing = { roster: new Map() };
    g['__airwave_roster__'] = existing;
  }
  return existing;
}

/**
 * Confirms an identity is genuinely connected to this channel and returns the
 * display name LiveKit has on file for it.
 *
 * The chat history endpoint has no session cookie to trust, so instead of
 * believing the name in the request body it asks the media server — which only
 * knows this identity because it presented a signed token. That turns chat
 * history from spoofable into authenticated.
 */
export async function verifiedName(
  code: string,
  identity: string,
): Promise<string | null> {
  const cache = rosterCache();
  const now = Date.now();
  const hit = cache.roster.get(code);

  if (hit && now - hit.at < ROSTER_TTL_MS) {
    return hit.names.get(identity) ?? null;
  }

  const participants = await getRoomService().listParticipants(code);
  const names = new Map<string, string>();
  for (const p of participants) {
    names.set(p.identity, p.name || p.identity);
  }
  if (cache.roster.size > 500) cache.roster.clear();
  cache.roster.set(code, { at: now, names });

  return names.get(identity) ?? null;
}
