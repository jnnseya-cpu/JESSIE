'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

/**
 * The mobile menu.
 *
 * Below 860px the desktop link row is hidden, and until this component
 * existed nothing replaced it — on a phone, and in the installed app,
 * the site had no navigation beyond the logo. A PWA lives or dies on its
 * phone experience, so this is not cosmetic.
 *
 * It is a client component only because it must close itself: Next
 * navigates client-side, so a menu that cannot hear the click stays open
 * over the new page.
 */

export function MobileMenu({
  items,
  current,
}: {
  items: readonly { href: string; label: string }[];
  current: string;
}) {
  const [open, setOpen] = useState(false);

  // The page behind the sheet must not scroll while the menu is over it.
  useEffect(() => {
    document.documentElement.style.overflow = open ? 'hidden' : '';
    return () => {
      document.documentElement.style.overflow = '';
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="mnav">
      <button
        type="button"
        className="mnav__toggle"
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? 'Close menu' : 'Open menu'}
        onClick={() => setOpen((v) => !v)}
      >
        {/* Drawn lines rather than a glyph, so it renders identically everywhere. */}
        <svg viewBox="0 0 24 24" aria-hidden="true">
          {open ? (
            <path d="M6 6l12 12M18 6L6 18" />
          ) : (
            <path d="M4 7h16M4 12h16M4 17h16" />
          )}
        </svg>
      </button>

      {open && (
        <div className="mnav__sheet" id="mobile-menu">
          <nav aria-label="Primary">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={item.href === current ? 'page' : undefined}
                className={item.href === current ? 'is-current' : undefined}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <Link className="btn btn--primary" href="/get-started" onClick={() => setOpen(false)}>
            Get started
          </Link>
        </div>
      )}
    </div>
  );
}
