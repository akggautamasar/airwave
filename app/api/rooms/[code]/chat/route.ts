import { cleanChatText, newUuid, normalizeRoomCode } from '@/lib/codes';
import { fail, handleError, ok, readJson } from '@/lib/http';
import { verifiedName } from '@/lib/livekit';
import { callerKey, rateLimit } from '@/lib/rate-limit';
import { findOrAdopt } from '@/lib/rooms';
import { getRoom, pushChat } from '@/lib/store';
import type {
  ChatListResponse,
  ChatMessage,
  ChatPostBody,
} from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: Promise<{ code: string }>;
}

/**
 * Chat history for people who arrive mid-conversation.
 *
 * Live delivery does not go through here — messages travel peer-to-peer over
 * the LiveKit data channel, which is why chat stays instant. This endpoint only
 * maintains a short replay buffer.
 */
export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const { code: raw } = await ctx.params;
  const code = normalizeRoomCode(raw);
  if (!code) return fail('not_found', 'That channel code does not look right.');

  const record = getRoom(code);
  if (!record) return fail('not_found', 'That channel is not on air.');

  const body: ChatListResponse = { messages: record.chat.slice(-40) };
  return ok(body);
}

/** Loose shape check; the real trust comes from LiveKit's roster. */
function looksLikeId(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 8 && value.length <= 64;
}

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  const { code: raw } = await ctx.params;
  const code = normalizeRoomCode(raw);
  if (!code) return fail('not_found', 'That channel code does not look right.');

  const limit = rateLimit(`chat:${callerKey(req)}`, 40, 60 * 1000);
  if (!limit.ok) {
    return fail('rate_limited', 'Slow down a little.', {
      'Retry-After': String(limit.retryAfter),
    });
  }

  const body = await readJson<ChatPostBody>(req);
  if (!body) return fail('bad_request', 'Expected a JSON body.');

  const text = cleanChatText(body.text);
  if (!text) return fail('bad_request', 'Nothing to send.');
  if (typeof body.identity !== 'string' || !body.identity) {
    return fail('bad_request', 'Missing sender identity.');
  }

  try {
    const record = await findOrAdopt(code);
    if (!record) return fail('not_found', 'That channel is not on air.');

    // Ask the media server who this is rather than trusting the request body.
    // Only a holder of a valid token for this channel appears on the roster.
    const name = await verifiedName(code, body.identity);
    if (!name) {
      return fail('forbidden', 'You are not connected to this channel.');
    }

    const message: ChatMessage = {
      id: looksLikeId(body.id) ? body.id : newUuid(),
      identity: body.identity,
      name,
      text,
      ts: Date.now(),
    };
    pushChat(record, message);

    return ok({ message });
  } catch (err) {
    return handleError(`POST /api/rooms/${code}/chat`, err);
  }
}
