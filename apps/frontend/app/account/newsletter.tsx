'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiBase } from '../api-base';

/**
 * The weekly newsletter, on screen.
 *
 * Two components, two audiences, and they are separate for a reason worth
 * writing down: the member's control is the legal artefact and the staff
 * panel is the editorial one. Conflating them produces the screen where an
 * administrator can flip somebody else's consent, which is precisely the
 * record a regulator would ask to see and the one thing that must not exist.
 *
 * `NewsletterConsent` is a member changing their own mind. It is a plain
 * on/off with the consequence stated in words next to it, not a pre-ticked
 * box in a settings list — a consent control that has to be hunted for is
 * not consent, and one that is on by default is not either.
 *
 * `NewsletterModule` is staff, and its job is to make approval possible
 * rather than convenient. It shows the whole composed issue, the links it
 * contains, and — the part no other screen can tell them — how many people
 * it actually reaches. Approving a mailout without knowing whether the
 * audience is nine people or nine hundred is not reviewing it.
 */

/* ------------------------------------------------------------------ *
 * A member's own consent
 * ------------------------------------------------------------------ */

export function NewsletterConsent({ userId }: { userId: string }) {
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState('');

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch(`${apiBase()}/newsletter/consent/${userId}`, {
          credentials: 'include',
        });
        if (!res.ok) return;
        const d = (await res.json()).data as { on: boolean };
        if (live) setOn(Boolean(d.on));
      } catch {
        /* the rest of the account page is still usable without this */
      }
    })();
    return () => {
      live = false;
    };
  }, [userId]);

  const set = async (next: boolean) => {
    setBusy(true);
    setSaid('');
    try {
      const res = await fetch(`${apiBase()}/newsletter/consent/${userId}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ set: next ? 'on' : 'off' }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSaid(json.message ?? 'That did not save.');
        return;
      }
      setOn(Boolean(json.data.on));
      setSaid(String(json.data.says ?? ''));
    } catch {
      setSaid('That did not save.');
    } finally {
      setBusy(false);
    }
  };

  // Loading is a real state, not a flash of the wrong answer: rendering
  // "off" before the fetch lands tells somebody who opted in that they did
  // not, and they act on it.
  if (on === null) {
    return (
      <section className="acct__module">
        <h3>Product email</h3>
        <p className="acct__note">Loading…</p>
      </section>
    );
  }

  return (
    <section className="acct__module nlc">
      <h3>Product email</h3>
      <p className="acct__note">
        One email a week about what your account can already do — the falls programme, the food
        ledger, the balance trend, whatever is new. Nothing about your health data, ever, and
        nothing at all unless you say yes here.
      </p>

      <div className="nlc__row">
        <div>
          <strong>{on ? 'On — one email a week' : 'Off — nothing is sent'}</strong>
          <em>
            {on
              ? 'You can stop it from any email, in one click, without signing in.'
              : 'We do not treat registering as permission to market to you.'}
          </em>
        </div>
        <button
          type="button"
          className={on ? 'btn btn--ghost' : 'btn btn--primary'}
          disabled={busy}
          onClick={() => void set(!on)}
        >
          {busy ? 'Saving…' : on ? 'Turn it off' : 'Send it to me'}
        </button>
      </div>

      {said && <p className="acct__note nlc__said">{said}</p>}
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Staff: compose, review, approve, send
 * ------------------------------------------------------------------ */

interface Issue {
  id: number;
  issueKey: string;
  subject: string;
  preheader: string;
  body: string;
  linkCount: number;
  status: 'draft' | 'in_review' | 'approved' | 'sent' | 'archived';
  reviewedBy: string | null;
  createdAt: string;
  sentAt: string | null;
}

interface Console {
  issueKey: string;
  preview: { subject: string; preheader: string; body: string; linkCount: number; paths: string[] };
  issues: Issue[];
  audience: { registered: number; consented: number; eligible: number; minors: number };
  autoApproveBy: string | null;
  cadence: string;
  says: string;
}

export function NewsletterModule() {
  const [data, setData] = useState<Console | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [reviewer, setReviewer] = useState('');
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase()}/newsletter/console`, { credentials: 'include' });
      if (!res.ok) throw new Error(String(res.status));
      setData((await res.json()).data as Console);
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (path: string, body?: unknown) => {
    setBusy(true);
    setSaid('');
    try {
      const res = await fetch(`${apiBase()}/newsletter/${path}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
      const json = await res.json();
      if (!res.ok) {
        setSaid(json.message ?? 'That did not go through.');
        return;
      }
      setSaid(String(json.data?.says ?? 'Done.'));
      await load();
    } catch {
      setSaid('That did not go through.');
    } finally {
      setBusy(false);
    }
  };

  if (state === 'loading') {
    return (
      <section className="acct__module acct__module--admin">
        <h3>Newsletter</h3>
        <p className="acct__note">Loading…</p>
      </section>
    );
  }
  if (state === 'error' || !data) {
    return (
      <section className="acct__module acct__module--admin">
        <h3>Newsletter</h3>
        <p className="probe__err">The newsletter console could not be read.</p>
      </section>
    );
  }

  const current = data.issues.find((i) => i.issueKey === data.issueKey) ?? null;
  const { audience } = data;

  return (
    <section className="acct__module acct__module--admin nlm">
      <header>
        <div>
          <h3>Newsletter — {data.issueKey}</h3>
          <p className="acct__note">
            Composed from the site&rsquo;s own pages, so it cannot promise a feature that does not
            exist or link to a page that is not there. Nothing goes out until somebody puts their
            name to it.
          </p>
        </div>
      </header>

      <div className={`nlm__auto${data.autoApproveBy ? '' : ' nlm__auto--off'}`}>
        <strong>
          {data.autoApproveBy
            ? `Automatic ${data.cadence} sending is on — approved by ${data.autoApproveBy}`
            : 'Automatic sending is off'}
        </strong>
        <p>{data.says}</p>
      </div>

      {/*
        The audience, before the copy. A reviewer who does not know the list
        size cannot judge whether this is worth sending, and the gap between
        registered and eligible is the single most useful number here: it is
        the answer to "why did only nine people get it".
      */}
      <ul className="nlm__audience">
        <li>
          <strong>{audience.eligible.toLocaleString('en-GB')}</strong>
          <em>will receive it</em>
        </li>
        <li>
          <strong>{audience.consented.toLocaleString('en-GB')}</strong>
          <em>have opted in</em>
        </li>
        <li>
          <strong>{audience.registered.toLocaleString('en-GB')}</strong>
          <em>registered in total</em>
        </li>
        <li>
          <strong>{audience.minors.toLocaleString('en-GB')}</strong>
          <em>under 18 — never mailed</em>
        </li>
      </ul>

      {audience.eligible === 0 && (
        <p className="acct__note nlm__warn">
          Nobody would receive this. That is not a fault — consent is never assumed from
          registration, so the list only grows as people choose it. Ask them on the account page
          before sending anything.
        </p>
      )}

      <h4 className="fl__h">This week&rsquo;s issue</h4>
      <p className="nlm__subject">
        <strong>{data.preview.subject}</strong>
        <em>{data.preview.preheader}</em>
      </p>

      {/*
        The whole issue, with its links visible as links. A reviewer shown a
        summary is being asked to approve something they have not read, which
        is the failure this screen exists to prevent rather than to speed up.
      */}
      <div className="nlm__body">
        {data.preview.body
          .split(/\n{2,}/)
          .filter(Boolean)
          .map((para, i) => (
            <p key={i} dangerouslySetInnerHTML={{ __html: renderForReview(para) }} />
          ))}
      </div>

      <p className="acct__note">
        {data.preview.linkCount} links: {data.preview.paths.join(' · ')}
      </p>

      <div className="nlm__actions">
        {!current && (
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void act('issues')}>
            Create this week&rsquo;s issue
          </button>
        )}

        {current?.status === 'draft' && (
          <button
            type="button"
            className="btn btn--ghost"
            disabled={busy}
            onClick={() => void act(`issues/${current.issueKey}/status`, { to: 'in_review' })}
          >
            Move to review
          </button>
        )}

        {current?.status === 'in_review' && (
          <>
            <label className="field nlm__name">
              <span>Your name — this goes to {audience.eligible} inboxes</span>
              <input
                value={reviewer}
                onChange={(e) => setReviewer(e.target.value)}
                placeholder="e.g. Justin Nseya"
              />
            </label>
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy || reviewer.trim().length < 2}
              onClick={() =>
                void act(`issues/${current.issueKey}/status`, {
                  to: 'approved',
                  reviewer: reviewer.trim(),
                })
              }
            >
              I have read this — approve it
            </button>
          </>
        )}

        {current?.status === 'approved' && (
          <>
            <p className="acct__note">Approved by {current.reviewedBy}.</p>
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy || audience.eligible === 0}
              onClick={() => void act(`issues/${current.issueKey}/send`)}
            >
              {busy ? 'Sending…' : `Send to ${audience.eligible}`}
            </button>
          </>
        )}

        {current?.status === 'sent' && (
          <p className="acct__note">
            Sent {current.sentAt ? new Date(current.sentAt).toLocaleString('en-GB') : ''} — approved
            by {current.reviewedBy}. Nobody can receive it twice.
          </p>
        )}

        {current && current.status !== 'sent' && current.status !== 'archived' && (
          <button
            type="button"
            className="btn btn--ghost"
            disabled={busy}
            onClick={() => void act(`issues/${current.issueKey}/status`, { to: 'archived' })}
          >
            Not good enough — archive
          </button>
        )}
      </div>

      {data.issues.length > 0 && (
        <>
          <h4 className="fl__h">Previous issues</h4>
          <ul className="nlm__list">
            {data.issues.map((i) => (
              <li key={i.id}>
                <div>
                  <strong>{i.issueKey}</strong>
                  <em>
                    {i.status.replace('_', ' ')}
                    {i.reviewedBy ? ` · ${i.reviewedBy}` : ''} · {i.linkCount} links
                  </em>
                </div>
                <span>{i.subject}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {said && <p className="acct__note nlm__said">{said}</p>}
    </section>
  );
}

/**
 * Render one paragraph of issue markup for the reviewer.
 *
 * The links must be visible as links — a reviewer who cannot see where a
 * link goes is not reviewing the thing that will be sent. That means
 * building a small amount of HTML, which means escaping first and matching a
 * strict path pattern second, exactly as the mail wrapper does. The two
 * implementations are deliberately identical in shape: this one runs in a
 * browser and cannot import the backend's, and a reviewer being shown a
 * *more* permissive render than the mailer produces would be shown a link
 * the recipient never gets.
 */
function renderForReview(para: string): string {
  const escaped = para
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  return escaped
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, label: string, path: string) =>
      /^\/$|^\/[a-z0-9][a-z0-9\-/]*$/.test(path)
        ? `<a href="${path}" target="_blank" rel="noreferrer">${label}</a>`
        : whole,
    )
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}
