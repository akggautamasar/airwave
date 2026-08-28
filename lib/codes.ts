import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import { LIMITS } from './types';

/**
 * Channel codes get read aloud over voice ("tune into K7M4Q2"), so the
 * alphabet drops every glyph people confuse when listening or squinting:
 * 0, 1, I, L, O are all excluded.
 */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
/** Regex-equivalent of ALPHABET: 2-9, A-H, J, K, M, N, P-Z. */
const NOT_IN_ALPHABET = /[^2-9A-HJKMNP-Z]/g;
const CODE_LENGTH = 6;

/** Largest multiple of the alphabet length that fits in a byte, for unbiased sampling. */
const REJECT_ABOVE = Math.floor(256 / ALPHABET.length) * ALPHABET.length;

export function newRoomCode(): string {
  let out = '';
  while (out.length < CODE_LENGTH) {
    const bytes = randomBytes(CODE_LENGTH * 2);
    for (const b of bytes) {
      if (b >= REJECT_ABOVE) continue; // discard, otherwise low glyphs skew common
      out += ALPHABET[b % ALPHABET.length];
      if (out.length === CODE_LENGTH) break;
    }
  }
  return out;
}

export function isRoomCode(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length === CODE_LENGTH &&
    [...value].every((c) => ALPHABET.includes(c))
  );
}

/**
 * Turns what a human typed into a canonical code, or null if it can't be one.
 * Case and separators are forgiven; characters outside the alphabet are
 * dropped, since a code can never legitimately contain them.
 */
export function normalizeRoomCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const candidate = raw.toUpperCase().replace(NOT_IN_ALPHABET, '');
  return isRoomCode(candidate) ? candidate : null;
}

export function newId(bytes = 8): string {
  return randomBytes(bytes).toString('base64url');
}

export function newUuid(): string {
  return randomUUID();
}

/* -------------------------------------------------------------------------- */
/* Passwords                                                                  */
/* -------------------------------------------------------------------------- */

const SCRYPT_KEYLEN = 32;

export interface PasswordHash {
  salt: string;
  hash: string;
}

export function hashPassword(password: string): PasswordHash {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return { salt, hash };
}

export function verifyPassword(
  password: string,
  stored: { salt: string | null; hash: string | null },
): boolean {
  if (!stored.salt || !stored.hash) return true; // channel isn't protected
  const attempt = scryptSync(password, stored.salt, SCRYPT_KEYLEN);
  const expected = Buffer.from(stored.hash, 'hex');
  if (attempt.length !== expected.length) return false;
  return timingSafeEqual(attempt, expected);
}

/** Constant-time comparison for the host's session secret. */
export function secretsMatch(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/* -------------------------------------------------------------------------- */
/* Text hygiene                                                               */
/* -------------------------------------------------------------------------- */

/** C0/C1 controls plus the zero-width and bidi glyphs used to spoof names. */
const INVISIBLE_OR_CONTROL =
  /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g;

/** Same, but newlines survive — chat messages may be multi-line. */
const CONTROL_KEEP_NEWLINE =
  /[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g;

function clean(raw: string, max: number): string {
  return raw
    .replace(INVISIBLE_OR_CONTROL, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function cleanDisplayName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = clean(raw, LIMITS.nameMax);
  return name.length >= LIMITS.nameMin ? name : null;
}

export function cleanTitle(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const title = clean(raw, LIMITS.titleMax);
  return title.length >= 1 ? title : null;
}

export function cleanChatText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw
    .replace(CONTROL_KEEP_NEWLINE, '')
    // Collapse runs of blank lines so nobody can shove the panel around.
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, LIMITS.chatMax);
  return text.length >= 1 ? text : null;
}

export function cleanDeviceId(raw: unknown): string {
  if (typeof raw !== 'string') return 'unknown';
  const id = raw.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  return id.length >= 8 ? id : 'unknown';
}

/**
 * LiveKit identities must be unique within a room, but display names are a
 * free-for-all. Pairing a readable slug with random bytes lets two people
 * called "sam" both join, and stops anyone claiming an existing identity.
 */
export function buildIdentity(displayName: string): string {
  const slug =
    displayName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 12) || 'guest';
  return `${slug}__${newId(6)}`;
}
