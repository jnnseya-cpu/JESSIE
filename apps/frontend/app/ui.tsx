import Link from 'next/link';
import { BRAND, SIGNATURE_LINE } from '@jessmove/shared';

/* ---------------- marks and icons (no external assets) ---------------- */

/**
 * The Jess Move mark. §9.
 *
 * A quest ring, a JM monogram, and a route that rises out through the gap
 * in the ring. The route uses the Movement Energy gradient (teal → lime)
 * and finishes above and beyond the M — the journey continues past the
 * letters rather than closing on them.
 *
 * The J and the M are drawn as strokes, not a font, so the mark renders
 * identically everywhere and needs no webfont to be correct.
 *
 * Deliberately not: a heart, a weighing scale, a running figure, a medical
 * cross, a dumbbell, a footprint, an apple, or a pulse line.
 */
export function Mark() {
  return (
    <svg className="brand__mark" viewBox="0 0 40 40" aria-hidden="true">
      <defs>
        <linearGradient id="jm-route" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#00A99D" />
          <stop offset="100%" stopColor="#B7E436" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill="#102A43" />
      {/* the quest ring — open at the top right, where the route leaves */}
      <path
        d="M31.5 12.2A13 13 0 1 1 20 7"
        fill="none"
        stroke="#3487F7"
        strokeOpacity="0.5"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      {/* the J — stem down, hooking left */}
      <path
        d="M13.6 15.4v6.9a2.6 2.6 0 0 1-5.2 0"
        fill="none"
        stroke="#F4FAF9"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* the M */}
      <path
        d="M17.4 26.4v-11l4.3 5.2 4.3-5.2v11"
        fill="none"
        stroke="#F4FAF9"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* the route rising through and beyond the letters */}
      <path
        d="M26 26.4l3.2-5.4 2.9-5"
        fill="none"
        stroke="url(#jm-route)"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="32.1" cy="16" r="2.4" fill="#B7E436" />
    </svg>
  );
}

export function Check() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" fill="none">
      <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M6 10.2l2.6 2.6L14 7.4"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Tick() {
  return (
    <svg className="tick" viewBox="0 0 20 20" aria-hidden="true" fill="none">
      <path
        d="M4 10.5l4 4L16 6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Cross() {
  return (
    <svg className="tick" viewBox="0 0 20 20" aria-hidden="true" fill="none">
      <path
        d="M5.5 5.5l9 9M14.5 5.5l-9 9"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** One small figure per variant — the five bodies the library must serve. */
export function VariantGlyph({ variant }: { variant: string }) {
  const stroke = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <svg className="variant__icon" viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="8.5" r="3.4" {...stroke} />
      {variant === 'standing' && (
        <path d="M20 12v11m0 0l-5 9m5-9l5 9M13 17h14" {...stroke} />
      )}
      {variant === 'seated' && (
        <path d="M20 12v9h8m-8 0l-1 8m1-8h-6M14 21v10" {...stroke} />
      )}
      {variant === 'chair_supported' && (
        <>
          <path d="M20 12v10m0 0l-4 9m4-9l4 9" {...stroke} />
          <path d="M30 14v18M30 22h-6" {...stroke} />
        </>
      )}
      {variant === 'bed_recliner' && (
        <path d="M20 12v7m0 0l9 3M8 26h24M11 22h9" {...stroke} />
      )}
      {variant === 'adaptive_single_limb' && (
        <>
          <path d="M20 12v8m0 0h-6" {...stroke} />
          <circle cx="15" cy="30" r="5" {...stroke} />
          <circle cx="27" cy="30" r="3" {...stroke} />
          <path d="M20 20v7" {...stroke} />
        </>
      )}
    </svg>
  );
}

/* ---------------- chrome ---------------- */

const NAV = [
  { href: '/', label: 'Platform' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/foodlens', label: 'FoodLens' },
  { href: '/industries', label: 'Industries' },
  { href: '/developers', label: 'Developers' },
  { href: '/about', label: 'About' },
];

export function Nav({ current }: { current: string }) {
  return (
    <header className="nav">
      <div className="wrap nav__inner">
        <Link className="brand" href="/">
          <Mark />
          <span>{BRAND.platform}</span>
        </Link>
        <nav className="nav__links" aria-label="Primary">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={item.href === current ? 'page' : undefined}
              className={item.href === current ? 'is-current' : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <Link className="btn btn--primary" href="/get-started">
          Get started
        </Link>
      </div>
    </header>
  );
}

/* ---------------- footer sitemap ---------------- */

const FOOT_NAV: ReadonlyArray<{
  heading: string;
  links: ReadonlyArray<{ href: string; label: string }>;
}> = [
  {
    heading: 'The OS',
    links: [
      { href: '/mova', label: 'MOVA AI Coach' },
      { href: '/micro-movement', label: 'Micro-Movement' },
      { href: '/foodlens', label: 'FoodLens 360°' },
      { href: '/body-balance', label: 'BodyCommand' },
      { href: '/challenges', label: 'Challenges' },
      { href: '/wearables', label: 'Wearables' },
    ],
  },
  {
    heading: 'Product',
    links: [
      { href: '/how-it-works', label: 'How it works' },
      { href: '/for-children', label: 'For children' },
      { href: '/for-adults', label: 'For adults' },
      { href: '/get-started', label: 'Get started' },
    ],
  },
  {
    heading: 'Solutions',
    links: [
      { href: '/industries', label: 'Industries' },
      { href: '/industries#workplaces', label: 'Workplaces' },
      { href: '/industries#schools', label: 'Schools' },
      { href: '/industries#care', label: 'Care & later life' },
      { href: '/industries#public-health', label: 'Councils & public health' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { href: '/about', label: 'About' },
      { href: '/blog', label: 'Blog' },
      { href: '/growth', label: 'Growth & Influencers' },
      { href: '/contact', label: 'Contact' },
    ],
  },
  {
    heading: 'Resources',
    links: [
      { href: '/developers', label: 'Developers' },
      { href: '/status', label: 'Platform status' },
      { href: '/policies', label: 'All policies' },
      { href: '/terms', label: 'Terms of Service' },
      { href: '/privacy', label: 'Privacy Policy' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="foot">
      <div className="wrap">
        <div className="foot__nav">
          <div className="foot__col">
            <div className="brand">
              <Mark />
              <span>{BRAND.platform}</span>
            </div>
            <p className="foot__pitch">
              Movement, engineered into the gaps. Ten to a hundred. Every body qualifies.
            </p>
            <Link className="foot__status" href="/status">
              <i aria-hidden="true" />
              All systems operational
            </Link>
          </div>

          {FOOT_NAV.map((col) => (
            <div className="foot__col" key={col.heading}>
              <h3>{col.heading}</h3>
              <ul>
                {col.links.map((l) => (
                  <li key={l.href + l.label}>
                    <Link href={l.href}>{l.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="foot__legal">
          <p>
            {BRAND.platform} is a general wellness product. It does not diagnose or treat any
            condition, does not replace professional clinical advice, and never contacts
            emergency services. Stop and seek advice if you feel pain, dizziness or any unusual
            symptom.
          </p>
          <p style={{ minWidth: 220 }}>{SIGNATURE_LINE}</p>
        </div>
      </div>
    </footer>
  );
}

/* ---------------- sub-page shell ---------------- */

export function PageHero({
  eyebrow,
  title,
  lede,
  crumb,
}: {
  eyebrow: string;
  title: React.ReactNode;
  lede: string;
  crumb?: string;
}) {
  return (
    <section className="phero">
      <div className="wrap">
        {crumb && (
          <p className="phero__crumbs">
            <Link href="/">{BRAND.platform}</Link>
            <span aria-hidden="true">/</span>
            <span>{crumb}</span>
          </p>
        )}
        <p className="eyebrow eyebrow--onDark">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="phero__lede">{lede}</p>
      </div>
    </section>
  );
}

export function SkipLink() {
  return (
    <a className="skip" href="#main">
      Skip to content
    </a>
  );
}
