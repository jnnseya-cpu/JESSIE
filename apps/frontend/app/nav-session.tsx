'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiBase } from './api-base';

/**
 * The header's account corner. Signed out: Sign in + Start free.
 * Signed in: one button carrying the person's name into their account.
 * The check is a cookie-authenticated /auth/me — the page itself never
 * holds a token.
 */

export interface SessionMe {
  readonly displayName: string;
  readonly kind: string;
  readonly userId: string;
}

export function useMe(): SessionMe | null {
  const [me, setMe] = useState<SessionMe | null>(null);
  useEffect(() => {
    void fetch(`${apiBase()}/auth/me`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => setMe((json?.data as SessionMe) ?? null))
      .catch(() => setMe(null));
  }, []);
  return me;
}

export function NavSession() {
  const me = useMe();
  if (me) {
    return (
      <Link className="btn btn--primary nav__cta" href="/account">
        {me.displayName.split(' ')[0]}’s account
      </Link>
    );
  }
  return (
    <>
      <Link className="nav__signin" href="/account">
        Sign in
      </Link>
      {/*
        Straight to the account, not to the page that describes creating
        one. This button used to point at /get-started, which described
        five onboarding steps and ended in "Request access" pointing at a
        mailto: form — so the most-clicked control on the site led away
        from the working registration endpoint rather than to it.
      */}
      <Link className="btn btn--primary nav__cta" href="/account">
        Start free
      </Link>
    </>
  );
}

/** The mobile sheet's version of the same swap. */
export function MobileSession({ onNavigate }: { onNavigate: () => void }) {
  const me = useMe();
  if (me) {
    return (
      <Link href="/account" className="mnav__signin" onClick={onNavigate}>
        {me.displayName.split(' ')[0]}’s account
      </Link>
    );
  }
  return (
    <>
      <Link href="/account" className="mnav__signin" onClick={onNavigate}>
        Sign in / Create account
      </Link>
      <Link className="btn btn--primary" href="/account" onClick={onNavigate}>
        Start free
      </Link>
    </>
  );
}
