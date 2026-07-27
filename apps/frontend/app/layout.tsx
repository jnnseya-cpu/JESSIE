import type { Metadata, Viewport } from 'next';
import { BRAND, SIGNATURE_LINE } from '@jessie-os/shared';
import './globals.css';

export const metadata: Metadata = {
  title: `${BRAND.platform} — ${BRAND.expansion}`,
  description:
    'The movement operating system for human beings aged 10 to 100. Context-verified micro-movement, ' +
    'delivered into the gaps of a real day, for every body.',
  applicationName: BRAND.platform,
  authors: [{ name: 'Jessie' }],
  keywords: [
    'movement operating system',
    'sedentary behaviour',
    'workplace wellbeing',
    'adaptive movement',
    'falls prevention',
    'accessible fitness',
  ],
  openGraph: {
    title: `${BRAND.platform} — movement, engineered into the gaps`,
    description:
      'Fitness apps compete for the hour you do not have. JESSIE-OS owns the 200 two-minute gaps you did not know you had.',
    type: 'website',
  },
  other: { 'powered-by': SIGNATURE_LINE },
};

export const viewport: Viewport = {
  themeColor: '#0B1220',
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
