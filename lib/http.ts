import { ConfigError } from './livekit';
import type { ApiErrorCode, ApiErrorResponse } from './types';

/** Success payload. Room state is live, so nothing here is ever cacheable. */
export function ok<T>(data: T, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

const STATUS_FOR: Record<ApiErrorCode, number> = {
  bad_request: 400,
  bad_password: 401,
  forbidden: 403,
  kicked: 403,
  not_found: 404,
  room_full: 409,
  rate_limited: 429,
  not_configured: 503,
  server_error: 500,
};

export function fail(
  error: ApiErrorCode,
  message: string,
  extraHeaders?: Record<string, string>,
): Response {
  const body: ApiErrorResponse = { error, message };
  return Response.json(body, {
    status: STATUS_FOR[error],
    headers: { 'Cache-Control': 'no-store', ...extraHeaders },
  });
}

/**
 * Turns a thrown value into a response. Configuration problems get their own
 * code so the UI can show setup instructions instead of "something broke".
 */
export function handleError(context: string, err: unknown): Response {
  if (err instanceof ConfigError) {
    console.error(`[airwave] ${context}: not configured — ${err.message}`);
    return fail('not_configured', err.message);
  }
  const detail = err instanceof Error ? err.message : String(err);
  console.error(`[airwave] ${context}: ${detail}`);
  return fail(
    'server_error',
    'The media server did not respond. Check the LiveKit credentials and try again.',
  );
}

/** Parses a JSON body defensively; returns null on anything unexpected. */
export async function readJson<T>(req: Request): Promise<T | null> {
  const type = req.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) return null;
  try {
    const body = (await req.json()) as unknown;
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return null;
    }
    return body as T;
  } catch {
    return null;
  }
}
