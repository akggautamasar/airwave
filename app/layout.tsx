import type { Metadata, Viewport } from 'next';
import { Barlow_Condensed, IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import './globals.css';
import { ServiceWorkerBridge } from '@/components/ServiceWorkerBridge';

/**
 * Type is doing the personality work here. Barlow Condensed labels the
 * instrument the way equipment panels do; IBM Plex Sans and Mono come from the
 * same engineering lineage, so channel codes and readouts feel like data rather
 * than decoration.
 */
const display = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-display',
  display: 'swap',
});

const body = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-body',
  display: 'swap',
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Airwave — live audio channels',
  description:
    'Open a channel, share the code, talk. Live audio with no account, no signup and nothing stored.',
  applicationName: 'Airwave',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Airwave',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  formatDetection: { telephone: false },
  other: {
    // Stops iOS trying to be clever with a full-screen web app's status bar.
    'mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Pinch zoom stays available — locking it out fails accessibility checks.
  maximumScale: 5,
  // Lets the layout reach under the notch, with safe-area padding doing the work.
  viewportFit: 'cover',
  themeColor: '#0B1014',
};

/**
 * Applied before first paint so the app never flashes the wrong palette.
 * Falls back to the OS preference on a first visit, then remembers the toggle.
 */
const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem('airwave:theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}document.documentElement.dataset.theme=t;var m=document.querySelector('meta[name="theme-color"]');if(m){m.setAttribute('content',t==='light'?'#E9EDF0':'#0B1014');}}catch(e){document.documentElement.dataset.theme='dark';}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${display.variable} ${body.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen-dvh bg-base text-ink">
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        {children}
        <ServiceWorkerBridge />
      </body>
    </html>
  );
}
