import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import {
  NEWSLETTER,
  composeIssue,
  issueKeyFor,
  mayReceiveNewsletter,
  unsubscribePath,
  type ComposedIssue,
  type NewsletterRecipient,
} from '@jessmove/shared';
import { makePool, type PgPoolLike } from '../db/pg';
import { MailService } from '../mail/mail.service';

/**
 * The weekly newsletter.
 *
 * Four rules hold this together, and each one exists because the obvious
 * shortcut around it has a specific failure.
 *
 * **Composition is free and repeatable.** An issue is built from the link
 * registry by `composeIssue`, so producing one costs no model call and
 * produces the same bytes every time. A generated newsletter would cost
 * money weekly to restate facts already written down, and would produce a
 * different email on every retry.
 *
 * **Nothing sends without a named reviewer.** The status machine has no
 * edge from draft to sent. Copy describing a health product goes to a
 * person first, they type their name, and the constraint in migration
 * 0025 refuses the row if they did not. This is the same control the blog
 * has and it is a clinical safety control, not a workflow preference.
 *
 * **A person is sent an issue at most once.** `newsletter_sends` carries
 * UNIQUE (issue_id, user_id) and every send inserts a claim row *before*
 * handing anything to SMTP. A cron that fires twice, a retry after a
 * timeout, two containers waking at once — all of them lose the insert
 * and skip. Idempotency is a constraint, not a flag a refactor can drop.
 *
 * **Consent is read from the row, never inferred.** The audience query
 * filters on `marketing_email_consent` and on age, in SQL, so a bug in
 * this file cannot widen the audience beyond what people agreed to.
 */

export type IssueStatus = 'draft' | 'in_review' | 'approved' | 'sent' | 'archived';

export interface StoredIssue {
  id: number;
  issueKey: string;
  subject: string;
  preheader: string;
  body: string;
  linkCount: number;
  status: IssueStatus;
  reviewedBy: string | null;
  createdAt: string;
  approvedAt: string | null;
  sentAt: string | null;
}

export interface SendOutcome {
  issueKey: string;
  attempted: number;
  sent: number;
  sandboxed: number;
  failed: number;
  skipped: number;
  says: string;
}

export interface AudienceTally {
  registered: number;
  consented: number;
  eligible: number;
  minors: number;
}

@Injectable()
export class NewsletterService implements OnModuleDestroy {
  private readonly logger = new Logger(NewsletterService.name);
  private pool: PgPoolLike | null = null;

  constructor(private readonly mail: MailService) {
    this.pool = makePool(process.env.DATABASE_URL, 2);
    if (!this.pool) {
      this.logger.warn('newsletter: no database — issues cannot be stored or sent');
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end().catch(() => undefined);
  }

  private db(): PgPoolLike {
    if (!this.pool) throw new Error('the newsletter needs a database');
    return this.pool;
  }

  get available(): boolean {
    return this.pool !== null;
  }

  /* ---------------------------------------------------------------- *
   * Composing and storing
   * ---------------------------------------------------------------- */

  /** The issue key for the current week, so callers agree on "this week". */
  currentIssueKey(now: Date = new Date()): string {
    return issueKeyFor(now);
  }

  /** Preview without writing. What the review screen shows before a draft exists. */
  preview(issueKey: string): ComposedIssue {
    return composeIssue(issueKey);
  }

  /**
   * Compose this week's issue if it does not already exist.
   *
   * `ON CONFLICT DO NOTHING` against the unique issue key is what makes
   * this safe to call from a scheduler: the second call in a week writes
   * nothing and returns the row that is already there, rather than
   * creating a second issue somebody would have to notice and archive.
   */
  async ensureIssue(issueKey: string): Promise<StoredIssue> {
    const composed = composeIssue(issueKey);
    if (composed.linkCount < NEWSLETTER.minLinks) {
      // A newsletter whose whole purpose is to send people into the
      // product, that has almost no links, is broken rather than terse.
      // Refusing here means a registry regression surfaces as an error on
      // a Monday rather than as a mailout nobody can act on.
      throw new Error(
        `composed only ${composed.linkCount} links for ${issueKey}, minimum is ${NEWSLETTER.minLinks}`,
      );
    }

    await this.db().query(
      `INSERT INTO newsletter_issues (issue_key, subject, preheader, body, link_count)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (issue_key) DO NOTHING`,
      [issueKey, composed.subject, composed.preheader, composed.body, composed.linkCount],
    );

    const issue = await this.byKey(issueKey);
    if (!issue) throw new Error(`issue ${issueKey} could not be read back`);
    return issue;
  }

  async byKey(issueKey: string): Promise<StoredIssue | null> {
    const { rows } = await this.db().query(
      `SELECT * FROM newsletter_issues WHERE issue_key = $1`,
      [issueKey],
    );
    return rows[0] ? rowToIssue(rows[0]) : null;
  }

  async recent(limit = 12): Promise<StoredIssue[]> {
    const { rows } = await this.db().query(
      `SELECT * FROM newsletter_issues ORDER BY created_at DESC, id DESC LIMIT $1`,
      [Math.min(Math.max(limit, 1), 50)],
    );
    return rows.map(rowToIssue);
  }

  /**
   * Move an issue along.
   *
   * The permitted edges are listed rather than derived, because the one
   * that must not exist — draft straight to sent — is easy to reintroduce
   * accidentally in a condition and impossible to reintroduce accidentally
   * in a table. Approval demands a name, and the database demands it too.
   */
  async transition(
    issueKey: string,
    to: IssueStatus,
    reviewer?: string,
  ): Promise<StoredIssue> {
    const issue = await this.byKey(issueKey);
    if (!issue) throw new Error(`no issue ${issueKey}`);

    const allowed: Record<IssueStatus, readonly IssueStatus[]> = {
      draft: ['in_review', 'archived'],
      in_review: ['approved', 'draft', 'archived'],
      approved: ['sent', 'archived'],
      sent: ['archived'],
      archived: [],
    };

    if (!allowed[issue.status].includes(to)) {
      throw new Error(`an issue cannot go from ${issue.status} to ${to}`);
    }

    if (to === 'approved') {
      const name = (reviewer ?? '').trim();
      if (name.length < 2) {
        throw new Error('approving an issue means putting your name to it');
      }
      const { rows } = await this.db().query(
        `UPDATE newsletter_issues
            SET status = 'approved', reviewed_by = $2, approved_at = now()
          WHERE issue_key = $1
          RETURNING *`,
        [issueKey, name],
      );
      return rowToIssue(rows[0]);
    }

    const { rows } = await this.db().query(
      `UPDATE newsletter_issues SET status = $2 WHERE issue_key = $1 RETURNING *`,
      [issueKey, to],
    );
    return rowToIssue(rows[0]);
  }

  /* ---------------------------------------------------------------- *
   * The audience
   * ---------------------------------------------------------------- */

  /**
   * Who would receive an issue, and who would not.
   *
   * Shown before approval, because "this goes to 9 of your 412 users" is
   * information a reviewer needs and cannot get anywhere else. It is also
   * the honest answer to why a newsletter feels quiet: the list is small
   * until people are asked to join it.
   */
  async audience(): Promise<AudienceTally> {
    const { rows } = await this.db().query(
      `SELECT
         count(*)::int                                                        AS registered,
         count(*) FILTER (WHERE marketing_email_consent)::int                 AS consented,
         count(*) FILTER (WHERE marketing_email_consent AND age >= $1)::int   AS eligible,
         count(*) FILTER (WHERE age < $1)::int                                AS minors
       FROM app_users`,
      [NEWSLETTER.minAge],
    );
    const r = rows[0] ?? {};
    return {
      registered: Number(r.registered ?? 0),
      consented: Number(r.consented ?? 0),
      eligible: Number(r.eligible ?? 0),
      minors: Number(r.minors ?? 0),
    };
  }

  /* ---------------------------------------------------------------- *
   * Consent
   * ---------------------------------------------------------------- */

  /** A member turning product email on or off for themselves. */
  async setConsent(userId: string, on: boolean): Promise<{ on: boolean; at: string | null }> {
    const { rows } = await this.db().query(
      `UPDATE app_users
          SET marketing_email_consent = $2,
              marketing_consent_at    = CASE WHEN $2 THEN now() ELSE marketing_consent_at END
        WHERE user_id = $1
        RETURNING marketing_email_consent, marketing_consent_at`,
      [userId, on],
    );
    if (!rows[0]) throw new Error('no such account');
    return {
      on: Boolean(rows[0].marketing_email_consent),
      // ISO, like every other timestamp this API returns. A bare
      // `String(date)` yields "Mon Aug 17 2026 11:35:39 GMT+0000", which a
      // browser's Date parser accepts and a stricter client does not.
      at: rows[0].marketing_consent_at ? iso(rows[0].marketing_consent_at) : null,
    };
  }

  async consentFor(userId: string): Promise<{ on: boolean; at: string | null }> {
    const { rows } = await this.db().query(
      `SELECT marketing_email_consent, marketing_consent_at FROM app_users WHERE user_id = $1`,
      [userId],
    );
    if (!rows[0]) throw new Error('no such account');
    return {
      on: Boolean(rows[0].marketing_email_consent),
      at: rows[0].marketing_consent_at ? iso(rows[0].marketing_consent_at) : null,
    };
  }

  /**
   * One-click unsubscribe.
   *
   * Deliberately succeeds when the token matches nothing. An unsubscribe
   * route that distinguishes "opted you out" from "no such token" is an
   * oracle for testing tokens, and the person clicking cannot act on the
   * difference anyway — they want the emails to stop, and they have
   * stopped either way.
   */
  async unsubscribeByToken(token: string): Promise<{ stopped: boolean }> {
    await this.db().query(
      `UPDATE app_users
          SET marketing_email_consent = false
        WHERE unsubscribe_token = $1`,
      [token],
    );
    return { stopped: true };
  }

  /* ---------------------------------------------------------------- *
   * Sending
   * ---------------------------------------------------------------- */

  /**
   * Send an approved issue to everyone eligible who has not had it.
   *
   * The claim-then-send order is the important part. Each recipient's row
   * in `newsletter_sends` is inserted first, and only a row that was
   * actually inserted proceeds to SMTP. If the same issue is sent twice
   * concurrently, the second attempt's insert loses to the unique
   * constraint, returns no row, and sends nothing. The cost of that
   * ordering is that a crash between the claim and the delivery loses one
   * email; the cost of the other ordering is a subscriber receiving the
   * same email repeatedly, which is how a sender earns a spam label.
   */
  async sendIssue(issueKey: string): Promise<SendOutcome> {
    const issue = await this.byKey(issueKey);
    if (!issue) throw new Error(`no issue ${issueKey}`);
    if (issue.status !== 'approved') {
      throw new Error(
        `issue ${issueKey} is ${issue.status}. Only an approved issue may be sent, and approval needs a named reviewer.`,
      );
    }

    const { rows } = await this.db().query(
      `SELECT user_id, email, age, display_name, marketing_email_consent, unsubscribe_token
         FROM app_users
        WHERE marketing_email_consent = true
          AND age >= $1
        ORDER BY created_at ASC`,
      [NEWSLETTER.minAge],
    );

    const tally = { attempted: 0, sent: 0, sandboxed: 0, failed: 0, skipped: 0 };

    for (const row of rows) {
      const person: NewsletterRecipient = {
        userId: String(row.user_id),
        email: String(row.email ?? ''),
        age: Number(row.age ?? 0),
        marketingEmailConsent: Boolean(row.marketing_email_consent),
      };

      // Belt and braces: the SQL already filtered, but the shared rule is
      // the authority on eligibility and it is cheap to ask it again.
      const may = mayReceiveNewsletter(person);
      if (!may.may) {
        await this.record(issue.id, person.userId, 'skipped', may.because);
        tally.skipped += 1;
        continue;
      }

      const claimed = await this.claim(issue.id, person.userId);
      if (!claimed) continue; // already had this issue

      tally.attempted += 1;
      const token = String(row.unsubscribe_token ?? '');

      try {
        const record = await this.mail.send(
          NEWSLETTER.eventKey,
          person.email,
          { name: String(row.display_name ?? '') },
          issue.body,
          {
            subject: issue.subject,
            unsubscribeUrl: token ? `https://jessmove.com${unsubscribePath(token)}` : undefined,
          },
        );
        await this.settle(issue.id, person.userId, record.status, record.detail);
        if (record.status === 'sent') tally.sent += 1;
        else if (record.status === 'sandbox') tally.sandboxed += 1;
        else tally.failed += 1;
      } catch (error) {
        await this.settle(issue.id, person.userId, 'failed', (error as Error).message);
        tally.failed += 1;
      }
    }

    if (tally.sent > 0 || tally.sandboxed > 0) {
      await this.db().query(
        `UPDATE newsletter_issues
            SET status = 'sent', sent_at = COALESCE(sent_at, now())
          WHERE issue_key = $1 AND status = 'approved'`,
        [issueKey],
      );
    }

    return {
      issueKey,
      ...tally,
      says: says(tally),
    };
  }

  /**
   * Claim a recipient. Returns false when they already have this issue.
   *
   * `ON CONFLICT DO NOTHING` plus `RETURNING` is the whole idempotency
   * mechanism: exactly one caller gets a row back, and only that caller
   * sends.
   */
  private async claim(issueId: number, userId: string): Promise<boolean> {
    const { rows } = await this.db().query(
      `INSERT INTO newsletter_sends (issue_id, user_id, status, detail)
       VALUES ($1, $2, 'sent', 'claimed, delivery in progress')
       ON CONFLICT (issue_id, user_id) DO NOTHING
       RETURNING id`,
      [issueId, userId],
    );
    return rows.length > 0;
  }

  private async settle(
    issueId: number,
    userId: string,
    status: string,
    detail: string,
  ): Promise<void> {
    await this.db().query(
      `UPDATE newsletter_sends SET status = $3, detail = $4, at = now()
        WHERE issue_id = $1 AND user_id = $2`,
      [issueId, userId, status, detail.slice(0, 500)],
    );
  }

  private async record(
    issueId: number,
    userId: string,
    status: string,
    detail: string,
  ): Promise<void> {
    await this.db().query(
      `INSERT INTO newsletter_sends (issue_id, user_id, status, detail)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (issue_id, user_id) DO NOTHING`,
      [issueId, userId, status, detail.slice(0, 500)],
    );
  }

  /** What happened to one issue, per recipient. The answer to "did it go out". */
  async sendsFor(issueKey: string): Promise<{ status: string; n: number }[]> {
    const { rows } = await this.db().query(
      `SELECT s.status, count(*)::int AS n
         FROM newsletter_sends s
         JOIN newsletter_issues i ON i.id = s.issue_id
        WHERE i.issue_key = $1
        GROUP BY s.status
        ORDER BY s.status`,
      [issueKey],
    );
    return rows.map((r) => ({ status: String(r.status), n: Number(r.n) }));
  }
}

function says(t: {
  attempted: number;
  sent: number;
  sandboxed: number;
  failed: number;
  skipped: number;
}): string {
  if (t.attempted === 0 && t.skipped === 0) {
    return 'Nobody was eligible. Every registered account either has not opted in, is under 18, or already had this issue.';
  }
  if (t.sandboxed > 0 && t.sent === 0) {
    return `Rendered for ${t.sandboxed} recipients but not delivered — no SMTP credentials are configured.`;
  }
  const parts = [`${t.sent} delivered`];
  if (t.sandboxed) parts.push(`${t.sandboxed} sandboxed`);
  if (t.failed) parts.push(`${t.failed} failed`);
  if (t.skipped) parts.push(`${t.skipped} skipped`);
  return `${parts.join(', ')}.`;
}

function rowToIssue(row: Record<string, unknown>): StoredIssue {
  return {
    id: Number(row.id),
    issueKey: String(row.issue_key),
    subject: String(row.subject),
    preheader: String(row.preheader ?? ''),
    body: String(row.body ?? ''),
    linkCount: Number(row.link_count ?? 0),
    status: String(row.status) as IssueStatus,
    reviewedBy: row.reviewed_by ? String(row.reviewed_by) : null,
    createdAt: iso(row.created_at),
    approvedAt: row.approved_at ? iso(row.approved_at) : null,
    sentAt: row.sent_at ? iso(row.sent_at) : null,
  };
}

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}
