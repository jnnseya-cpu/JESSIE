import Link from 'next/link';
import { BRAND, SIGNATURE_LINE } from '@jessie-os/shared';

/* ---------------- marks and icons (no external assets) ---------------- */

export function Mark() {
  return (
    <svg className="brand__mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#00E08A" />
      <path
        d="M8 19.5h3.4l2.1-6.4 2.9 9 2.4-7.2 1.5 4.6H24"
        fill="none"
        stroke="#0B1220"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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
  { href: '/for-children', label: 'For children' },
  { href: '/for-adults', label: 'For adults' },
  { href: '/body-balance', label: 'Body Balance' },
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
        <a className="btn btn--primary" href="#cta">
          Request access
        </a>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="foot">
      <div className="wrap">
        <div className="foot__top">
          <div className="brand">
            <Mark />
            <span>{BRAND.platform}</span>
          </div>
          <p className="foot__sig">
            Movement, engineered into the gaps. Ten to a hundred. Every body qualifies.
          </p>
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

export function SkipLink() {
  return (
    <a className="skip" href="#main">
      Skip to content
    </a>
  );
}
