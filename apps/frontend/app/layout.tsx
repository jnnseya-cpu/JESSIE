import type { Metadata, Viewport } from 'next';
import { BRAND, SIGNATURE_LINE, TAGLINE } from '@jessmove/shared';
import './globals.css';
import { PwaRuntime } from './pwa';

export const metadata: Metadata = {
  title: `${BRAND.platform} — ${TAGLINE}`,
  description:
    `${BRAND.descriptor}. Jess Move finds realistic movement opportunities across work, home ` +
    'and commute, then turns them into personalised missions that fit the day you already have. ' +
    'Six adaptive modes, ages 10 to 100.',
  applicationName: BRAND.platform,
  authors: [{ name: 'Jess Move' }],
  keywords: [
    'micro-movement',
    'movement operating system',
    'sedentary behaviour',
    'workplace wellbeing',
    'AI health coach',
    'adaptive movement',
    'falls prevention',
    'accessible fitness',
    'food intelligence',
  ],
  openGraph: {
    title: `${BRAND.platform} — ${TAGLINE}`,
    description: BRAND.fullName,
    type: 'website',
  },
  other: { 'powered-by': SIGNATURE_LINE },
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: BRAND.app,
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#102A43',
  width: 'device-width',
  initialScale: 1,
  // Installed apps sit under the notch and the home indicator; without
  // viewport-fit the content is clipped on an iPhone in standalone mode.
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>
        {children}
        <PwaRuntime />
      </body>
    </html>
  );
}
