'use client';

import type {
  ApiErrorCode,
  ApiErrorResponse,
  CreateRoomBody,
  IpChatThreadResponse,
  JoinRoomBody,
  ModerateBody,
  MyIpResponse,
  OkResponse,
  RoomListResponse,
  RoomPeekResponse,
  SessionResponse,
} from './types';

/** An error the UI can show verbatim — the server already phrased it. */
export class ApiError extends Error {
  readonly code: ApiErrorCode;

  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: init?.body
        ? { 'content-type': 'application/json', ...init?.headers }
        : init?.headers,
      cache: 'no-store',
    });
  } catch {
    throw new ApiError('server_error', 'No connection. Check your network.');
  }

  if (!res.ok) {
    let body: ApiErrorResponse | null = null;
    try {
      body = (await res.json()) as ApiErrorResponse;
    } catch {
      // Non-JSON error page, e.g. from a proxy.
    }
    throw new ApiError(
      body?.error ?? 'server_error',
      body?.message ?? 'Something went wrong on the server.',
    );
  }

  return (await res.json()) as T;
}

export const listRooms = () => request<RoomListResponse>('/api/rooms');

export const peekRoom = (code: string) =>
  request<RoomPeekResponse>(`/api/rooms/${encodeURIComponent(code)}`);

export const openChannel = (body: CreateRoomBody) =>
  request<SessionResponse>('/api/rooms', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const joinChannel = (code: string, body: JoinRoomBody) =>
  request<SessionResponse>(`/api/rooms/${encodeURIComponent(code)}/join`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const moderate = (code: string, body: ModerateBody) =>
  request<OkResponse>(`/api/rooms/${encodeURIComponent(code)}/moderate`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

/* ---------------------------------------------------------------- IP Chat --- */

export const myIp = () => request<MyIpResponse>('/api/ipchat/me');

export const readIpThread = (targetIp: string, passphrase: string) =>
  request<IpChatThreadResponse>(
    `/api/ipchat?targetIp=${encodeURIComponent(targetIp)}&passphrase=${encodeURIComponent(passphrase)}`,
  );

export const sendIpChat = (targetIp: string, text: string, passphrase: string) =>
  request<IpChatThreadResponse>('/api/ipchat', {
    method: 'POST',
    body: JSON.stringify({ targetIp, text, passphrase }),
  });
