import { Injectable, Logger } from '@nestjs/common';
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
import { deliver, type MailMessage, type SmtpConfig } from './smtp';

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

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly log: SentRecord[] = [];
  private counter = 0;

  constructor(private readonly config: ConfigService) {}

  private smtp(): SmtpConfig | null {
    const host = this.config.get<string>('SMTP_HOST');
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');
    if (!host || !user || !pass) return null;

    const port = Number(this.config.get<string>('SMTP_PORT') ?? 587);
    return {
      host,
      port,
      // 465 is implicit TLS. Everything else negotiates with STARTTLS.
      secure: port === 465,
      user,
      pass,
      from: this.config.get<string>('SMTP_FROM') ?? `${BRAND.platform} <jess@jessmove.com>`,
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

  status() {
    const smtp = this.smtp();
    return {
      variables: this.variableReport(),
      configured: smtp !== null,
      host: smtp?.host ?? null,
      port: smtp?.port ?? null,
      encryption: smtp ? (smtp.secure ? 'implicit TLS (465)' : 'STARTTLS') : null,
      from: smtp?.from ?? null,
      sent: this.log.filter((r) => r.status === 'sent').length,
      sandboxed: this.log.filter((r) => r.status === 'sandbox').length,
      failed: this.log.filter((r) => r.status === 'failed').length,
      unitCostGbp: CHANNEL_DEFINITIONS.email.unitCostGbp,
      note: smtp
        ? 'Live. Messages are delivered over SMTP.'
        : 'No SMTP credentials. Messages render fully and are recorded as sandbox, so the flow stays testable.',
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
      return record;
    }

    try {
      const reply = await deliver(smtp, message);
      const record: SentRecord = {
        id: this.counter,
        event: eventKey,
        to,
        subject: rendered.subject,
        status: 'sent',
        detail: reply,
        at,
      };
      this.log.unshift(record);
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
      return record;
    }
  }

  recent(limit = 25): readonly SentRecord[] {
    return this.log.slice(0, limit);
  }
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
