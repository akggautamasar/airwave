import { cleanChatText, cleanOptionalPassphrase, newUuid } from '@/lib/codes';
import { fail, ok, readJson } from '@/lib/http';
import { deriveConversationKey, pushThread, readThread } from '@/lib/ipchat-store';
import { callerKey, rateLimit } from '@/lib/rate-limit';
import type { IpChatMessage, IpChatSendBody, IpChatThreadResponse } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Loose sanity check, not a strict validator — good enough to reject
 * obvious junk without rejecting real IPv4/IPv6 addresses (including the
 * bracketed/zone-id forms browsers sometimes hand back for IPv6).
 */
function looksLikeIp(value: string): boolean {
  return /^[0-9a-fA-F:.%[\]]{2,64}$/.test(value);
}

/**
 * A conversation is always read/written as "me (the caller's own IP) and
 * this other address" — so you can only ever see threads your own current
 * IP is a party to. There is no way to browse someone else's conversation
 * from a third address.
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const targetIp = url.searchParams.get('targetIp')?.trim();
  const passphrase = cleanOptionalPassphrase(url.searchParams.get('passphrase'));

  if (!targetIp || !looksLikeIp(targetIp)) {
    return fail('bad_request', 'Enter a valid IP address to connect to.');
  }
  if (passphrase === null) {
    return fail('bad_request', 'That passphrase is too short — leave it blank or use at least 4 characters.');
  }

  const selfIp = callerKey(req);
  if (selfIp === 'unknown') {
    return fail('server_error', 'Could not determine your address.');
  }
  if (selfIp.toLowerCase() === targetIp.toLowerCase()) {
    return fail('bad_request', "That's your own address.");
  }

  const limit = rateLimit(`ipchat:read:${selfIp}`, 90, 60 * 1000);
  if (!limit.ok) {
    return fail('rate_limited', 'Slow down a little.', {
      'Retry-After': String(limit.retryAfter),
    });
  }

  const key = deriveConversationKey(selfIp, targetIp, passphrase);
  const body: IpChatThreadResponse = { youAreIp: selfIp, messages: readThread(key) };
  return ok(body);
}

/** POST /api/ipchat { targetIp, text, passphrase? } — send into that conversation. */
export async function POST(req: Request): Promise<Response> {
  const selfIp = callerKey(req);
  if (selfIp === 'unknown') {
    return fail('server_error', 'Could not determine your address.');
  }

  const limit = rateLimit(`ipchat:write:${selfIp}`, 30, 60 * 1000);
  if (!limit.ok) {
    return fail('rate_limited', 'Slow down a little.', {
      'Retry-After': String(limit.retryAfter),
    });
  }

  const body = await readJson<IpChatSendBody>(req);
  if (!body) return fail('bad_request', 'Expected a JSON body.');

  const targetIp = typeof body.targetIp === 'string' ? body.targetIp.trim() : '';
  if (!targetIp || !looksLikeIp(targetIp)) {
    return fail('bad_request', 'Enter a valid IP address to connect to.');
  }
  if (selfIp.toLowerCase() === targetIp.toLowerCase()) {
    return fail('bad_request', "That's your own address.");
  }

  const text = cleanChatText(body.text);
  if (!text) return fail('bad_request', 'Nothing to send.');

  const passphrase = cleanOptionalPassphrase(body.passphrase);
  if (passphrase === null) {
    return fail('bad_request', 'That passphrase is too short — leave it blank or use at least 4 characters.');
  }

  const key = deriveConversationKey(selfIp, targetIp, passphrase);
  const message: IpChatMessage = { id: newUuid(), text, ts: Date.now(), fromIp: selfIp };
  const messages = pushThread(key, message);

  const responseBody: IpChatThreadResponse = { youAreIp: selfIp, messages };
  return ok(responseBody, 201);
}
