import {
  buildIdentity,
  cleanDeviceId,
  cleanDisplayName,
  normalizeRoomCode,
  secretsMatch,
  verifyPassword,
} from '@/lib/codes';
import { fail, handleError, ok, readJson } from '@/lib/http';
import { ensureRoom, getConfig, mintToken } from '@/lib/livekit';
import { callerKey, rateLimit } from '@/lib/rate-limit';
import { findOrAdopt } from '@/lib/rooms';
import {
  canPublishOnJoin,
  isBanned,
  rememberDevice,
  toPublicRoom,
} from '@/lib/store';
import type { JoinRoomBody, Role, SessionResponse } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: Promise<{ code: string }>;
}

/**
 * POST /api/rooms/[code]/join
 *
 * The whole authentication story of this app: type a name, prove you know the
 * password if there is one, receive a short-lived LiveKit token scoped to this
 * one channel. Nothing is stored about you beyond the session.
 */
export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  const { code: raw } = await ctx.params;
  const code = normalizeRoomCode(raw);
  if (!code) return fail('not_found', 'That channel code does not look right.');

  const caller = callerKey(req);

  const joinLimit = rateLimit(`join:${caller}`, 30, 60 * 1000);
  if (!joinLimit.ok) {
    return fail('rate_limited', 'Too many join attempts. Give it a second.', {
      'Retry-After': String(joinLimit.retryAfter),
    });
  }

  const body = await readJson<JoinRoomBody>(req);
  if (!body) return fail('bad_request', 'Expected a JSON body.');

  const displayName = cleanDisplayName(body.displayName);
  const deviceId = cleanDeviceId(body.deviceId);
  if (!displayName) {
    return fail('bad_request', 'Pick a name to show in the channel.');
  }

  try {
    const record = await findOrAdopt(code);
    if (!record) return fail('not_found', 'That channel is not on air.');

    // The creator's tab holds a key from when it opened the channel. An empty
    // stored key means this process was restarted and no longer trusts anyone.
    const claimedKey = typeof body.hostKey === 'string' ? body.hostKey : '';
    const isHost =
      record.hostKey.length > 0 &&
      claimedKey.length > 0 &&
      secretsMatch(claimedKey, record.hostKey);

    if (!isHost && record.isPrivate) {
      const guessLimit = rateLimit(`pw:${caller}:${code}`, 8, 5 * 60 * 1000);
      if (!guessLimit.ok) {
        return fail(
          'rate_limited',
          'Too many password attempts on this channel. Wait a few minutes.',
          { 'Retry-After': String(guessLimit.retryAfter) },
        );
      }
      const attempt = typeof body.password === 'string' ? body.password : '';
      if (!attempt || !verifyPassword(attempt, record)) {
        return fail('bad_password', "That password didn't match.");
      }
    }

    const identity = buildIdentity(displayName);

    if (isBanned(record, identity, deviceId)) {
      return fail('kicked', 'The host removed you from this channel.');
    }

    const { maxParticipants } = getConfig();
    if (record.participants >= maxParticipants) {
      return fail('room_full', 'This channel is at capacity.');
    }

    await ensureRoom(code);

    if (isHost) record.hostIdentity = identity;
    rememberDevice(code, identity, deviceId);

    const canPublish = canPublishOnJoin(record, identity, isHost);
    const role: Role = isHost ? 'host' : canPublish ? 'speaker' : 'listener';

    const token = await mintToken({ code, identity, displayName, canPublish, role });

    const response: SessionResponse = {
      token,
      url: getConfig().wsUrl,
      identity,
      role,
      // Echoed back so a reconnecting host keeps its powers across a refresh.
      ...(isHost ? { hostKey: record.hostKey } : {}),
      room: toPublicRoom(record),
      chat: record.chat.slice(-40),
    };
    return ok(response);
  } catch (err) {
    return handleError(`POST /api/rooms/${code}/join`, err);
  }
}
