import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { makePool } from '../db/pg';
import { ConfigService } from '@nestjs/config';
import {
  BRAND,
  CHANNEL_DEFINITIONS,
  SIGNATURE_LINE,
  TAGLINE,
  eventByKey,
  renderSubject,
  type TemplateToken,
} from '@jessmove/shared';
import {
  deliver,
  isConnectFailure,
  probe,
  probeAdvice,
  type MailMessage,
  type SmtpConfig,
} from './smtp';

/**
 * Outbound email.
 *
 * Every message starts as a catalogue event, so a subject line cannot be
 * invented at a call site — `send()` takes an event key and looks the
 * template up. Unknown tokens throw at render, which is what stops
 * `{{firstname}}` reaching a real inbox.
 *
 * With no SMTP credentials the service records the message as `sandbox`
 * and returns the fully rendered subject and body. The whole flow is
 * therefore testable without a mail server, and a missing credential
 * produces a recorded outcome rather than an exception in a background job.
 */

export interface SentRecord {
  id: number;
  event: string;
  to: string;
  subject: string;
  status: 'sent' | 'sandbox' | 'failed';
  detail: string;
  at: string;
}

interface PgPoolLike {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  end: () => Promise<void>;
}

@Injectable()
export class MailService implements OnModuleDestroy {
  private readonly logger = new Logger(MailService.name);
  private readonly log: SentRecord[] = [];
  private counter = 0;
  private pool: PgPoolLike | null = null;

  constructor(private readonly config: ConfigService) {
    // The log must outlive the instance: on serverless every function
    // keeps a private memory, so a durable record is the only one that
    // tells the truth at /mail/status. Same driver split as UserStore.
    const url = process.env.DATABASE_URL;
    if (url) {
      this.pool = makePool(url, 2);
      this.logger.log('mail log: postgres');
    } else {
      this.logger.warn('mail log: in-memory — the log will not survive a restart');
    }
  }

  /** Best-effort durable write. A broken log must never block an email. */
  private async persist(record: SentRecord): Promise<void> {
    if (!this.pool) return;
    try {
      await this.pool.query(
        `INSERT INTO mail_log (event, recipient, subject, status, detail, at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [record.event, record.to, record.subject, record.status, record.detail, record.at],
      );
    } catch (error) {
      this.logger.warn(`mail log write failed: ${(error as Error).message}`);
    }
  }

  /**
   * Reads a variable, treating two classic dashboard slips as "not set":
   * surrounding whitespace, and a value that is literally the variable's
   * own name (the copy-paste that once dialled a server called
   * "SMTP_HOST" for a full afternoon).
   */
  private cleanVar(key: string): string | undefined {
    const value = this.config.get<string>(key)?.trim();
    return value && value !== key ? value : undefined;
  }

  private smtp(): SmtpConfig | null {
    // The platform's mailbox lives at Hostinger by design, so the host
    // has a sane default and only the credentials are truly required.
    const host = this.cleanVar('SMTP_HOST') ?? 'smtp.hostinger.com';
    const user = this.cleanVar('SMTP_USER');
    const pass = this.cleanVar('SMTP_PASS');
    if (!user || !pass) return null;

    const port = Number(this.cleanVar('SMTP_PORT') ?? 587);
    return {
      host,
      port,
      // 465 is implicit TLS. Everything else negotiates with STARTTLS.
      secure: port === 465,
      user,
      pass,
      from: this.cleanVar('SMTP_FROM') ?? `${BRAND.platform} <jess@jessmove.com>`,
    };
  }

  configured(): boolean {
    return this.smtp() !== null;
  }

  /**
   * Per-variable X-ray for the status endpoint. Values that are not
   * secrets are shown as-is; the password is described, never shown.
   * `isOwnName` catches the classic paste slip where a variable's value
   * is its own name.
   */
  private variableReport(): Record<string, unknown> {
    const inspect = (key: string, secret: boolean) => {
      const fromConfig = this.config.get<string>(key);
      const fromEnv = process.env[key];
      return {
        present: Boolean(fromConfig),
        length: fromConfig?.length ?? 0,
        isOwnName: fromConfig === key,
        hasWhitespace: fromConfig ? /^\s|\s$/.test(fromConfig) : false,
        ...(secret ? {} : { value: fromConfig ?? null }),
        matchesProcessEnv: fromConfig === fromEnv,
      };
    };
    return {
      SMTP_HOST: inspect('SMTP_HOST', false),
      SMTP_PORT: inspect('SMTP_PORT', false),
      SMTP_USER: inspect('SMTP_USER', false),
      SMTP_FROM: inspect('SMTP_FROM', false),
      SMTP_PASS: inspect('SMTP_PASS', true),
    };
  }

  async status() {
    const smtp = this.smtp();
    const tally = await this.tally();
    return {
      variables: this.variableReport(),
      configured: smtp !== null,
      log: this.pool ? 'postgres' : 'memory',
      host: smtp?.host ?? null,
      port: smtp?.port ?? null,
      encryption: smtp ? (smtp.secure ? 'implicit TLS (465)' : 'STARTTLS') : null,
      from: smtp?.from ?? null,
      ...tally,
      unitCostGbp: CHANNEL_DEFINITIONS.email.unitCostGbp,
      note: smtp
        ? 'Live. Messages are delivered over SMTP.'
        : 'No SMTP credentials. Messages render fully and are recorded as sandbox, so the flow stays testable.',
    };
  }

  /** Counts and newest failure — durable when the database is attached. */
  private async tally(): Promise<{
    sent: number;
    sandboxed: number;
    failed: number;
    lastFailure: SentRecord | null;
  }> {
    if (this.pool) {
      try {
        const counts = await this.pool.query(
          'SELECT status, count(*)::int AS n FROM mail_log GROUP BY status',
        );
        const of = (status: string) =>
          Number(counts.rows.find((r) => r.status === status)?.n ?? 0);
        const failure = await this.pool.query(
          `SELECT id, event, recipient, subject, status, detail, at FROM mail_log
           WHERE status = 'failed' ORDER BY at DESC, id DESC LIMIT 1`,
        );
        return {
          sent: of('sent'),
          sandboxed: of('sandbox'),
          failed: of('failed'),
          lastFailure: failure.rows[0] ? rowToRecord(failure.rows[0]) : null,
        };
      } catch (error) {
        this.logger.warn(`mail log read failed: ${(error as Error).message}`);
      }
    }
    return {
      sent: this.log.filter((r) => r.status === 'sent').length,
      sandboxed: this.log.filter((r) => r.status === 'sandbox').length,
      failed: this.log.filter((r) => r.status === 'failed').length,
      lastFailure: this.log.find((r) => r.status === 'failed') ?? null,
    };
  }

  /** The branded wrapper. Same shell on every outbound message. */
  private wrap(title: string, bodyText: string): { text: string; html: string } {
    const text = [bodyText, '', '—', SIGNATURE_LINE, 'https://jessmove.com'].join('\n');

    const html = `<div style="margin:0;padding:24px;background:#f4faf9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #dbe7e5">
<tr><td style="background:#102a43;padding:22px 28px">
<span style="display:inline-block;width:30px;height:30px;border-radius:9px;background:#00a99d;color:#fff;text-align:center;line-height:30px;font-weight:700;font-size:13px">JM</span>
<span style="color:#f4faf9;font-weight:700;letter-spacing:.02em;margin-left:10px;font-size:16px;vertical-align:middle">${BRAND.platform}</span>
</td></tr>
<tr><td style="padding:30px 28px 8px">
<h1 style="margin:0 0 14px;font-size:21px;line-height:1.3;color:#102a43">${escapeHtml(title)}</h1>
<div style="font-size:15.5px;line-height:1.65;color:#33475b">${bodyText
      .split('\n\n')
      .map((p) => `<p style="margin:0 0 14px">${escapeHtml(p)}</p>`)
      .join('')}</div>
</td></tr>
<tr><td style="padding:8px 28px 26px">
<p style="margin:22px 0 0;padding-top:16px;border-top:1px solid #e6efee;font-size:12.5px;line-height:1.6;color:#7a8896">
${escapeHtml(SIGNATURE_LINE)}<br>
${BRAND.platform} is a general wellness product. It does not diagnose or treat any condition and never contacts emergency services.<br>
<a href="https://jessmove.com/privacy" style="color:#00a99d">Privacy</a> ·
<a href="https://jessmove.com/policies" style="color:#00a99d">All policies</a>
</p>
</td></tr>
</table>
<p style="max-width:560px;margin:14px auto 0;font-size:11.5px;color:#9aa8b4;text-align:center">${escapeHtml(TAGLINE)}</p>
</div>`;

    return { text, html };
  }

  /** Render without sending. The preview behind the template QA panel. */
  render(eventKey: string, values: Partial<Record<TemplateToken, string>>, body?: string) {
    const event = eventByKey(eventKey);
    if (!event) throw new Error(`no catalogue event "${eventKey}"`);

    const subject = renderSubject(event.subject, values);
    const content = this.wrap(subject, body ?? defaultBody(eventKey, values));
    return { event: event.key, subject, ...content };
  }

  async send(
    eventKey: string,
    to: string,
    values: Partial<Record<TemplateToken, string>> = {},
    body?: string,
  ): Promise<SentRecord> {
    const rendered = this.render(eventKey, values, body);
    const smtp = this.smtp();
    const at = new Date().toISOString();
    this.counter += 1;

    const message: MailMessage = {
      to,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
    };

    if (!smtp) {
      const record: SentRecord = {
        id: this.counter,
        event: eventKey,
        to,
        subject: rendered.subject,
        status: 'sandbox',
        detail: 'No SMTP credentials configured. Rendered in full, not delivered.',
        at,
      };
      this.log.unshift(record);
      await this.persist(record);
      return record;
    }

    try {
      const { reply, port } = await this.deliverWithPortFallback(smtp, message);
      const record: SentRecord = {
        id: this.counter,
        event: eventKey,
        to,
        subject: rendered.subject,
        status: 'sent',
        detail: port === smtp.port ? reply : `via fallback port ${port} — ${reply}`,
        at,
      };
      this.log.unshift(record);
      await this.persist(record);
      return record;
    } catch (error) {
      this.logger.warn(`mail delivery failed: ${(error as Error).message}`);
      const record: SentRecord = {
        id: this.counter,
        event: eventKey,
        to,
        subject: rendered.subject,
        status: 'failed',
        detail: (error as Error).message,
        at,
      };
      this.log.unshift(record);
      await this.persist(record);
      return record;
    }
  }

  /**
   * Tries the configured submission port; if the network never let us
   * reach the server (timeout, refusal — not a mail rejection), tries the
   * other standard port before giving up. 465 and 587 are the same
   * mailbox behind different doors, and serverless egress sometimes
   * filters exactly one of them.
   */
  private async deliverWithPortFallback(
    smtp: SmtpConfig,
    message: MailMessage,
  ): Promise<{ reply: string; port: number }> {
    try {
      return { reply: await deliver(smtp, message), port: smtp.port };
    } catch (error) {
      const first = error as Error;
      if (!isConnectFailure(first.message)) throw first;

      const fallbackPort = smtp.port === 465 ? 587 : 465;
      this.logger.warn(
        `port ${smtp.port} unreachable (${first.message}) — retrying on ${fallbackPort}`,
      );
      try {
        const alternate: SmtpConfig = { ...smtp, port: fallbackPort, secure: fallbackPort === 465 };
        return { reply: await deliver(alternate, message), port: fallbackPort };
      } catch (secondError) {
        const second = secondError as Error;
        throw new Error(`port ${smtp.port}: ${first.message}; port ${fallbackPort}: ${second.message}`);
      }
    }
  }

  /**
   * Live reachability test from this very process: connect, TLS, log in,
   * hang up — both submission ports, nothing sent. The answer to "is it
   * the password or the network" in one page load.
   */
  async probeConnection() {
    const smtp = this.smtp();
    if (!smtp) {
      return {
        configured: false,
        note: 'SMTP_USER or SMTP_PASS is missing, so there is nothing to probe.',
      };
    }

    const ports = smtp.port === 465 ? [465, 587] : [smtp.port, 465];
    const results = await Promise.all(ports.map((port) => probe(smtp, port)));
    return {
      host: smtp.host,
      user: smtp.user,
      configuredPort: smtp.port,
      results,
      advice: probeAdvice(smtp.port, results),
    };
  }

  async recent(limit = 25): Promise<readonly SentRecord[]> {
    if (this.pool) {
      try {
        const result = await this.pool.query(
          `SELECT id, event, recipient, subject, status, detail, at FROM mail_log
           ORDER BY at DESC, id DESC LIMIT $1`,
          [limit],
        );
        return result.rows.map(rowToRecord);
      } catch (error) {
        this.logger.warn(`mail log read failed: ${(error as Error).message}`);
      }
    }
    return this.log.slice(0, limit);
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }
}

function rowToRecord(row: Record<string, unknown>): SentRecord {
  return {
    id: Number(row.id),
    event: String(row.event),
    to: String(row.recipient),
    subject: String(row.subject),
    status: row.status as SentRecord['status'],
    detail: String(row.detail),
    at: row.at instanceof Date ? row.at.toISOString() : String(row.at),
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** A readable default so every catalogue event previews without bespoke copy. */
function defaultBody(eventKey: string, values: Partial<Record<TemplateToken, string>>): string {
  const event = eventByKey(eventKey);
  const who = values.name ? `Hello ${values.name},` : 'Hello,';
  return [
    who,
    `This is the ${event?.name ?? eventKey} notification from ${BRAND.platform}.`,
    'You are receiving it because of an action on your account. If this was not you, reply to this message and we will look into it.',
  ].join('\n\n');
}
