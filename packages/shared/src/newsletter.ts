/**
 * The weekly newsletter.
 *
 * The platform's problem was never that it had too few features to talk
 * about. It was that the features were invisible: somebody registered,
 * saw one screen, and never learned that the same account already
 * contained a falls programme, a food ledger, a balance trend and a
 * workplace report. A weekly email is the cheapest way to tell them, and
 * every sentence in it should end somewhere they can press.
 *
 * Three decisions shape everything below.
 *
 * **The copy is composed, not generated.** Every claim in an issue comes
 * from `LINK_TARGETS` — the same registry the site, the sitemap and the
 * blog's auto-linker read. So the newsletter cannot promise a feature the
 * platform does not have, cannot link to a page that does not exist, and
 * cannot drift out of date when a page is renamed. It also costs nothing
 * per issue, which matters when the alternative is a paid model call
 * every week forever to restate facts that are already written down.
 *
 * **An issue is a pure function of its week.** `composeIssue('2026-W34')`
 * returns the same subject and the same body every time it is called.
 * That is what makes a scheduler safe: a cron that fires twice, or a
 * container that restarts mid-send, recomposes byte-identical copy rather
 * than a second different email about the same week.
 *
 * **The rotation is deterministic and it moves.** Week to week the issue
 * leads on different features, so somebody subscribed for three months
 * has been told about the whole platform rather than the same three
 * pillars twelve times. The offset is derived from the week number, so
 * nothing needs to be remembered between sends.
 *
 * What this module deliberately does not do is decide who receives
 * anything. `mayReceiveNewsletter` states the rules; the service applies
 * them against real rows. Marketing consent defaults to off and minors
 * are not an audience — see the reasons on those rules.
 */

import { LINK_TARGETS, normalisePath, type LinkTarget } from './site-paths';

/* ------------------------------------------------------------------ *
 * Cadence and identity
 * ------------------------------------------------------------------ */

export const NEWSLETTER = {
  /** The catalogue event every issue is sent as. */
  eventKey: 'growth.newsletter.weekly',
  cadence: 'weekly' as const,
  /** Features sold per issue. Enough to be worth reading, few enough to be read. */
  featuresPerIssue: 4,
  /** Below this the composer refuses to produce an issue at all. */
  minLinks: 6,
  /**
   * The lowest age this may reach. The platform serves ten-year-olds;
   * marketing email does not. A minor's inbox is not a growth channel,
   * and the communications catalogue already has `adultOnly` for exactly
   * this — the rule is restated here so the audience query and the
   * catalogue cannot disagree.
   */
  minAge: 18,
} as const;

/**
 * The ISO-8601 week containing a date, as `2026-W34`.
 *
 * ISO weeks rather than "weeks since some epoch" because the key ends up
 * in a subject line and in an operator's mouth, and a person can look at
 * 2026-W34 and know roughly when it was. The Thursday rule is what makes
 * the year correct in the last days of December, where a naive
 * implementation produces week 53 of the wrong year.
 */
export function issueKeyFor(when: Date): string {
  const d = new Date(Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), when.getUTCDate()));
  // Move to the Thursday of this week; the year of that Thursday is the
  // ISO week-numbering year by definition.
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const year = d.getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const week = Math.ceil(((d.getTime() - jan1) / 86_400_000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** The week number carried by an issue key, or null if it is malformed. */
export function weekOf(issueKey: string): number | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(issueKey.trim());
  if (!m) return null;
  const week = Number(m[2]);
  return week >= 1 && week <= 53 ? week : null;
}

/* ------------------------------------------------------------------ *
 * What an issue is allowed to sell
 * ------------------------------------------------------------------ */

/**
 * The sellable pages, in a fixed order.
 *
 * Pillars and products are what somebody would change their week for.
 * Entry pages are where they act. Legal and company pages are excluded
 * from the rotation — a newsletter that leads with the privacy policy is
 * not selling anything — but `/assurance` is a deliberate exception,
 * because for an organisation buyer it is the whole pitch.
 *
 * `noIndex` pages are excluded too. A page kept out of the sitemap is
 * private, transient or duplicate, and none of those belong in a mailout.
 */
export function sellableTargets(): readonly LinkTarget[] {
  const sellable = LINK_TARGETS.filter(
    (t) => !t.noIndex && (t.kind === 'pillar' || t.kind === 'product' || t.path === '/assurance'),
  );
  /*
   * Sorted by path so the rotation is stable across builds — array order in
   * the registry is an editorial convenience and will change, and the
   * newsletter's week-to-week sequence must not change with it.
   *
   * `/assurance` is forced to the end. It is skipped for the lead slot (see
   * `featuresForWeek`), and while it sat first alphabetically the weeks
   * either side of the cycle boundary both fell through to the same
   * replacement lead — two consecutive issues with an identical subject
   * line, which reads as a broken scheduler rather than a rotation. Last in
   * the order puts that unavoidable repeat half a cycle away instead.
   */
  return [...sellable].sort((a, b) => {
    if (a.path === '/assurance') return 1;
    if (b.path === '/assurance') return -1;
    return a.path.localeCompare(b.path);
  });
}

/** The entry pages an issue closes on. */
export function entryTargets(): readonly LinkTarget[] {
  return LINK_TARGETS.filter((t) => t.kind === 'entry' && !t.noIndex);
}

/**
 * Which features this week's issue leads on.
 *
 * A rotating window over the sellable list. Successive weeks advance by
 * the issue size, so a subscriber is walked through the whole platform
 * and then begins again, rather than being shown a random subset that
 * repeats by chance.
 */
export function featuresForWeek(issueKey: string): readonly LinkTarget[] {
  const all = sellableTargets();
  if (all.length === 0) return [];
  const week = weekOf(issueKey) ?? 1;
  const take = Math.min(NEWSLETTER.featuresPerIssue, all.length);

  /*
   * The lead is chosen from the pages eligible to lead; the rest of the
   * issue follows it through the full list.
   *
   * Two earlier shapes were wrong in ways worth recording, because both
   * looked right.
   *
   * Stepping a contiguous window by its own width — `(week * 4) % 12` —
   * yields only 0, 4 and 8. The newsletter had exactly three distinct
   * issues and repeated them for ever; a subscriber of one year would
   * receive the same three emails seventeen times each.
   *
   * Stepping that window by one fixed the coverage but not the boundary.
   * `/assurance` is skipped for the lead slot, so the week whose window
   * began at `/assurance` fell through to the same lead as the week that
   * began just after it — two consecutive issues with an identical subject
   * line, which reads as a stuck scheduler rather than a rotation.
   *
   * Picking the lead from the eligible list removes the collision by
   * construction rather than by arithmetic luck: eleven leads, cycling
   * every eleven weeks, none ever adjacent to itself.
   */
  const leadCandidates = all.filter((t) => t.path !== '/assurance');
  const pool = leadCandidates.length > 0 ? leadCandidates : all;
  const lead = pool[(week - 1) % pool.length];

  const from = all.findIndex((t) => t.path === lead.path);
  return Array.from({ length: take }, (_, i) => all[(from + i) % all.length]);
}

/* ------------------------------------------------------------------ *
 * Composition
 * ------------------------------------------------------------------ */

export interface ComposedIssue {
  readonly issueKey: string;
  readonly subject: string;
  readonly preheader: string;
  /** Markdown-ish prose. `[label](/path)` links only, always site-relative. */
  readonly body: string;
  readonly linkCount: number;
  /** The paths linked, in order of first appearance. Feeds the reviewer's view. */
  readonly paths: readonly string[];
}

function link(label: string, path: string): string {
  return `[${label}](${normalisePath(path)})`;
}

/**
 * Build the issue for a week.
 *
 * The shape is deliberately plain: a lead feature given a paragraph, the
 * rest given a line each, and a close that names the one action. Every
 * feature paragraph ends in a link, because a paragraph that describes
 * something and then does not let you reach it is an advertisement
 * rather than a product email.
 */
export function composeIssue(issueKey: string): ComposedIssue {
  const features = featuresForWeek(issueKey);
  const entries = entryTargets();
  const start = entries.find((t) => t.path === '/get-started') ?? entries[0] ?? null;
  const blog = LINK_TARGETS.find((t) => t.path === '/blog') ?? null;
  const how = LINK_TARGETS.find((t) => t.path === '/how-it-works') ?? null;

  const lead = features[0] ?? null;
  const rest = features.slice(1);

  const paras: string[] = [];

  paras.push(
    `Your account already includes more than you have probably used. Here is what is worth ` +
      `two minutes this week.`,
  );

  if (lead) {
    paras.push(
      `**${lead.label}.** ${lead.summary} If you have not opened it yet, ` +
        `${link('start here', lead.path)} — it takes about a minute to see whether it is for you.`,
    );
  }

  if (rest.length > 0) {
    paras.push(
      rest.map((t) => `**${t.label}.** ${t.summary} ${link(`Open ${t.label}`, t.path)}`).join('\n\n'),
    );
  }

  if (how) {
    paras.push(
      `Not sure how the pieces fit together? ${link('How it works', how.path)} explains the whole ` +
        `platform on one page, without jargon.`,
    );
  }

  if (blog) {
    paras.push(
      `We also publish practical guides every week — exercises, food, medication, falls. ` +
        `${link('Read the latest', blog.path)}.`,
    );
  }

  if (start) {
    paras.push(
      `One thing, this week: ${link(start.label.toLowerCase(), start.path)}. ` +
        `Two minutes counts. That is the entire idea.`,
    );
  }

  const body = paras.join('\n\n');
  const paths = orderedPaths(body);

  return {
    issueKey,
    subject: subjectFor(issueKey, lead),
    preheader: lead
      ? `${lead.label} — ${lead.summary}`
      : 'What your account already includes.',
    body,
    linkCount: paths.length,
    paths,
  };
}

/**
 * The subject line.
 *
 * It names one feature rather than the week, because "JESS MOVE Weekly
 * #34" tells a reader nothing and earns the open rate that description
 * deserves. The week key stays out of the subject entirely and lives in
 * the database, where it is doing real work.
 *
 * The length target is the real constraint and it is much tighter than the
 * database's 160 characters: a phone shows roughly the first fifty and a
 * desktop client sixty or seventy, so anything past that is written for
 * nobody. The registry's summaries are full sentences built for a page
 * heading, so the subject takes the first clause and stops — one comma or
 * full stop in is almost always the part that carries the promise.
 */
export const SUBJECT_TARGET_CHARS = 62;

function subjectFor(issueKey: string, lead: LinkTarget | null): string {
  if (!lead) return 'What your JESS MOVE account already includes';

  /*
   * Trim the whole line, rather than splitting the summary into clauses.
   *
   * Clause-splitting was tried and produced "BodyCommand: Weight" from
   * "Weight, waist and trend, read as a direction rather than a verdict" —
   * a subject that promises nothing because the comma fell in the middle
   * of the list the sentence was making. Cutting the full line on a word
   * boundary keeps whatever fits and signals the rest with an ellipsis,
   * which is also how the reader's own client will behave.
   */
  const hook = `${lead.label}: ${lead.summary.replace(/\.$/, '')}`;

  const subject =
    hook.length <= SUBJECT_TARGET_CHARS
      ? hook
      : (() => {
          const cut = hook.slice(0, SUBJECT_TARGET_CHARS);
          const atSpace = cut.lastIndexOf(' ');
          const trimmed = (atSpace > 20 ? cut.slice(0, atSpace) : cut).replace(/[,;:—-]$/, '').trimEnd();
          return trimmed.length >= 12 ? `${trimmed}…` : lead.label;
        })();

  // The column requires at least 8 characters; a registry entry with a
  // very short label must not be able to violate it.
  return subject.length >= 8 ? subject : 'Your JESS MOVE week';
}

/** Every `[label](/path)` in order, de-duplicated. */
export function orderedPaths(body: string): readonly string[] {
  const seen: string[] = [];
  const re = /\[[^\]]+\]\((\/[^)\s]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const path = normalisePath(m[1]);
    if (!seen.includes(path)) seen.push(path);
  }
  return seen;
}

/* ------------------------------------------------------------------ *
 * Who may receive it
 * ------------------------------------------------------------------ */

export interface NewsletterRecipient {
  readonly userId: string;
  readonly email: string;
  readonly age: number;
  readonly marketingEmailConsent: boolean;
}

export type NewsletterRefusal =
  | 'no_consent'
  | 'under_age'
  | 'no_address';

export interface Eligibility {
  readonly may: boolean;
  readonly refusal?: NewsletterRefusal;
  /** Recorded against the skipped send, so a small audience has an answer. */
  readonly because: string;
}

/**
 * Whether one person may be sent the newsletter.
 *
 * Consent is checked and never inferred. The temptation with a mailing
 * list is to treat registration as permission, on the reasoning that
 * these are our own users and the email is about the product they signed
 * up for. That reasoning does not survive contact with UK PECR: a
 * marketing message needs consent or a narrow soft opt-in, the sender
 * carries the burden of showing which, and "they registered" is not a
 * record of consent. It also does not survive contact with reality —
 * mailing people who did not ask produces spam complaints, and enough of
 * those cost the domain its ability to deliver password resets.
 *
 * So a small consented list is the correct outcome and not a bug. If it
 * is empty, that is a signal to ask people, not to lower the bar.
 */
export function mayReceiveNewsletter(person: NewsletterRecipient): Eligibility {
  if (!person.email || !person.email.includes('@')) {
    return { may: false, refusal: 'no_address', because: 'No usable email address on the account.' };
  }
  if (person.age < NEWSLETTER.minAge) {
    return {
      may: false,
      refusal: 'under_age',
      because: `Under ${NEWSLETTER.minAge}. Marketing email is not sent to minors on this platform.`,
    };
  }
  if (!person.marketingEmailConsent) {
    return {
      may: false,
      refusal: 'no_consent',
      because: 'Has not opted in to product email. Consent is never assumed from registration.',
    };
  }
  return { may: true, because: 'Consented, adult, reachable.' };
}

/* ------------------------------------------------------------------ *
 * Unsubscribing
 * ------------------------------------------------------------------ */

/** The public path that turns a token into an opt-out. No session needed. */
export function unsubscribePath(token: string): string {
  return `/unsubscribe?t=${encodeURIComponent(token)}`;
}

/**
 * Tokens are 32 hex characters — 16 random bytes from the database.
 * Validated on the way in so a malformed query never reaches a lookup.
 */
export function isValidUnsubscribeToken(token: string): boolean {
  return /^[0-9a-f]{32}$/.test(token.trim());
}
