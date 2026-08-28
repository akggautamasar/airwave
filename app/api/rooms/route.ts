import {
  buildIdentity,
  cleanDeviceId,
  cleanDisplayName,
  cleanTitle,
  hashPassword,
  newId,
  newRoomCode,
} from '@/lib/codes';
import { fail, handleError, ok, readJson } from '@/lib/http';
import { ensureRoom, getConfig, mintToken } from '@/lib/livekit';
import { refreshRegistry } from '@/lib/rooms';
import {
  createRoom,
  getRoom,
  listedRooms,
  rememberDevice,
  toPublicRoom,
} from '@/lib/store';
import {
  LIMITS,
  type CreateRoomBody,
  type RoomListResponse,
  type RoomMode,
  type SessionResponse,
} from '@/lib/types';
import { callerKey, rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* -------------------------------------------------------------------------- */
/* GET /api/rooms — the lobby listing                                         */
/* -------------------------------------------------------------------------- */

export async function GET(): Promise<Response> {
  try {
    await refreshRegistry();
  } catch (err) {
    // A blip talking to LiveKit shouldn't blank the lobby. Serve the last
    // known counts and let the next poll correct them.
    if (err instanceof Error && err.name === 'ConfigError') {
      return handleError('GET /api/rooms', err);
    }
    console.warn('[airwave] room list served from stale registry:', err);
  }

  const body: RoomListResponse = { rooms: listedRooms().map(toPublicRoom) };
  return ok(body);
}

/* -------------------------------------------------------------------------- */
/* POST /api/rooms — open a channel                                           */
/* -------------------------------------------------------------------------- */

function isMode(value: unknown): value is RoomMode {
  return value === 'broadcast' || value === 'open';
}

export async function POST(req: Request): Promise<Response> {
  const limit = rateLimit(`create:${callerKey(req)}`, 12, 5 * 60 * 1000);
  if (!limit.ok) {
    return fail(
      'rate_limited',
      'That is a lot of new channels. Wait a moment and try again.',
      { 'Retry-After': String(limit.retryAfter) },
    );
  }

  const body = await readJson<CreateRoomBody>(req);
  if (!body) return fail('bad_request', 'Expected a JSON body.');

  const title = cleanTitle(body.title);
  const displayName = cleanDisplayName(body.displayName);
  const deviceId = cleanDeviceId(body.deviceId);

  if (!title) {
    return fail('bad_request', 'Give the channel a name.');
  }
  if (!displayName) {
    return fail('bad_request', 'Pick a name to show in the channel.');
  }
  if (!isMode(body.mode)) {
    return fail('bad_request', 'Choose broadcast or open floor.');
  }

  const isPrivate = body.isPrivate === true;
  const password = typeof body.password === 'string' ? body.password : '';

  if (isPrivate && (password.length < 4 || password.length > LIMITS.passwordMax)) {
    return fail(
      'bad_request',
      `A private channel needs a password of 4 to ${LIMITS.passwordMax} characters.`,
    );
  }

  try {
    // Refresh first so a new code can't collide with a live room this process
    // has forgotten about.
    await refreshRegistry().catch(() => undefined);

    let code = newRoomCode();
    for (let attempt = 0; attempt < 10 && getRoom(code); attempt += 1) {
      code = newRoomCode();
    }
    if (getRoom(code)) {
      return fail('server_error', 'Could not allocate a channel code. Try again.');
    }

    const identity = buildIdentity(displayName);
    const hostKey = newId(24);
    const secret = isPrivate ? hashPassword(password) : null;

    await ensureRoom(code);

    const record = createRoom({
      code,
      title,
      mode: body.mode,
      isPrivate,
      unlisted: body.unlisted === true,
      pwSalt: secret?.salt ?? null,
      pwHash: secret?.hash ?? null,
      hostKey,
      hostIdentity: identity,
    });
    // The creator is present the moment they connect; seed the count so the
    // lobby doesn't briefly show an empty channel.
    record.participants = 1;
    rememberDevice(code, identity, deviceId);

    const token = await mintToken({
      code,
      identity,
      displayName,
      canPublish: true,
      role: 'host',
    });

    const response: SessionResponse = {
      token,
      url: getConfig().wsUrl,
      identity,
      role: 'host',
      hostKey,
      room: toPublicRoom(record),
      chat: [],
    };
    return ok(response, 201);
  } catch (err) {
    return handleError('POST /api/rooms', err);
  }
}
