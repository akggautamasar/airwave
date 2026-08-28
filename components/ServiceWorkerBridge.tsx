'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker that makes Airwave installable.
 *
 * Deliberately quiet: if registration fails the app keeps working, because the
 * worker only caches the shell. Live audio always needs the network anyway.
 */
export function ServiceWorkerBridge() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
      // Service workers need a secure context. Skip on plain-HTTP LAN testing.
      return;
    }

    const register = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .catch((err) => console.info('[airwave] service worker not registered', err));
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });

    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
