import { cleanChatText, newUuid } from '@/lib/codes';
import { fail, ok, readJson } from '@/lib/http';
import { pushThread, readThread } from '@/lib/ipchat-store';
import { callerKey, rateLimit } from '@/lib/rate-limit';
import type { IpChatMessage, IpChatSendBody, IpChatThreadResponse } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Loose sanity check, not a strict validator — good enough to reject
 * obvious junk in the query string without rejecting real IPv4/IPv6
 * addresses (including the bracketed/zone-id forms browsers sometimes hand
 * back for IPv6).
 */
function looksLikeIp(value: string): boolean {
  return /^[0-9a-fA-F:.%[\]]{2,64}$/.test(value);
}

/** GET /api/ipchat?ip=1.2.3.4 — read whatever has been posted under that IP. */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const ip = url.searchParams.get('ip')?.trim();
  if (!ip || !looksLikeIp(ip)) {
    return fail('bad_request', 'Enter a valid IP address.');
  }

  const limit = rateLimit(`ipchat:read:${callerKey(req)}`, 90, 60 * 1000);
  if (!limit.ok) {
    return fail('rate_limited', 'Slow down a little.', {
      'Retry-After': String(limit.retryAfter),
    });
  }

  const body: IpChatThreadResponse = { ip, messages: readThread(ip) };
  return ok(body);
}

/** POST /api/ipchat { text } — send to the caller's own IP thread. */
export async function POST(req: Request): Promise<Response> {
  const senderIp = callerKey(req);
  if (senderIp === 'unknown') {
    return fail('server_error', 'Could not determine your address.');
  }

  const limit = rateLimit(`ipchat:write:${senderIp}`, 20, 60 * 1000);
  if (!limit.ok) {
    return fail('rate_limited', 'Slow down a little.', {
      'Retry-After': String(limit.retryAfter),
    });
  }

  const body = await readJson<IpChatSendBody>(req);
  if (!body) return fail('bad_request', 'Expected a JSON body.');

  const text = cleanChatText(body.text);
  if (!text) return fail('bad_request', 'Nothing to send.');

  const message: IpChatMessage = { id: newUuid(), text, ts: Date.now() };
  const messages = pushThread(senderIp, message);

  const responseBody: IpChatThreadResponse = { ip: senderIp, messages };
  return ok(responseBody, 201);
}
