# Airwave

Anonymous live audio channels over WebRTC. No accounts, no signup, no database —
open a channel, share the 6-character code, talk.

## What's here

- **Rooms** — public or password-protected, listed or unlisted, in one of two
  modes: **Broadcast** (host talks, listeners must be granted the mic) or
  **Open floor** (everyone can talk, push-to-talk by default).
- **Audio** — live WebRTC audio over [LiveKit](https://livekit.io), push-to-talk
  with an optional "stay unmuted" mode, per-speaker level meters and a clear
  speaking indicator.
- **Identity** — a display name typed at join time, remembered locally for next
  time. Nothing permanent, no login.
- **Text chat** — real-time, riding the same LiveKit data channel as everything
  else, with a short replay buffer for people who join mid-conversation.
- **Moderation** — the person who opens a channel gets a session-only host key
  (never a login) that can mute, kick, or hand out the mic.
- **PWA** — installable on a phone's home screen, works full-screen, keeps the
  screen awake while you're in a channel.

## How identity and hosting work without accounts

There are no user accounts anywhere in this app. Two lightweight, local-only
mechanisms stand in for them:

- **Display name** — kept in `localStorage` purely so you don't retype it. It's
  sent to the server only at join time.
- **Host key** — when you open a channel, the server hands your tab a random
  secret (`hostKey`) that proves you created it. It's kept in
  `sessionStorage`, so it survives a refresh but not a new tab, and it's the
  entire authorization story for moderation — see `lib/codes.ts` and
  `app/api/rooms/[code]/moderate/route.ts`.

Room data (titles, passwords, chat scrollback, who's been kicked) lives in a
single in-memory registry (`lib/store.ts`) — there is no database. That's a
deliberate constraint, not an oversight, but it has two consequences:

1. The app **must run as a single instance**. `render.yaml` pins this.
2. A restart forgets titles, passwords, and chat history. Live audio itself
   is unaffected — LiveKit holds that state independently — so a channel just
   reappears as an untitled public one and keeps working.

## Setup

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local` with LiveKit credentials — free at
[cloud.livekit.io](https://cloud.livekit.io) (Settings → Keys), or point at a
self-hosted `livekit-server`:

```
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=APIxxxxxxxxxxxx
LIVEKIT_API_SECRET=your-api-secret
```

Then:

```bash
npm run dev
```

Open <http://localhost:3000>. `GET /api/health` reports whether the app can
reach LiveKit — handy while setting up credentials.

## Project layout

```
app/
  page.tsx                 lobby: browse channels, create, join by code
  room/[code]/page.tsx     the live room: join form, roster, PTT, chat
  api/rooms/                REST endpoints backing both pages
lib/
  types.ts                 shared client/server contract
  store.ts                 in-memory channel registry
  livekit.ts               livekit-server-sdk wrapper (tokens, moderation)
  codes.ts                 room codes, password hashing, text hygiene
hooks/
  useLiveRoom.ts            the LiveKit client connection + all room state
  useLocalIdentity.ts       display name + host key, both local-only
components/
  ui.tsx, Icons.tsx          shared UI primitives
public/
  manifest.webmanifest, sw.js, icons/   PWA shell
```

## Deploying

`render.yaml` deploys this as a single Node web service on
[Render](https://render.com) — set the three `LIVEKIT_*` secrets in the
dashboard (they're marked `sync: false` so they're not committed). Any
single-instance Node host works the same way; just make sure it isn't
horizontally scaled, per the note above.
