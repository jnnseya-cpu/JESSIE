'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiBase } from '../../api-base';
import { Footer, Nav, PageHero, SkipLink } from '../../ui';

interface Resolved {
  found: boolean;
  says?: string;
  code?: string;
  label?: string;
  active?: boolean;
  kindLabel?: string;
  forThem?: { handsItTo: string; asksFirst: string; answeredBy: string };
  promise?: string[];
  noFee?: string;
  retired?: string | null;
}

/**
 * Where the code is remembered, and why it is remembered here rather than
 * in a cookie.
 *
 * `sessionStorage` lasts exactly as long as the tab. That is the right
 * lifetime: it is enough to carry the code from this page to the account
 * page two clicks later, and it is gone when they close the tab, so
 * nothing follows anybody around afterwards. A cookie would outlive the
 * visit and would need a banner, for a piece of information whose only
 * job is to survive ninety seconds.
 */
export const REFERRAL_KEY = 'jm_referrer_code';

export function JoinLanding({ code }: { code: string }) {
  const [state, setState] = useState<'loading' | 'ready'>('loading');
  const [data, setData] = useState<Resolved | null>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(REFERRAL_KEY, code);
    } catch {
      /* private browsing: the account still works, the attribution is lost */
    }

    void fetch(`${apiBase()}/referrers/${encodeURIComponent(code)}`)
      .then((r) => r.json())
      .then((j) => setData(j.data as Resolved))
      .catch(() => setData({ found: false }))
      .finally(() => setState('ready'));

    // Landing is recorded with the code attached, so a route that brings
    // people who never open the account page is visible as exactly that.
    void fetch(`${apiBase()}/funnel`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({ step: 'landed', path: `/join/${code}`, referrerCode: code }),
    }).catch(() => undefined);
  }, [code]);

  const sentBy = data?.found ? data.label : null;

  return (
    <>
      <SkipLink />
      <Nav current="/join" />

      <main id="main">
        <PageHero
          crumb="An introduction"
          eyebrow={sentBy ? `Passed on by ${sentBy}` : 'An introduction'}
          title="Somebody thought this might help."
          lede={
            sentBy
              ? `${sentBy} passes this on to people they work with. They are not paid to, and neither is anybody else. Here is what it is before you decide anything.`
              : 'Here is what this is, what it costs, and what happens to anything you record — before you decide anything.'
          }
        />

        {state === 'loading' && (
          <section className="section">
            <div className="wrap">
              <p className="asr__lede">Loading…</p>
            </div>
          </section>
        )}

        {state === 'ready' && (
          <>
            {/* What it will not do, first. */}
            <section className="section">
              <div className="wrap">
                <p className="eyebrow">Before anything else</p>
                <h2>What it will never do.</h2>
                <ul className="join__promise">
                  {(data?.promise ?? []).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                {data?.noFee && <p className="join__nofee">{data.noFee}</p>}
                {data?.retired && <p className="join__retired">{data.retired}</p>}
                {data && !data.found && <p className="join__retired">{data.says}</p>}
              </div>
            </section>

            {/* The question the person passing it on actually asked. */}
            {data?.forThem && (
              <section className="section section--tint">
                <div className="wrap">
                  <p className="eyebrow">{data.kindLabel}</p>
                  <h2>The question people in this role ask first.</h2>
                  <blockquote className="join__asks">{data.forThem.asksFirst}</blockquote>
                  <p className="asr__lede">{data.forThem.answeredBy}</p>
                  <p className="join__checkable">
                    None of that is a claim you have to take on trust. Everything the platform
                    refuses to do is published at <Link href="/assurance">/assurance</Link>,
                    generated from the code rather than written about it — including the four
                    things it does not do and has not finished.
                  </p>
                </div>
              </section>
            )}

            <section className="section">
              <div className="wrap">
                <p className="eyebrow">If it sounds useful</p>
                <h2>Two minutes, free, and nothing to install.</h2>
                <p className="asr__lede">
                  The account is free and everything that is not AI stays free. AI features come
                  with a small allowance for two months and then need a plan — said here rather
                  than after you have signed up. Under 18, a parent or guardian confirms before
                  anything opens.
                </p>
                <div className="cta__row" style={{ justifyContent: 'flex-start' }}>
                  <Link className="btn btn--primary" href="/account">
                    Create your account
                  </Link>
                  <Link className="btn btn--ghost" href="/how-it-works">
                    How it works
                  </Link>
                </div>
              </div>
            </section>
          </>
        )}
      </main>

      <Footer />
    </>
  );
}
