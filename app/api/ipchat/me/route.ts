import { ok, fail } from '@/lib/http';
import { callerKey } from '@/lib/rate-limit';
import type { MyIpResponse } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Tells the browser what address its requests are arriving from, so the
 * IP Chat page can show something the user can copy and share. */
export async function GET(req: Request): Promise<Response> {
  const ip = callerKey(req);
  if (ip === 'unknown') {
    return fail('server_error', 'Could not determine your address.');
  }
  const body: MyIpResponse = { ip };
  return ok(body);
}
