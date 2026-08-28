import { normalizeRoomCode } from '@/lib/codes';
import { fail, handleError, ok } from '@/lib/http';
import { findOrAdopt } from '@/lib/rooms';
import { toPublicRoom } from '@/lib/store';
import type { RoomPeekResponse } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  // Next 15 hands dynamic params over as a promise.
  params: Promise<{ code: string }>;
}

/**
 * GET /api/rooms/[code]
 *
 * Enough to render the join screen for a shared link: the channel's name and
 * whether a password is needed. Never returns the password itself.
 */
export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const { code: raw } = await ctx.params;
  const code = normalizeRoomCode(raw);
  if (!code) return fail('not_found', 'That channel code does not look right.');

  try {
    const record = await findOrAdopt(code);
    if (!record) {
      return fail('not_found', 'That channel is not on air.');
    }
    const body: RoomPeekResponse = {
      room: toPublicRoom(record),
      needsPassword: record.isPrivate,
    };
    return ok(body);
  } catch (err) {
    return handleError(`GET /api/rooms/${code}`, err);
  }
}
