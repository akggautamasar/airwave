import { ok } from '@/lib/http';
import { ConfigError, fetchLiveRooms } from '@/lib/livekit';
import { roomCount } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/health
 *
 * Used by Render's health check and handy when debugging a deploy: it reports
 * whether the app can actually reach LiveKit, which is the one dependency that
 * silently breaks everything if the credentials are wrong.
 */
export async function GET(): Promise<Response> {
  let livekit: 'reachable' | 'unreachable' | 'unconfigured' = 'reachable';
  let liveRooms: number | null = null;

  try {
    liveRooms = (await fetchLiveRooms()).size;
  } catch (err) {
    livekit = err instanceof ConfigError ? 'unconfigured' : 'unreachable';
  }

  return ok({
    ok: livekit === 'reachable',
    livekit,
    liveRooms,
    trackedChannels: roomCount(),
    at: new Date().toISOString(),
  });
}
