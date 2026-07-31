'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MobileSession } from './nav-session';

/**
 * The mobile menu.
 *
 * Below 860px the desktop link row is hidden and this replaces it.
 *
 * The sheet is rendered through a portal onto <body>, not inside the
 * header, and covers the whole screen with its own close button. That is
 * not a stylistic choice: the header carries a `backdrop-filter`, and a
 * filtered ancestor becomes the containing block for fixed-position
 * descendants — so a sheet living inside the header gets its "full screen"
 * geometry computed against a 68px bar. Desktop Chrome happened to render
 * it anyway; real phones did not, and the menu opened underneath the page.
 * Escaping the header entirely is the fix that cannot regress.
 */

export function MobileMenu({
  items,
  current,
}: {
  items: readonly { href: string; label: string }[];
  current: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

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

  const sheet = (
    <div className="mnav__sheet" id="mobile-menu" role="dialog" aria-modal="true" aria-label="Menu">
      <div className="mnav__sheethead">
        <span className="mnav__title">Menu</span>
        <button
          type="button"
          className="mnav__toggle"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
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
      <MobileSession onNavigate={() => setOpen(false)} />
    </div>
  );

  return (
    <div className="mnav">
      <button
        type="button"
        className="mnav__toggle"
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label="Open menu"
        onClick={() => setOpen(true)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>

      {mounted && open && createPortal(sheet, document.body)}
    </div>
  );
}
