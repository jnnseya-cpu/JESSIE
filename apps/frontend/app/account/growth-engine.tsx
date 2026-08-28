'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiBase } from '../api-base';

/**
 * The AI Growth Engine, as a partner meets it.
 *
 * Ten tools, and the screen is built around the split that matters rather
 * than around a grid of ten identical cards: six of them write copy and
 * cost allowance, four read the partner's own results and cost nothing.
 * A partner who does not understand which is which will trust a generated
 * posting time as much as a measured one, and those two things deserve
 * very different amounts of trust.
 *
 * Two decisions worth stating, because both look like missing features:
 *
 *  * **Refused copy is not shown.** When a draft contains a health claim
 *    or a banned phrase, the partner gets the reasons and no text. Showing
 *    the copy with a warning above it means somebody in a hurry copies the
 *    copy and skips the warning, and then the claim is public with this
 *    platform's name on it.
 *  * **A report with too little behind it says so.** It does not fill the
 *    space with an industry average. A partner who reschedules a month of
 *    posts around a number invented from nothing has been actively misled,
 *    and when it fails they will assume the fault was theirs.
 */

interface Tool {
  id: string;
  name: string;
  kind: 'writes' | 'measures';
  what: string;
  limits: string;
  acu: number;
  needsResults: number;
}

interface Platform {
  id: string;
  name: string;
  maxChars: number;
  register: string;
  hashtags: { min: number; max: number };
  caution: string;
}

interface Catalogue {
  tools: Tool[];
  platforms: Platform[];
  disclosure: string;
  neverDoes: string[];
  howItSplits: string;
}

interface Dashboard {
  analytics: Record<string, unknown>;
  performance: Record<string, unknown>;
  audience: Record<string, unknown>;
  postingTime: Record<string, unknown>;
  recentResults: {
    id: string;
    platform: string | null;
    campaign: string | null;
    postedAt: string;
    reach: number;
    clicks: number;
    signups: number;
    paid: number;
  }[];
  disclosure: string;
}

const NEEDS_PLATFORM = new Set(['social_post', 'hashtags', 'video_script']);

export function GrowthEngineModule() {
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [tab, setTab] = useState<'write' | 'measure' | 'record'>('write');
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  const load = useCallback(async () => {
    try {
      const [cat, dashboard] = await Promise.all([
        fetch(`${apiBase()}/growth/engine/tools`, { credentials: 'include' }),
        fetch(`${apiBase()}/growth/engine/dashboard`, { credentials: 'include' }),
      ]);
      if (!cat.ok) throw new Error(String(cat.status));
      setCatalogue((await cat.json()).data as Catalogue);
      if (dashboard.ok) setDash((await dashboard.json()).data as Dashboard);
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state === 'loading') {
    return (
      <section className="acct__module acct__module--growth">
        <h3>AI Growth Engine</h3>
        <p className="acct__note">Loading your tools…</p>
      </section>
    );
  }
  if (state === 'error' || !catalogue) {
    return (
      <section className="acct__module acct__module--growth">
        <h3>AI Growth Engine</h3>
        <p className="probe__err">The engine could not be reached just now.</p>
      </section>
    );
  }

  const writers = catalogue.tools.filter((t) => t.kind === 'writes');
  const measurers = catalogue.tools.filter((t) => t.kind === 'measures');

  return (
    <section className="acct__module acct__module--growth">
      <header>
        <div>
          <h3>AI Growth Engine</h3>
          <p className="acct__note">{catalogue.howItSplits}</p>
        </div>
      </header>

      <nav className="ge__tabs" aria-label="Growth engine">
        {(
          [
            ['write', `Write (${writers.length})`],
            ['measure', `Measure (${measurers.length})`],
            ['record', 'Add a result'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={tab === key ? 'ge__tab ge__tab--on' : 'ge__tab'}
            aria-current={tab === key ? 'page' : undefined}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'write' && <Writers tools={writers} platforms={catalogue.platforms} />}
      {tab === 'measure' && <Measures tools={measurers} dash={dash} onChange={load} />}
      {tab === 'record' && (
        <RecordResult platforms={catalogue.platforms} onSaved={() => void load()} />
      )}

      <h4 className="fl__h">What it will never do</h4>
      <ul className="risk__limits">
        {catalogue.neverDoes.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="cond__notice">{catalogue.disclosure}</p>
    </section>
  );
}

/* ── the six that write ────────────────────────────────────────────── */

function Writers({ tools, platforms }: { tools: Tool[]; platforms: Platform[] }) {
  const [toolId, setToolId] = useState(tools[0]?.id ?? 'social_post');
  const [platform, setPlatform] = useState(platforms[0]?.id ?? 'instagram');
  const [brief, setBrief] = useState('');
  const [audience, setAudience] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    output: Record<string, unknown> | null;
    passed: boolean;
    problems: string[];
    says: string;
    acu: number;
  } | null>(null);

  const tool = tools.find((t) => t.id === toolId);
  const spec = platforms.find((p) => p.id === platform);
  const wantsPlatform = NEEDS_PLATFORM.has(toolId);

  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(`${apiBase()}/growth/engine/write`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          toolId,
          brief,
          ...(wantsPlatform ? { platform } : {}),
          ...(audience.trim() ? { audience } : {}),
        }),
      });
      const body = await res.json();
      setResult(body.data ?? { output: null, passed: false, problems: [body.message ?? 'that failed'], says: '', acu: 0 });
    } catch {
      setResult({ output: null, passed: false, problems: ['the request did not complete'], says: '', acu: 0 });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ge__panel">
      <div className="ge__grid">
        {tools.map((t) => (
          <button
            key={t.id}
            type="button"
            className={t.id === toolId ? 'ge__tool ge__tool--on' : 'ge__tool'}
            onClick={() => setToolId(t.id)}
          >
            <strong>{t.name}</strong>
            <span>{t.acu} ACU</span>
          </button>
        ))}
      </div>

      {tool && (
        <>
          <p className="ge__what">{tool.what}</p>
          <p className="acct__note">{tool.limits}</p>
        </>
      )}

      {wantsPlatform && (
        <label className="field">
          <span>Network</span>
          <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
            {platforms.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {spec && (
            <em className="ge__spec">
              {spec.maxChars.toLocaleString('en-GB')} characters · {spec.hashtags.min}–
              {spec.hashtags.max} hashtags. {spec.caution}
            </em>
          )}
        </label>
      )}

      <label className="field">
        <span>What do you want it to say?</span>
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={4}
          placeholder="The thing you actually want across. Plain words are better than a template."
        />
      </label>

      <label className="field">
        <span>Who is it for? (optional)</span>
        <input
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
          placeholder="Office workers who sit all day"
        />
      </label>

      <button
        type="button"
        className="btn btn--primary"
        disabled={busy || brief.trim().length < 8}
        onClick={() => void run()}
      >
        {busy ? 'Writing…' : `Write it${tool ? ` · ${tool.acu} ACU` : ''}`}
      </button>

      {result && (
        <div className={`ge__out ge__out--${result.passed ? 'ok' : 'held'}`}>
          <p className="ge__says">{result.says}</p>
          {result.problems.length > 0 && (
            <ul className="risk__limits risk__limits--urgent">
              {result.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          {result.output && <Rendered output={result.output} />}
        </div>
      )}
    </div>
  );
}

/** Whatever shape a tool returned, shown as text somebody can copy. */
function Rendered({ output }: { output: Record<string, unknown> }) {
  return (
    <div className="ge__copy">
      {Object.entries(output).map(([key, value]) => (
        <div key={key} className="ge__field">
          <strong>{humanise(key)}</strong>
          {renderValue(value)}
        </div>
      ))}
    </div>
  );
}

// React 19 removed the global JSX namespace; it lives on React now.
function renderValue(value: unknown): React.JSX.Element {
  if (typeof value === 'string') return <p>{value}</p>;
  if (Array.isArray(value)) {
    return (
      <ul>
        {value.map((item, i) => (
          <li key={i}>
            {typeof item === 'string' ? (
              item
            ) : (
              <>
                {Object.entries(item as Record<string, unknown>).map(([k, v]) => (
                  <span key={k} className="ge__sub">
                    <em>{humanise(k)}:</em> {String(v)}
                  </span>
                ))}
              </>
            )}
          </li>
        ))}
      </ul>
    );
  }
  return <p>{String(value)}</p>;
}

function humanise(key: string): string {
  const spaced = key.replace(/([A-Z])/g, ' $1').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/* ── the four that measure ─────────────────────────────────────────── */

function Measures({
  tools,
  dash,
  onChange,
}: {
  tools: Tool[];
  dash: Dashboard | null;
  onChange: () => void;
}) {
  if (!dash) {
    return (
      <div className="ge__panel">
        <p className="acct__note">No reports yet. Add a result and these fill themselves in.</p>
      </div>
    );
  }

  const reports: [string, Record<string, unknown>][] = [
    ['Campaign analytics', dash.analytics],
    ['Performance recommendations', dash.performance],
    ['Audience optimisation', dash.audience],
    ['Best posting time', dash.postingTime],
  ];

  return (
    <div className="ge__panel">
      <p className="acct__note">
        None of these calls a model. They are arithmetic over what you recorded, and they refuse
        rather than guess when there is not enough behind them.{' '}
        <button type="button" className="ge__refresh" onClick={onChange}>
          Refresh
        </button>
      </p>

      {reports.map(([title, report]) => (
        <article key={title} className="ge__report">
          <div className="card__head">
            <h4 className="card__t">{title}</h4>
            {report.answered === false && <span className="card__tag">not yet</span>}
          </div>
          <p className="ge__says">{String(report.says ?? '')}</p>

          {Array.isArray(report.recommendations) && report.recommendations.length > 0 && (
            <ul className="ge__recs">
              {(report.recommendations as { do: string; because: string; confidence: string }[]).map(
                (r) => (
                  <li key={r.do} className={`ge__rec ge__rec--${r.confidence.replace(/\s+/g, '-')}`}>
                    <strong>{r.do}</strong>
                    <span className="ge__conf">{r.confidence}</span>
                    <p>{r.because}</p>
                  </li>
                ),
              )}
            </ul>
          )}

          {report.totals != null && <Totals totals={report.totals as Record<string, unknown>} />}

          {Array.isArray(report.byPlatform) && (
            <Slices rows={report.byPlatform as Record<string, unknown>[]} label="Network" />
          )}
          {Array.isArray(report.bySubject) && (report.bySubject as unknown[]).length > 0 && (
            <Slices rows={report.bySubject as Record<string, unknown>[]} label="Subject" />
          )}

          {Array.isArray(report.campaigns) && (report.campaigns as unknown[]).length > 0 && (
            <Campaigns rows={report.campaigns as Record<string, unknown>[]} />
          )}

          <p className="acct__note">{String(report.limits ?? '')}</p>
        </article>
      ))}
    </div>
  );
}

function Totals({ totals }: { totals: Record<string, unknown> }) {
  const rates = (totals.rates ?? {}) as Record<string, number>;
  const cells: [string, string][] = [
    ['Posts', String(totals.posts ?? 0)],
    ['Reached', Number(totals.reach ?? 0).toLocaleString('en-GB')],
    ['Clicked', `${Number(totals.clicks ?? 0).toLocaleString('en-GB')} · ${pct(rates.clickRate)}`],
    ['Signed up', `${Number(totals.signups ?? 0).toLocaleString('en-GB')} · ${pct(rates.signupRate)}`],
    ['Paid', `${Number(totals.paid ?? 0).toLocaleString('en-GB')} · ${pct(rates.paidRate)}`],
  ];
  return (
    <div className="ge__totals">
      {cells.map(([label, value]) => (
        <div key={label} className="ge__total">
          <strong>{value}</strong>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

function pct(rate: number | undefined): string {
  return rate === undefined ? '—' : `${(rate * 100).toFixed(1)}%`;
}

function Slices({ rows, label }: { rows: Record<string, unknown>[]; label: string }) {
  if (rows.length === 0) return null;
  return (
    <table className="ge__table">
      <thead>
        <tr>
          <th>{label}</th>
          <th>Posts</th>
          <th>Reached</th>
          <th>Signups per 1,000</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={String(r.key)} className={r.thin ? 'ge__thin' : undefined}>
            <td>
              {String(r.key)}
              {r.thin ? <em> too few to rank</em> : null}
            </td>
            <td>{String(r.posts)}</td>
            <td>{Number(r.reach).toLocaleString('en-GB')}</td>
            <td>{String(r.signupsPerThousandReached)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Campaigns({ rows }: { rows: Record<string, unknown>[] }) {
  return (
    <table className="ge__table">
      <thead>
        <tr>
          <th>Campaign</th>
          <th>Reached</th>
          <th>Signups</th>
          <th>Paid</th>
          <th>Losing most at</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={String(r.campaign)}>
            <td>{String(r.campaign)}</td>
            <td>{Number(r.reach).toLocaleString('en-GB')}</td>
            <td>{String(r.signups)}</td>
            <td>{String(r.paid)}</td>
            <td>{r.weakestStep ? String(r.weakestStep) : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ── recording what actually happened ──────────────────────────────── */

function RecordResult({ platforms, onSaved }: { platforms: Platform[]; onSaved: () => void }) {
  const [form, setForm] = useState({
    platform: platforms[0]?.id ?? 'instagram',
    campaign: '',
    subject: '',
    reach: '',
    clicks: '',
    signups: '',
    paid: '',
  });
  const [says, setSays] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setSays('');
    try {
      const res = await fetch(`${apiBase()}/growth/engine/results`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          platform: form.platform,
          campaign: form.campaign || undefined,
          subject: form.subject || undefined,
          reach: Number(form.reach) || 0,
          clicks: Number(form.clicks) || 0,
          signups: Number(form.signups) || 0,
          paid: Number(form.paid) || 0,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setSays(String(body.message ?? 'that did not save'));
      } else {
        setSays('Recorded. The reports above have it now.');
        setForm({ ...form, campaign: '', subject: '', reach: '', clicks: '', signups: '', paid: '' });
        onSaved();
      }
    } catch {
      setSays('That did not save.');
    } finally {
      setBusy(false);
    }
  };

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm({ ...form, [key]: e.target.value });

  return (
    <div className="ge__panel">
      <p className="acct__note">
        The four reports are only as honest as this. Every number here is one you or the platform
        counted — nothing is estimated, and the funnel only narrows: clicks cannot exceed the
        number reached, and so on down.
      </p>

      <label className="field">
        <span>Network</span>
        <select value={form.platform} onChange={set('platform')}>
          {platforms.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      <div className="ge__row">
        <label className="field">
          <span>Campaign (optional)</span>
          <input value={form.campaign} onChange={set('campaign')} placeholder="January push" />
        </label>
        <label className="field">
          <span>Subject (optional)</span>
          <input value={form.subject} onChange={set('subject')} placeholder="desk breaks" />
        </label>
      </div>

      <div className="ge__row">
        {(['reach', 'clicks', 'signups', 'paid'] as const).map((key) => (
          <label key={key} className="field">
            <span>{humanise(key)}</span>
            <input
              value={form[key]}
              onChange={set(key)}
              inputMode="numeric"
              placeholder="0"
            />
          </label>
        ))}
      </div>

      <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void save()}>
        {busy ? 'Saving…' : 'Record it'}
      </button>
      {says && <p className="ge__says">{says}</p>}
    </div>
  );
}
