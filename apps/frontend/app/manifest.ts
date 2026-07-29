import type { MetadataRoute } from 'next';
import { BRAND, TAGLINE } from '@jessmove/shared';

/**
 * The web app manifest.
 *
 * Next serves this at `/manifest.webmanifest` and links it from every page,
 * so there is no file to keep in sync with the brand constants.
 *
 * Two things chosen deliberately:
 *
 * `display: 'standalone'` rather than `fullscreen`. A movement product is
 * used in short bursts between other things — hiding the status bar means
 * hiding the clock, and the clock is the reason somebody knows they have
 * four minutes.
 *
 * A **maskable** icon as well as an ordinary one. Android crops icons to
 * whatever shape the launcher uses and will shave the corners off a square
 * one; the maskable variant keeps the JM mark inside the safe circle.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${BRAND.platform} — ${TAGLINE}`,
    short_name: BRAND.app,
    description: BRAND.descriptor,
    id: '/',
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#102A43',
    theme_color: '#102A43',
    lang: 'en-GB',
    dir: 'ltr',
    categories: ['health', 'fitness', 'lifestyle', 'medical'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    /* Long-press the installed icon to reach these. Four is the most any
       launcher shows, so the list stops at four. */
    shortcuts: [
      {
        name: 'Start a movement',
        short_name: 'Move',
        description: 'The next best micro-movement for right now',
        url: '/micro-movement?source=shortcut',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
      {
        name: 'Scan a meal',
        short_name: 'FoodLens',
        description: 'Read a plate and see the evidence behind the reading',
        url: '/foodlens?source=shortcut',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
      {
        name: 'Ask MOVA',
        short_name: 'MOVA',
        description: 'The coach, and why it suggested what it suggested',
        url: '/mova?source=shortcut',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
      {
        name: 'Today’s challenge',
        short_name: 'Challenges',
        description: 'Your crew, and how the week is going',
        url: '/challenges?source=shortcut',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
    ],
    prefer_related_applications: false,
  };
}
