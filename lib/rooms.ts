/**
 * Glue between the LiveKit control plane and the local registry.
 *
 * store.ts knows nothing about LiveKit and livekit.ts knows nothing about the
 * registry; this module is the only place the two meet.
 */

import { fetchLiveRooms, participantCount } from './livekit';
import { getRoom, reconcile, type RoomRecord } from './store';

/** Pulls live counts from LiveKit and prunes dead channel records. */
export async function refreshRegistry(): Promise<void> {
  const live = await fetchLiveRooms();
  reconcile(live);
}

/**
 * Finds a channel, adopting it from LiveKit if this process has forgotten it.
 *
 * That happens after a restart: LiveKit still holds the live room, but the
 * title, password and chat history are gone. Adopting keeps a shared link
 * working rather than 404-ing someone out of a conversation that is audibly
 * still happening — the trade-off is that the channel loses its password, so a
 * private channel becomes reachable. Restarts are rare and the alternative
 * (dropping everyone) is worse, but it is a real consequence of holding state
 * in memory.
 */
export async function findOrAdopt(code: string): Promise<RoomRecord | undefined> {
  const existing = getRoom(code);
  if (existing) return existing;

  const count = await participantCount(code);
  if (count <= 0) return undefined;

  reconcile(new Map([[code, count]]));
  return getRoom(code);
}
