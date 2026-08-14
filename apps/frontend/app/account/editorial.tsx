'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiBase } from '../api-base';

/**
 * The review queue.
 *
 * The editorial control on this platform is that no agent-written health
 * copy reaches the public without a named person having read it. That
 * control was never the problem — the problem was that there was no screen
 * on which to be that person, so the queue was a place drafts went to stop.
 *
 * Nothing here weakens the control. The reviewer still types their own
 * name, the audit still has to pass, and the status machine still has no
 * draft-to-published edge. What changes is that reviewing takes a minute
 * instead of being impossible, which is the difference between a content
 * pipeline and a content pipeline nobody can operate.
 *
 * The name field is deliberately not pre-filled from the session. Typing
 * your own name against something you are putting in front of the public
 * is a small friction that is doing real work: it is the moment the
 * responsibility transfers, and a pre-filled box turns it into a click.
 */

interface Run {
  at: string;
  outcome: 'queued' | 'rejected' | 'skipped' | 'failed';
  says: string;
  keyword?: string | null;
  score?: number | null;
}

interface Autopilot {
  enabled: boolean;
  intervalHours: number;
  lastRunAt: string | null;
  nextDueAt: string | null;
  says: string;
  nextUp?: { keyword: string; because: string } | null;
  recentRuns?: Run[];
}

interface QueuePost {
  slug: string;
  title: string;
  description: string;
  category: string;
  status: 'draft' | 'in_review' | 'published' | 'archived';
  keyword?: string;
  body?: string;
  agentDrafted?: boolean;
  audit?: { score: number; passes: boolean; findings?: { rule: string; severity: string; detail: string; fix: string }[] } | null;
}

export function EditorialModule() {
  const [posts, setPosts] = useState<QueuePost[]>([]);
  const [open, setOpen] = useState<QueuePost | null>(null);
  const [reviewer, setReviewer] = useState('');
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState('');
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [auto, setAuto] = useState<Autopilot | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase()}/blog/posts`, { credentials: 'include' });
      if (!res.ok) throw new Error(String(res.status));
      const all = ((await res.json()).data ?? []) as QueuePost[];
      setPosts(all.filter((p) => p.status === 'draft' || p.status === 'in_review'));

      /*
       * The runs, not only the queue. An empty queue has two completely
       * different meanings — the agent has not run, or it ran and every
       * draft was rejected — and showing only the queue makes them
       * identical. That is how a content pipeline gets written off as
       * broken when it is working and failing its own audit.
       */
      try {
        const a = await fetch(`${apiBase()}/blog/agent/autopilot`, { credentials: 'include' });
        if (a.ok) setAuto((await a.json()).data as Autopilot);
      } catch {
        /* the queue is still worth showing without it */
      }
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const read = async (slug: string) => {
    setSaid('');
    try {
      const res = await fetch(`${apiBase()}/blog/posts/${slug}`, { credentials: 'include' });
      if (res.ok) setOpen((await res.json()).data as QueuePost);
    } catch {
      setSaid('That could not be opened.');
    }
  };

  const move = async (slug: string, to: 'in_review' | 'published' | 'archived') => {
    if (to === 'published' && reviewer.trim().length < 2) {
      setSaid('Type your name. Publishing is somebody taking responsibility for it.');
      return;
    }
    setBusy(true);
    setSaid('');
    try {
      const res = await fetch(`${apiBase()}/blog/posts/${slug}/status`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to, ...(to === 'published' ? { reviewer: reviewer.trim() } : {}) }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSaid(json.message ?? 'That did not go through.');
        return;
      }
      setSaid(to === 'published' ? 'Published. It is on the site within five minutes.' : `Moved to ${to}.`);
      setOpen(null);
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
        <h3>Editorial queue</h3>
        <p className="acct__note">Loading…</p>
      </section>
    );
  }
  if (state === 'error') {
    return (
      <section className="acct__module acct__module--admin">
        <h3>Editorial queue</h3>
        <p className="probe__err">The queue could not be read.</p>
      </section>
    );
  }

  return (
    <section className="acct__module acct__module--admin edq">
      <header>
        <div>
          <h3>Editorial queue</h3>
          <p className="acct__note">
            Nothing an agent writes reaches the public until somebody reads it and puts their name
            to it. That is a clinical safety control, not a workflow preference.
          </p>
        </div>
      </header>

      {auto && (
        <div className={`edq__auto${auto.enabled ? '' : ' edq__auto--off'}`}>
          <strong>
            {auto.enabled
              ? `Autopilot on, every ${auto.intervalHours} hours`
              : 'Autopilot is off — nothing will be commissioned'}
          </strong>
          <p>{auto.says}</p>
          {auto.nextUp && (
            <p className="edq__next">
              Next subject: “{auto.nextUp.keyword}” — {auto.nextUp.because}
            </p>
          )}
        </div>
      )}

      {posts.length === 0 && (
        <p className="acct__note">
          Nothing waiting for review.
          {auto?.enabled
            ? ' That is not the same as nothing happening — the runs below say what it tried.'
            : ' Autopilot is off, so nothing is being commissioned.'}
        </p>
      )}

      {(auto?.recentRuns ?? []).length > 0 && !open && (
        <>
          <h4 className="fl__h">What it tried</h4>
          <ul className="edq__runs">
            {(auto?.recentRuns ?? []).map((r, i) => (
              <li key={`${r.at}-${i}`} className={`edq__run edq__run--${r.outcome}`}>
                <span className="edq__outcome">{r.outcome}</span>
                <div>
                  <strong>{r.keyword ? `“${r.keyword}”` : 'No subject'}</strong>
                  <em>
                    {r.says}
                    {typeof r.score === 'number' ? ` (${r.score}/100)` : ''}
                  </em>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {posts.length > 0 && !open && (
        <ul className="edq__list">
          {posts.map((p) => (
            <li key={p.slug}>
              <div>
                <strong>{p.title}</strong>
                <em>
                  {p.status.replace('_', ' ')} · {p.category}
                  {p.keyword ? ` · “${p.keyword}”` : ''}
                  {p.agentDrafted ? ' · agent-drafted' : ''}
                </em>
              </div>
              <button type="button" className="btn btn--ghost" onClick={() => void read(p.slug)}>
                Read it
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="edq__reading">
          <button type="button" className="btn btn--ghost" onClick={() => setOpen(null)}>
            ← Back to the queue
          </button>

          <h4 className="edq__title">{open.title}</h4>
          <p className="acct__note">{open.description}</p>

          {open.audit && (
            <div className={`edq__audit${open.audit.passes ? '' : ' edq__audit--fails'}`}>
              <strong>
                Audit {open.audit.score}/100 — {open.audit.passes ? 'passes' : 'does not pass'}
              </strong>
              {(open.audit.findings ?? [])
                .filter((f) => f.severity === 'blocker')
                .map((f) => (
                  <p key={f.rule}>
                    <b>{f.rule}</b> {f.detail} — {f.fix}
                  </p>
                ))}
            </div>
          )}

          {/*
            The whole article, not an excerpt. A reviewer who is shown a
            summary is being asked to approve something they have not read,
            which is the failure this screen exists to prevent rather than
            to make convenient.
          */}
          <div className="edq__body">
            {(open.body ?? '').split(/\n{2,}/).filter(Boolean).map((para, i) => (
              <p key={i}>{para.replace(/^#{2,3}\s+/, '')}</p>
            ))}
          </div>

          <div className="edq__actions">
            {open.status === 'draft' && (
              <button
                type="button"
                className="btn btn--ghost"
                disabled={busy}
                onClick={() => void move(open.slug, 'in_review')}
              >
                Move to review
              </button>
            )}

            {open.status === 'in_review' && (
              <>
                <label className="field edq__name">
                  <span>Your name — you are putting this in front of the public</span>
                  <input
                    value={reviewer}
                    onChange={(e) => setReviewer(e.target.value)}
                    placeholder="e.g. Justin Nseya"
                  />
                </label>
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={busy}
                  onClick={() => void move(open.slug, 'published')}
                >
                  {busy ? 'Publishing…' : 'I have read this — publish it'}
                </button>
              </>
            )}

            <button
              type="button"
              className="btn btn--ghost"
              disabled={busy}
              onClick={() => void move(open.slug, 'archived')}
            >
              Not good enough — archive
            </button>
          </div>
        </div>
      )}

      {said && <p className="acct__note edq__said">{said}</p>}
    </section>
  );
}
