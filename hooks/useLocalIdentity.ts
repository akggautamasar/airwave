'use client';

import { useEffect, useState } from 'react';

const NAME_KEY = 'airwave:name';
const DEVICE_KEY = 'airwave:device';

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage refused. Everything still works for this session.
  }
}

/**
 * The closest thing this app has to an account: a display name remembered
 * between visits purely so nobody has to retype it, and a random device id
 * used to make a host's kick stick for longer than a page refresh.
 *
 * Neither is sent anywhere except at join time, and neither identifies a person
 * across devices.
 */
export function useLocalIdentity(): {
  ready: boolean;
  name: string;
  setName: (value: string) => void;
  deviceId: string;
} {
  const [ready, setReady] = useState(false);
  const [name, setNameState] = useState('');
  const [deviceId, setDeviceId] = useState('');

  useEffect(() => {
    setNameState(read(NAME_KEY) ?? '');

    let id = read(DEVICE_KEY);
    if (!id || id.length < 8) {
      id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID().replace(/-/g, '')
          : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
      write(DEVICE_KEY, id);
    }
    setDeviceId(id);
    setReady(true);
  }, []);

  const setName = (value: string) => {
    setNameState(value);
    write(NAME_KEY, value);
  };

  return { ready, name, setName, deviceId };
}

/* -------------------------------------------------------------------------- */
/* Host keys                                                                  */
/* -------------------------------------------------------------------------- */

const hostKeyName = (code: string) => `airwave:host:${code}`;

/**
 * A host's proof of ownership. Kept in sessionStorage rather than localStorage
 * because the powers are meant to last as long as the tab, not forever.
 */
export function saveHostKey(code: string, key: string): void {
  try {
    window.sessionStorage.setItem(hostKeyName(code), key);
  } catch {
    // Without storage the host keeps powers until they navigate away.
  }
}

export function loadHostKey(code: string): string | null {
  try {
    return window.sessionStorage.getItem(hostKeyName(code));
  } catch {
    return null;
  }
}

export function clearHostKey(code: string): void {
  try {
    window.sessionStorage.removeItem(hostKeyName(code));
  } catch {
    // nothing to do
  }
}
