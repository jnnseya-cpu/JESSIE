import { ImageResponse } from 'next/og';
import { BRAND, TAGLINE } from '@jessmove/shared';
import { SPLASH_TARGETS, parseSplashFile, splashFile } from '../../splash-targets';

/**
 * The iOS launch images, rendered rather than stored.
 *
 * Thirty-six PNGs at device resolution is a lot of binary to keep in a
 * repository, and the moment they exist as files they start drifting: the
 * brand colour changes in `globals.css`, the mark changes in `mark.svg`,
 * and the launch screen keeps showing last year's identity because nobody
 * remembers that a folder of images encodes it too.
 *
 * `next/og` renders them at build time from the same constants everything
 * else uses, which costs no new dependency — it ships with Next — and no
 * committed assets. `dynamicParams: false` with `generateStaticParams`
 * means every one is produced during `next build` and served as a static
 * file afterwards, so nothing is rendered on demand in front of a user who
 * is waiting for an app to open.
 *
 * The design is deliberately almost nothing: the background colour the
 * manifest already declares, the mark, the name, the line. A launch screen
 * is not a place to communicate — it is the thing that stops the first
 * moment of the app being a white rectangle, and anything that invites
 * reading makes the wait feel longer than it is.
 */

export const dynamicParams = false;

export function generateStaticParams(): { file: string }[] {
  const files = new Set<string>();
  for (const target of SPLASH_TARGETS) {
    files.add(splashFile(target, 'portrait'));
    files.add(splashFile(target, 'landscape'));
  }
  // A Set because devices share resolutions — an iPhone 14 Plus and a 13
  // Pro Max both land on 1284×2778 in one orientation or another, and Next
  // refuses to build the same static param twice.
  return [...files].map((file) => ({ file }));
}

const INK = '#F4FAF9';
const GROUND = '#102A43';

export async function GET(
  _request: Request,
  { params }: { params: { file: string } },
): Promise<Response> {
  const size = parseSplashFile(params.file);
  if (!size) return new Response('not found', { status: 404 });

  const { width, height } = size;

  /*
   * Everything scales off the short edge, so one layout serves a 640px
   * iPhone SE and a 2732px iPad Pro without a second set of rules. Sizing
   * from the long edge instead would produce a mark that fills a phone in
   * landscape and a speck on a tablet in portrait.
   */
  const short = Math.min(width, height);
  const mark = Math.round(short * 0.22);
  const nameSize = Math.round(short * 0.062);
  const lineSize = Math.round(short * 0.032);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: GROUND,
        }}
      >
        {/*
          The mark, drawn rather than fetched. An <img> here would need the
          renderer to load a file over the network during the build, which
          is a build that can fail for a reason unrelated to the code.
        */}
        <svg width={mark} height={mark} viewBox="0 0 40 40">
          <defs>
            <linearGradient id="r" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor="#00A99D" />
              <stop offset="100%" stopColor="#B7E436" />
            </linearGradient>
          </defs>
          <rect width="40" height="40" rx="11" fill="#0B2136" />
          <path
            d="M31.5 12.2A13 13 0 1 1 20 7"
            fill="none"
            stroke="#3487F7"
            strokeOpacity="0.5"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M13.6 15.4v6.9a2.6 2.6 0 0 1-5.2 0"
            fill="none"
            stroke={INK}
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M17.4 26.4v-11l4.3 5.2 4.3-5.2v11"
            fill="none"
            stroke={INK}
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M26 26.4l3.2-5.4 2.9-5"
            fill="none"
            stroke="url(#r)"
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="32.1" cy="16" r="2.4" fill="#B7E436" />
        </svg>

        <div
          style={{
            marginTop: Math.round(short * 0.055),
            fontSize: nameSize,
            fontWeight: 700,
            letterSpacing: nameSize * 0.02,
            color: INK,
          }}
        >
          {BRAND.platform}
        </div>

        <div
          style={{
            marginTop: Math.round(short * 0.018),
            fontSize: lineSize,
            color: 'rgba(244, 250, 249, 0.58)',
          }}
        >
          {TAGLINE}
        </div>
      </div>
    ),
    { width, height },
  );
}
