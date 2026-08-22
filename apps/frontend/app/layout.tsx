import type { Metadata, Viewport } from 'next';
import { BRAND, SIGNATURE_LINE, TAGLINE } from '@jessmove/shared';
import './globals.css';
import { PwaRuntime } from './pwa';
import { AppReady, LaunchSplash } from './splash';
import { Measurement } from './tracking';
import { splashEntries } from './splash-targets';

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
    /*
     * The launch screens. `capable: true` without these is what produced a
     * blank white rectangle every time somebody opened the installed app on
     * an iPhone: iOS ignores the manifest for launch — Chrome composes one
     * from `background_color` and the icon, Safari does not — and shows
     * nothing at all unless a startup image matches the device exactly.
     *
     * Derived from `splashEntries()` rather than written out, because the
     * same list generates the images at build time and thirty-six
     * hand-copied media queries would eventually stop matching thirty-six
     * hand-copied filenames.
     */
    startupImage: splashEntries().map(({ url, media }) => ({ url, media })),
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
        {/*
          First in the body so it is in the first bytes the browser parses
          and paints with the first frame. Placed after nothing, and before
          the application, because a launch screen that arrives after the
          layout it is covering has already shown the layout.
        */}
        <LaunchSplash />
        {children}
        <AppReady />
        <PwaRuntime />
        {/*
          Mounted once, here, rather than per page. It decides for itself
          whether the current path may carry a tag, so the account and every
          health surface get no banner and no script — not a hidden one, none.
        */}
        <Measurement />
      </body>
    </html>
  );
}
