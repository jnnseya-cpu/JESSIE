import { ImageResponse } from 'next/og';
import { postBySlug } from '../posts';
import { publishedBySlug } from '../published';

/**
 * The card a share actually shows.
 *
 * Every page on this site declared `twitter: { card: 'summary_large_image' }`
 * and no image existed anywhere — no `opengraph-image`, no static file, no
 * `images` key. A large-image card with no image is worse than no card at
 * all: the platform reserves the space and renders a blank, so an article
 * shared into Slack, WhatsApp, LinkedIn or a group chat arrived as a grey
 * rectangle with a URL under it. That is the first impression of every
 * link this blog will ever earn, and it was empty.
 *
 * Generated per article rather than one static picture, because the thing
 * worth showing is the headline. Rendered at request time and cached by
 * the platform, so a retitled article gets a corrected card without
 * anybody exporting anything.
 *
 * Deliberately typographic: no photograph, no stock image of somebody
 * stretching. A picture of a person exercising is the visual language of
 * the category this product exists to argue with, and it would be the
 * loudest thing on the card.
 */
export const runtime = 'nodejs';
export const alt = 'JESS MOVE';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const corpus = postBySlug(slug);
  const live = corpus ? null : await publishedBySlug(slug);

  const title = corpus?.title ?? live?.title ?? 'JESS MOVE';
  const category = corpus?.category ?? live?.category ?? 'Writing';

  /*
   * The title sets its own size. A forty-character headline set at the
   * size a ninety-character one needs looks like an apology, and a long
   * one at the short one's size overflows the card and is cropped by the
   * platform rather than by us.
   */
  const titleSize = title.length > 78 ? 50 : title.length > 52 ? 60 : 70;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          // The ink ground and the teal the rest of the site uses. Written
          // out rather than imported: this renders in an isolated image
          // runtime with no stylesheet and no custom properties.
          background: '#0d1b2a',
          color: '#f4faf9',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ width: 16, height: 16, borderRadius: 8, background: '#2ec4b6' }} />
          <div style={{ fontSize: 26, letterSpacing: 6, fontWeight: 700 }}>JESS MOVE</div>
        </div>

        <div
          style={{
            display: 'flex',
            fontSize: titleSize,
            lineHeight: 1.14,
            fontWeight: 700,
            maxWidth: 1000,
          }}
        >
          {title}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 20, fontSize: 24 }}>
          <div style={{ color: '#2ec4b6', fontWeight: 600 }}>{category}</div>
          <div style={{ color: '#8aa0b2' }}>jessmove.com</div>
        </div>
      </div>
    ),
    size,
  );
}
