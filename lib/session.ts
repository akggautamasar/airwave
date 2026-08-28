'use client';

import type { SessionResponse } from './types';

/**
 * Carries a SessionResponse from the lobby (where it was minted by
 * POST /api/rooms or /join) to the room page's first render.
 *
 * This is not "session storage" in the auth sense — there is no server
 * session to persist. It just avoids a redundant join call for the common
 * case of create-or-join-then-navigate. A direct visit to /room/[code]
 * (shared link, refresh) finds nothing here and falls back to the room
 * page's own join form.
 */
const key = (code: string) => `airwave:pending:${code}`;

export function stashSession(code: string, session: SessionResponse): void {
  try {
    window.sessionStorage.setItem(key(code), JSON.stringify(session));
  } catch {
    // Private browsing or a full quota — the room page's join form covers it.
  }
}

export function takeSession(code: string): SessionResponse | null {
  try {
    const raw = window.sessionStorage.getItem(key(code));
    if (!raw) return null;
    window.sessionStorage.removeItem(key(code));
    return JSON.parse(raw) as SessionResponse;
  } catch {
    return null;
  }
}
