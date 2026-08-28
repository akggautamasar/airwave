import { normalizeRoomCode, secretsMatch } from '@/lib/codes';
import { fail, handleError, ok, readJson } from '@/lib/http';
import { forceMute, removeFromRoom, setPublishPermission } from '@/lib/livekit';
import { callerKey, rateLimit } from '@/lib/rate-limit';
import {
  addBan,
  getRoom,
  grantSpeaker,
  recallDevice,
  revokeSpeaker,
} from '@/lib/store';
import type { ModerateBody, ModerationAction, OkResponse } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: Promise<{ code: string }>;
}

const ACTIONS: ModerationAction[] = ['mute', 'kick', 'grant', 'revoke'];

function isAction(value: unknown): value is ModerationAction {
  return typeof value === 'string' && ACTIONS.includes(value as ModerationAction);
}

/**
 * POST /api/rooms/[code]/moderate
 *
 * Host controls, authorised by the session secret the creator received when
 * they opened the channel. There are no accounts to check against, so the key
 * is the entire proof — it lives in the creator's tab and nowhere else.
 *
 * Every action is enforced at the media server, not requested politely of the
 * target's browser, so a modified client cannot ignore it.
 */
export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  const { code: raw } = await ctx.params;
  const code = normalizeRoomCode(raw);
  if (!code) return fail('not_found', 'That channel code does not look right.');

  const limit = rateLimit(`mod:${callerKey(req)}`, 60, 60 * 1000);
  if (!limit.ok) {
    return fail('rate_limited', 'Too many moderation actions at once.', {
      'Retry-After': String(limit.retryAfter),
    });
  }

  const body = await readJson<ModerateBody>(req);
  if (!body) return fail('bad_request', 'Expected a JSON body.');

  if (!isAction(body.action)) {
    return fail('bad_request', 'Unknown action.');
  }
  if (typeof body.targetIdentity !== 'string' || !body.targetIdentity) {
    return fail('bad_request', 'Missing target.');
  }

  const record = getRoom(code);
  if (!record) return fail('not_found', 'That channel is not on air.');

  const claimedKey = typeof body.hostKey === 'string' ? body.hostKey : '';
  const authorised =
    record.hostKey.length > 0 &&
    claimedKey.length > 0 &&
    secretsMatch(claimedKey, record.hostKey);

  if (!authorised) {
    return fail('forbidden', 'Only the person who opened this channel can do that.');
  }

  const target = body.targetIdentity;
  if (target === record.hostIdentity && body.action !== 'mute') {
    return fail('forbidden', 'That action does not apply to the host.');
  }

  try {
    switch (body.action) {
      case 'mute':
        await forceMute(code, target);
        break;

      case 'kick':
        // Ban before removing: the device id was recorded at join time, and
        // removeParticipant may drop the roster entry we would look it up from.
        addBan(record, target, recallDevice(code, target));
        revokeSpeaker(record, target);
        await removeFromRoom(code, target);
        break;

      case 'grant':
        grantSpeaker(record, target);
        await setPublishPermission(code, target, true);
        break;

      case 'revoke':
        revokeSpeaker(record, target);
        await setPublishPermission(code, target, false);
        // Permission changes stop future publishing; muting stops the track
        // that is already live.
        await forceMute(code, target).catch(() => undefined);
        break;
    }

    const body_: OkResponse = { ok: true };
    return ok(body_);
  } catch (err) {
    return handleError(`POST /api/rooms/${code}/moderate`, err);
  }
}
