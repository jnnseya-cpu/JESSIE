/**
 * The launch screens an installed app needs, defined once.
 *
 * Android and desktop do not need this list at all: Chrome composes a
 * launch screen from the manifest's `name`, `background_color` and the
 * 512px icon, all of which are already set. iOS does not. Safari ignores
 * the manifest for launch and uses `apple-touch-startup-image` link tags,
 * and it only uses one if a `media` query matches the device exactly — so
 * an installed app with no matching entry launches to a blank white
 * rectangle for as long as the first paint takes.
 *
 * That is the whole reason this file exists, and the reason it is a single
 * exported list rather than markup in the layout and a separate script that
 * writes images: the `<link>` tags and the generated PNGs have to agree on
 * every dimension, and two hand-maintained lists of twenty numbers will not
 * stay in agreement. Both are derived from here.
 *
 * `width` and `height` are CSS pixels — what the media query compares
 * against — and `scale` is the device pixel ratio. The PNG is generated at
 * `width * scale` by `height * scale`, because iOS rejects an image whose
 * pixel dimensions do not match the device exactly and falls back to the
 * blank screen this is meant to prevent.
 *
 * Every device gets both orientations. An iPad is used in landscape most of
 * the time, and a portrait-only list means the most common way an iPad is
 * held is the one that shows nothing.
 */

export interface SplashTarget {
  /** CSS pixels, portrait. The media query is derived from these. */
  readonly width: number;
  readonly height: number;
  readonly scale: number;
  /** Which devices this covers, for the person reading the head tags. */
  readonly device: string;
}

/**
 * Current iPhones and iPads.
 *
 * This is a maintenance surface — a phone released next year will not be
 * here, and it will launch blank on iOS exactly as it does today. The
 * in-app splash is what keeps that from being a visible regression: it
 * paints on first paint regardless of device, so a missing entry costs a
 * few hundred milliseconds of brand rather than a white screen. Add new
 * devices here when they ship; nothing else needs touching.
 */
export const SPLASH_TARGETS: readonly SplashTarget[] = [
  // iPhone — Dynamic Island generation
  { width: 440, height: 956, scale: 3, device: 'iPhone 16 Pro Max, 15 Pro Max, 14 Pro Max' },
  { width: 402, height: 874, scale: 3, device: 'iPhone 16 Pro' },
  { width: 430, height: 932, scale: 3, device: 'iPhone 15 Plus, 14 Plus' },
  { width: 393, height: 852, scale: 3, device: 'iPhone 15, 15 Pro, 14 Pro' },
  // iPhone — notch generation
  { width: 428, height: 926, scale: 3, device: 'iPhone 13 Pro Max, 12 Pro Max' },
  { width: 390, height: 844, scale: 3, device: 'iPhone 14, 13, 13 Pro, 12, 12 Pro' },
  { width: 375, height: 812, scale: 3, device: 'iPhone 13 mini, 12 mini, X, XS, 11 Pro' },
  { width: 414, height: 896, scale: 3, device: 'iPhone 11 Pro Max, XS Max' },
  { width: 414, height: 896, scale: 2, device: 'iPhone 11, XR' },
  // iPhone — home button, still widely used by older members
  { width: 414, height: 736, scale: 3, device: 'iPhone 8 Plus, 7 Plus, 6s Plus' },
  { width: 375, height: 667, scale: 2, device: 'iPhone SE (2nd, 3rd gen), 8, 7, 6s' },
  { width: 320, height: 568, scale: 2, device: 'iPhone SE (1st gen)' },
  // iPad
  { width: 1032, height: 1376, scale: 2, device: 'iPad Pro 13"' },
  { width: 1024, height: 1366, scale: 2, device: 'iPad Pro 12.9"' },
  { width: 834, height: 1210, scale: 2, device: 'iPad Pro 11", Air 11"' },
  { width: 820, height: 1180, scale: 2, device: 'iPad Air 10.9"' },
  { width: 768, height: 1024, scale: 2, device: 'iPad 9.7", mini 4' },
  { width: 744, height: 1133, scale: 2, device: 'iPad mini 6' },
];

export type Orientation = 'portrait' | 'landscape';

/**
 * The filename a target maps to, in device pixels.
 *
 * Device pixels rather than CSS pixels because that is what the file
 * actually contains, and a reader comparing a 404 in the console against
 * this list should be comparing the same numbers Safari asked for.
 */
export function splashFile(target: SplashTarget, orientation: Orientation): string {
  const w = orientation === 'portrait' ? target.width : target.height;
  const h = orientation === 'portrait' ? target.height : target.width;
  return `${w * target.scale}x${h * target.scale}.png`;
}

/**
 * The media query Safari matches against.
 *
 * All three clauses are required. Without `-webkit-device-pixel-ratio` the
 * 414×896 devices collide — an iPhone 11 and an XS Max have identical CSS
 * dimensions and different pixel densities — and without `orientation` a
 * device silently takes the portrait image while held in landscape and
 * stretches it.
 */
export function splashMedia(target: SplashTarget, orientation: Orientation): string {
  return [
    `(device-width: ${target.width}px)`,
    `(device-height: ${target.height}px)`,
    `(-webkit-device-pixel-ratio: ${target.scale})`,
    `(orientation: ${orientation})`,
  ].join(' and ');
}

/** Every image the build must produce, and the tag that points at each. */
export function splashEntries(): { url: string; media: string; device: string }[] {
  const entries: { url: string; media: string; device: string }[] = [];
  for (const target of SPLASH_TARGETS) {
    for (const orientation of ['portrait', 'landscape'] as const) {
      entries.push({
        url: `/splash/${splashFile(target, orientation)}`,
        media: splashMedia(target, orientation),
        device: `${target.device} (${orientation})`,
      });
    }
  }
  return entries;
}

/** Parse `1290x2796.png` back into pixel dimensions, or null if it is not one. */
export function parseSplashFile(name: string): { width: number; height: number } | null {
  const m = /^(\d{2,5})x(\d{2,5})\.png$/.exec(name);
  if (!m) return null;
  const width = Number(m[1]);
  const height = Number(m[2]);
  // Bounded so a crafted request cannot ask the renderer for an enormous
  // canvas. Nothing legitimate exceeds an iPad Pro at 2x.
  if (width < 100 || height < 100 || width > 4000 || height > 4000) return null;
  return { width, height };
}
