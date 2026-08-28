'use client';

import { useEffect } from 'react';

interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: 'release', listener: () => void) => void;
}

interface WakeLockLike {
  request: (type: 'screen') => Promise<WakeLockSentinelLike>;
}

/**
 * Holds the screen awake while someone is in a channel.
 *
 * A radio you have to keep tapping to stop the screen sleeping is a bad radio.
 * Support is patchy (no iOS Safari at the time of writing), so this is strictly
 * an enhancement: it re-acquires the lock when the tab becomes visible again,
 * because browsers drop it on backgrounding.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;

    const nav = navigator as Navigator & { wakeLock?: WakeLockLike };
    if (!nav.wakeLock) return;

    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      try {
        sentinel = await nav.wakeLock!.request('screen');
      } catch {
        // Denied or unsupported in this context. Nothing to recover from.
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && (!sentinel || sentinel.released)) {
        void acquire();
      }
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      void sentinel?.release().catch(() => undefined);
      sentinel = null;
    };
  }, [active]);
}
