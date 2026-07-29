import type { Metadata, Viewport } from 'next';
import { BRAND, SIGNATURE_LINE, TAGLINE } from '@jessmove/shared';
import './globals.css';

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
};

export const viewport: Viewport = {
  themeColor: '#102A43',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
