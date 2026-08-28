'use client';

import {
  createLocalAudioTrack,
  DisconnectReason,
  LocalAudioTrack,
  Participant,
  RemoteParticipant,
  RemoteTrack,
  Room,
  RoomEvent,
  Track,
  type RemoteTrackPublication,
} from 'livekit-client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DATA_TOPIC,
  type ChatMessage,
  type Role,
  type SessionResponse,
  type WirePacket,
} from '@/lib/types';

/* -------------------------------------------------------------------------- */
/* Public shape                                                               */
/* -------------------------------------------------------------------------- */

export type LiveStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'closed';

export interface PeerView {
  identity: string;
  name: string;
  role: Role;
  isLocal: boolean;
  /** Allowed to publish audio at all. */
  canTalk: boolean;
  /** Has a microphone track published, muted or not. */
  micArmed: boolean;
  /** Armed but silent. */
  micMuted: boolean;
  handRaised: boolean;
}

export interface LevelReading {
  level: number;
  speaking: boolean;
}

export type Levels = Record<string, LevelReading>;

/**
 * Everything the room UI needs, and nothing about how LiveKit works.
 *
 * The microphone has three states rather than two, because push-to-talk only
 * feels instant if the track is already negotiated:
 *
 *   disarmed  no track at all, mic hardware released
 *   armed     track published but muted — silent, ready, recording light on
 *   live      unmuted, audible to the channel
 *
 * Arming costs a permission prompt and keeps the browser's recording indicator
 * lit, which is why disarming is offered explicitly rather than hidden.
 */
export interface LiveRoom {
  status: LiveStatus;
  /** Fatal connection problem, already phrased for a person. */
  error: string | null;
  /** Why the session ended, when it wasn't the user's choice. */
  endedReason: string | null;
  /** Transient, dismissable message, e.g. "the host gave you the mic". */
  notice: string | null;
  peers: PeerView[];
  me: PeerView | null;
  levels: Levels;
  /** Identities currently making sound, loudest first. */
  activeSpeakers: string[];
  micArmed: boolean;
  micLive: boolean;
  openMic: boolean;
  canTalk: boolean;
  micError: string | null;
  /** Browser is holding audio back until a gesture. Mostly iOS. */
  needsAudioUnlock: boolean;
  messages: ChatMessage[];

  connect: (session: SessionResponse) => void;
  leave: () => void;
  armMic: () => Promise<void>;
  disarmMic: () => Promise<void>;
  startTalking: () => void;
  stopTalking: () => void;
  setOpenMic: (on: boolean) => void;
  sendChat: (text: string) => void;
  raiseHand: (up: boolean) => void;
  unlockAudio: () => void;
  clearNotice: () => void;
}

/* -------------------------------------------------------------------------- */
/* Pure helpers                                                               */
/* -------------------------------------------------------------------------- */

function roleOf(p: Participant): Role {
  try {
    if (p.metadata) {
      const parsed = JSON.parse(p.metadata) as { role?: string };
      if (
        parsed.role === 'host' ||
        parsed.role === 'speaker' ||
        parsed.role === 'listener'
      ) {
        return parsed.role;
      }
    }
  } catch {
    // Metadata is participant-supplied in principle; a bad parse is not fatal.
  }
  return p.permissions?.canPublish ? 'speaker' : 'listener';
}

const ROLE_RANK: Record<Role, number> = { host: 0, speaker: 1, listener: 2 };

function viewOf(p: Participant, isLocal: boolean, hands: Set<string>): PeerView {
  const pub = p.getTrackPublication(Track.Source.Microphone);
  return {
    identity: p.identity,
    name: p.name || p.identity,
    role: roleOf(p),
    isLocal,
    canTalk: p.permissions?.canPublish ?? false,
    micArmed: Boolean(pub),
    micMuted: pub?.isMuted ?? true,
    handRaised: hands.has(p.identity),
  };
}

function describeEnd(reason?: DisconnectReason): string | null {
  switch (reason) {
    case DisconnectReason.PARTICIPANT_REMOVED:
      return 'The host removed you from this channel.';
    case DisconnectReason.ROOM_DELETED:
      return 'This channel closed.';
    case DisconnectReason.DUPLICATE_IDENTITY:
      return 'You joined this channel from somewhere else.';
    case DisconnectReason.SERVER_SHUTDOWN:
      return 'The media server restarted.';
    case DisconnectReason.CLIENT_INITIATED:
      return null; // the user pressed leave
    default:
      return 'The connection dropped.';
  }
}

function describeMicError(err: unknown): string {
  const name = err instanceof Error ? err.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Microphone blocked. Allow it for this site, then try again.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No microphone found on this device.';
  }
  if (name === 'NotReadableError') {
    return 'Another app is using the microphone.';
  }
  return 'Could not open the microphone.';
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/* -------------------------------------------------------------------------- */
/* Hook                                                                       */
/* -------------------------------------------------------------------------- */

export function useLiveRoom(): LiveRoom {
  const roomRef = useRef<Room | null>(null);
  const sessionRef = useRef<SessionResponse | null>(null);
  const micTrackRef = useRef<LocalAudioTrack | null>(null);
  const audioBinRef = useRef<HTMLDivElement | null>(null);
  const handsRef = useRef<Set<string>>(new Set());
  const openMicRef = useRef(false);
  const smoothRef = useRef<Record<string, number>>({});
  /** Guards against a second connect from React's double-invoked effects. */
  const claimedTokenRef = useRef<string | null>(null);

  const [status, setStatus] = useState<LiveStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [endedReason, setEndedReason] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [peers, setPeers] = useState<PeerView[]>([]);
  const [levels, setLevels] = useState<Levels>({});
  const [activeSpeakers, setActiveSpeakers] = useState<string[]>([]);
  const [micArmed, setMicArmed] = useState(false);
  const [micLive, setMicLive] = useState(false);
  const [openMic, setOpenMicState] = useState(false);
  const [canTalk, setCanTalk] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [needsAudioUnlock, setNeedsAudioUnlock] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  /* ---------------------------------------------------------------- sync --- */

  /** Rebuilds the roster from the Room object. Cheap, and always authoritative. */
  const sync = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;

    const hands = handsRef.current;
    const next: PeerView[] = [
      viewOf(room.localParticipant, true, hands),
      ...[...room.remoteParticipants.values()].map((p) => viewOf(p, false, hands)),
    ].sort(
      (a, b) =>
        ROLE_RANK[a.role] - ROLE_RANK[b.role] ||
        a.name.localeCompare(b.name) ||
        a.identity.localeCompare(b.identity),
    );

    setPeers(next);
    setCanTalk(room.localParticipant.permissions?.canPublish ?? false);

    const pub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
    setMicArmed(Boolean(pub));
    setMicLive(Boolean(pub) && !(pub?.isMuted ?? true));
  }, []);

  /* ------------------------------------------------------------------ mic --- */

  const armMic = useCallback(async () => {
    const room = roomRef.current;
    if (!room || micTrackRef.current) return;
    if (!room.localParticipant.permissions?.canPublish) return;

    try {
      setMicError(null);
      const track = await createLocalAudioTrack({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });
      // Publish silent unless the user has deliberately chosen an open mic.
      // Nobody expects to be broadcasting the instant they connect.
      if (!openMicRef.current) await track.mute();
      micTrackRef.current = track;
      await room.localParticipant.publishTrack(track, {
        source: Track.Source.Microphone,
        dtx: true,
        red: true,
      });
      sync();
    } catch (err) {
      micTrackRef.current = null;
      setMicError(describeMicError(err));
    }
  }, [sync]);

  const disarmMic = useCallback(async () => {
    const room = roomRef.current;
    const track = micTrackRef.current;
    micTrackRef.current = null;
    openMicRef.current = false;
    setOpenMicState(false);

    if (room && track) {
      try {
        await room.localParticipant.unpublishTrack(track, true);
      } catch (err) {
        console.warn('[airwave] could not release the mic', err);
      }
    }
    try {
      track?.stop();
    } catch {
      // already stopped
    }
    setMicLive(false);
    sync();
  }, [sync]);

  const startTalking = useCallback(() => {
    const track = micTrackRef.current;
    if (!track) {
      // Not armed yet — arm, then go live as soon as the track lands, so a
      // first-time press still opens the channel.
      void armMic().then(() => {
        const armed = micTrackRef.current;
        if (armed) void armed.unmute().then(() => setMicLive(true));
      });
      return;
    }
    void track.unmute().then(() => setMicLive(true));
  }, [armMic]);

  const stopTalking = useCallback(() => {
    if (openMicRef.current) return; // an open mic stays live by design
    const track = micTrackRef.current;
    if (!track) return;
    void track.mute().then(() => setMicLive(false));
  }, []);

  const setOpenMic = useCallback(
    (on: boolean) => {
      openMicRef.current = on;
      setOpenMicState(on);
      const track = micTrackRef.current;
      if (!on) {
        if (track) void track.mute().then(() => setMicLive(false));
        return;
      }
      if (track) {
        void track.unmute().then(() => setMicLive(true));
      } else {
        void armMic().then(() => {
          const armed = micTrackRef.current;
          if (armed) void armed.unmute().then(() => setMicLive(true));
        });
      }
    },
    [armMic],
  );

  /* --------------------------------------------------------------- connect -- */

  const connect = useCallback(
    (session: SessionResponse) => {
      if (claimedTokenRef.current === session.token) return;
      claimedTokenRef.current = session.token;
      sessionRef.current = session;

      setStatus('connecting');
      setError(null);
      setEndedReason(null);
      setMessages(session.chat ?? []);

      const room = new Room({
        // Audio only, so adaptive stream (a video concern) is off.
        adaptiveStream: false,
        dynacast: true,
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        disconnectOnPageLeave: true,
      });
      roomRef.current = room;

      // Remote audio needs real elements inside the document to play at all.
      const bin = document.createElement('div');
      bin.style.display = 'none';
      bin.setAttribute('aria-hidden', 'true');
      document.body.appendChild(bin);
      audioBinRef.current = bin;

      room
        .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
          if (track.kind !== Track.Kind.Audio) return;
          const el = track.attach();
          el.setAttribute('playsinline', 'true');
          audioBinRef.current?.appendChild(el);
          sync();
        })
        .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
          track.detach().forEach((el) => el.remove());
          sync();
        })
        .on(RoomEvent.ParticipantConnected, () => sync())
        .on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
          handsRef.current.delete(p.identity);
          sync();
        })
        .on(RoomEvent.TrackMuted, () => sync())
        .on(RoomEvent.TrackUnmuted, () => sync())
        .on(RoomEvent.LocalTrackPublished, () => sync())
        .on(RoomEvent.LocalTrackUnpublished, () => sync())
        .on(RoomEvent.TrackPublished, () => sync())
        .on(RoomEvent.TrackUnpublished, (_pub: RemoteTrackPublication) => sync())
        .on(RoomEvent.ParticipantNameChanged, () => sync())
        .on(RoomEvent.ParticipantMetadataChanged, () => sync())
        .on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
          setActiveSpeakers(
            [...speakers]
              .sort((a, b) => b.audioLevel - a.audioLevel)
              .map((p) => p.identity),
          );
        })
        .on(RoomEvent.ParticipantPermissionsChanged, (_prev, p: Participant) => {
          if (p.identity === room.localParticipant.identity) {
            if (p.permissions?.canPublish) {
              setNotice('The host gave you the mic. Hold the key to talk.');
              // Arm immediately so the first press is instant.
              void armMic();
            } else {
              setNotice('The host took the mic back.');
              void disarmMic();
            }
          }
          sync();
        })
        .on(
          RoomEvent.DataReceived,
          (
            payload: Uint8Array,
            participant?: RemoteParticipant,
            _kind?: unknown,
            topic?: string,
          ) => {
            if (topic !== DATA_TOPIC || !participant) return;
            let packet: WirePacket;
            try {
              packet = JSON.parse(new TextDecoder().decode(payload)) as WirePacket;
            } catch {
              return;
            }

            if (packet.t === 'chat') {
              // The roster is the source of truth for names, not the packet.
              const name = participant.name || participant.identity;
              const identity = participant.identity;
              setMessages((prev) =>
                prev.some((m) => m.id === packet.id)
                  ? prev
                  : [
                      ...prev,
                      {
                        id: packet.id,
                        identity,
                        name,
                        text: packet.text,
                        ts: packet.ts,
                      },
                    ],
              );
            } else if (packet.t === 'hand') {
              if (packet.up) handsRef.current.add(participant.identity);
              else handsRef.current.delete(participant.identity);
              sync();
            }
          },
        )
        .on(RoomEvent.AudioPlaybackStatusChanged, () => {
          setNeedsAudioUnlock(!room.canPlaybackAudio);
        })
        .on(RoomEvent.Reconnecting, () => setStatus('reconnecting'))
        .on(RoomEvent.Reconnected, () => {
          setStatus('connected');
          sync();
        })
        .on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
          setStatus('closed');
          setEndedReason(describeEnd(reason));
          setMicArmed(false);
          setMicLive(false);
        });

      void (async () => {
        try {
          await room.connect(session.url, session.token);
          setStatus('connected');
          setNeedsAudioUnlock(!room.canPlaybackAudio);
          sync();

          // Arm the mic for anyone allowed to talk. Listeners are left alone —
          // no permission prompt for people who only came to listen.
          if (room.localParticipant.permissions?.canPublish) {
            await armMic();
          }
        } catch (err) {
          console.error('[airwave] connect failed', err);
          setError(
            'Could not reach the media server. Check your connection and try again.',
          );
          setStatus('closed');
        }
      })();
    },
    [armMic, disarmMic, sync],
  );

  /* ---------------------------------------------------------------- data --- */

  const publish = useCallback((packet: WirePacket) => {
    const room = roomRef.current;
    if (!room) return;
    const bytes = new TextEncoder().encode(JSON.stringify(packet));
    void room.localParticipant
      .publishData(bytes, { reliable: true, topic: DATA_TOPIC })
      .catch((err) => console.warn('[airwave] data publish failed', err));
  }, []);

  const sendChat = useCallback(
    (text: string) => {
      const room = roomRef.current;
      const session = sessionRef.current;
      const trimmed = text.trim();
      if (!room || !session || !trimmed) return;

      const id = makeId();
      const message: ChatMessage = {
        id,
        identity: session.identity,
        name: room.localParticipant.name || session.identity,
        text: trimmed,
        ts: Date.now(),
      };

      setMessages((prev) => [...prev, message]);
      publish({ t: 'chat', id, name: message.name, text: trimmed, ts: message.ts });

      // Fire and forget: this only feeds the replay buffer for late joiners,
      // so a failure costs history, never the message itself.
      void fetch(`/api/rooms/${session.room.code}/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, identity: session.identity, text: trimmed }),
      }).catch(() => undefined);
    },
    [publish],
  );

  const raiseHand = useCallback(
    (up: boolean) => {
      const room = roomRef.current;
      if (!room) return;
      const me = room.localParticipant.identity;
      if (up) handsRef.current.add(me);
      else handsRef.current.delete(me);
      sync();
      publish({ t: 'hand', up, name: room.localParticipant.name || me });
    },
    [publish, sync],
  );

  /* --------------------------------------------------------------- leave --- */

  const teardown = useCallback(() => {
    const room = roomRef.current;
    const track = micTrackRef.current;
    micTrackRef.current = null;
    openMicRef.current = false;

    try {
      track?.stop();
    } catch {
      // already stopped
    }
    if (room) {
      room.removeAllListeners();
      void room.disconnect(true);
    }
    roomRef.current = null;
    claimedTokenRef.current = null;

    audioBinRef.current?.remove();
    audioBinRef.current = null;
  }, []);

  const leave = useCallback(() => {
    teardown();
    setStatus('closed');
    setMicArmed(false);
    setMicLive(false);
    setOpenMicState(false);
    setPeers([]);
    setLevels({});
    setActiveSpeakers([]);
  }, [teardown]);

  const unlockAudio = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    void room
      .startAudio()
      .then(() => setNeedsAudioUnlock(false))
      .catch(() => setNeedsAudioUnlock(true));
  }, []);

  const clearNotice = useCallback(() => setNotice(null), []);

  /* -------------------------------------------------------------- levels --- */

  // Audio levels arrive as periodic speaker updates rather than per-frame
  // events, so they are polled and smoothed here. The decay stops meters
  // flickering to zero between updates.
  useEffect(() => {
    if (status !== 'connected' && status !== 'reconnecting') return;

    const tick = window.setInterval(() => {
      const room = roomRef.current;
      if (!room) return;

      const everyone: Participant[] = [
        room.localParticipant,
        ...room.remoteParticipants.values(),
      ];
      const next: Levels = {};
      const smooth = smoothRef.current;

      for (const p of everyone) {
        const raw = p.audioLevel ?? 0;
        const prev = smooth[p.identity] ?? 0;
        const value = raw > prev ? raw : prev * 0.7;
        smooth[p.identity] = value;
        next[p.identity] = { level: Math.min(1, value), speaking: p.isSpeaking };
      }
      for (const key of Object.keys(smooth)) {
        if (!(key in next)) delete smooth[key];
      }
      setLevels(next);
    }, 120);

    return () => window.clearInterval(tick);
  }, [status]);

  /* ------------------------------------------------------------- unmount --- */

  useEffect(() => () => teardown(), [teardown]);

  const me = useMemo(() => peers.find((p) => p.isLocal) ?? null, [peers]);

  return {
    status,
    error,
    endedReason,
    notice,
    peers,
    me,
    levels,
    activeSpeakers,
    micArmed,
    micLive,
    openMic,
    canTalk,
    micError,
    needsAudioUnlock,
    messages,
    connect,
    leave,
    armMic,
    disarmMic,
    startTalking,
    stopTalking,
    setOpenMic,
    sendChat,
    raiseHand,
    unlockAudio,
    clearNotice,
  };
}
