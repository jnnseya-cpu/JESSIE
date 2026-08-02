import { createConnection, type Socket } from 'node:net';
import { connect as tlsConnect, type TLSSocket } from 'node:tls';
import { createHmac } from 'node:crypto';

/**
 * A minimal SMTP client.
 *
 * Written directly rather than pulling in a mail library, for the same
 * reason as the Stripe signature: it is the part that has to be right, and
 * a hundred lines that can be read beats a dependency that cannot.
 *
 * Supports what a transactional provider actually needs — STARTTLS or
 * implicit TLS, AUTH LOGIN and AUTH PLAIN, dot-stuffing, and correct line
 * endings. It does not support attachments, because nothing this platform
 * sends has one.
 */

export interface SmtpConfig {
  host: string;
  port: number;
  /** True for port 465 (implicit TLS). False for 587 with STARTTLS. */
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  timeoutMs?: number;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

/**
 * Written without TypeScript parameter properties on purpose: the test
 * suite runs under Node's type-stripping mode, which does not support
 * them, and this file is imported directly by `billing.test.ts`.
 */
class SmtpError extends Error {
  readonly code: number;
  readonly reply: string;

  constructor(code: number, reply: string, stage: string) {
    super(`SMTP ${stage} failed: ${code} ${reply.trim()}`);
    this.name = 'SmtpError';
    this.code = code;
    this.reply = reply;
  }
}

/** Header injection guard. A newline in a header is how spam gets relayed. */
function headerSafe(value: string, field: string): string {
  if (/[\r\n]/.test(value)) {
    throw new Error(`the ${field} header contains a line break, which is not allowed`);
  }
  return value.trim();
}

/** RFC 5321: a line starting with a dot is escaped, or it ends the message. */
function dotStuff(body: string): string {
  return body.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');
}

function encodeHeaderWord(value: string): string {
  // Non-ASCII in a subject needs encoding, or it arrives as mojibake.
  return /^[\x20-\x7E]*$/.test(value)
    ? value
    : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

export function buildMessage(config: SmtpConfig, message: MailMessage, boundary: string): string {
  const to = headerSafe(message.to, 'To');
  const from = headerSafe(config.from, 'From');
  const subject = encodeHeaderWord(headerSafe(message.subject, 'Subject'));

  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    message.replyTo ? `Reply-To: ${headerSafe(message.replyTo, 'Reply-To')}` : null,
    `Subject: ${subject}`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
  ].filter(Boolean) as string[];

  if (!message.html) {
    headers.push('Content-Type: text/plain; charset=UTF-8');
    return `${headers.join('\r\n')}\r\n\r\n${dotStuff(message.text)}`;
  }

  headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
  const body = [
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    dotStuff(message.text),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    '',
    dotStuff(message.html),
    `--${boundary}--`,
    '',
  ].join('\r\n');

  return `${headers.join('\r\n')}\r\n\r\n${body}`;
}

type AnySocket = Socket | TLSSocket;

/** Reads one SMTP reply, handling multi-line responses. */
function readReply(socket: AnySocket, timeoutMs: number): Promise<{ code: number; text: string }> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const onData = (chunk: Buffer): void => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\r\n').filter(Boolean);
      const last = lines[lines.length - 1];
      // A hyphen after the code means more lines follow.
      if (last && /^\d{3} /.test(last)) {
        cleanup();
        resolve({ code: Number(last.slice(0, 3)), text: buffer });
      }
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    const timer = setTimeout(() => onError(new Error('SMTP read timed out')), timeoutMs);
    const cleanup = (): void => {
      clearTimeout(timer);
      socket.off('data', onData);
      socket.off('error', onError);
    };
    socket.on('data', onData);
    socket.on('error', onError);
  });
}

async function send(socket: AnySocket, line: string, stage: string, timeoutMs: number, expect = 2): Promise<string> {
  socket.write(`${line}\r\n`);
  const reply = await readReply(socket, timeoutMs);
  if (Math.floor(reply.code / 100) !== expect) throw new SmtpError(reply.code, reply.text, stage);
  return reply.text;
}

/**
 * Opens a connection and authenticates: connect, greeting, EHLO,
 * STARTTLS where the port calls for it, AUTH LOGIN. Returns a socket
 * ready for MAIL FROM. On any failure the socket is destroyed before
 * the error propagates, so callers never hold a half-open connection.
 */
async function open(config: SmtpConfig, timeoutMs: number): Promise<AnySocket> {
  let socket: AnySocket = config.secure
    ? tlsConnect({ host: config.host, port: config.port, servername: config.host })
    : createConnection({ host: config.host, port: config.port });

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('SMTP connect timed out')), timeoutMs);
      socket.once(config.secure ? 'secureConnect' : 'connect', () => {
        clearTimeout(timer);
        resolve();
      });
      socket.once('error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
    });

    const greeting = await readReply(socket, timeoutMs);
    if (Math.floor(greeting.code / 100) !== 2) {
      throw new SmtpError(greeting.code, greeting.text, 'greeting');
    }

    await send(socket, `EHLO ${config.host}`, 'EHLO', timeoutMs);

    if (!config.secure) {
      await send(socket, 'STARTTLS', 'STARTTLS', timeoutMs);
      const upgraded = tlsConnect({ socket: socket as Socket, servername: config.host });
      await new Promise<void>((resolve, reject) => {
        upgraded.once('secureConnect', () => resolve());
        upgraded.once('error', reject);
      });
      socket = upgraded;
      await send(socket, `EHLO ${config.host}`, 'EHLO after STARTTLS', timeoutMs);
    }

    // AUTH LOGIN: base64 username, then base64 password, each its own step.
    await send(socket, 'AUTH LOGIN', 'AUTH', timeoutMs, 3);
    await send(socket, Buffer.from(config.user).toString('base64'), 'AUTH user', timeoutMs, 3);
    await send(socket, Buffer.from(config.pass).toString('base64'), 'AUTH password', timeoutMs);

    return socket;
  } catch (error) {
    socket.destroy();
    throw error;
  }
}

/**
 * Whether a delivery failure happened before the server said anything —
 * the network refused us, rather than the mail being rejected. These are
 * the failures where trying the other submission port is worth it.
 */
export function isConnectFailure(message: string): boolean {
  return /connect timed out|read timed out|ETIMEDOUT|ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH|ENOTFOUND|EPIPE/i.test(
    message,
  );
}

export interface ProbeResult {
  port: number;
  encryption: 'implicit TLS' | 'STARTTLS';
  ok: boolean;
  detail: string;
  ms: number;
}

/**
 * Connects and authenticates without sending anything, then QUITs.
 * Success proves the whole chain — network path, TLS, mailbox
 * credentials — from wherever this process is actually running, which is
 * the only place that matters on serverless.
 */
export async function probe(base: SmtpConfig, port: number, timeoutMs = 8_000): Promise<ProbeResult> {
  const config: SmtpConfig = { ...base, port, secure: port === 465 };
  const encryption = config.secure ? ('implicit TLS' as const) : ('STARTTLS' as const);
  const started = Date.now();
  try {
    const socket = await open(config, timeoutMs);
    try {
      await send(socket, 'QUIT', 'QUIT', timeoutMs);
    } catch {
      // Connection already proved everything; a rude QUIT is fine.
    }
    socket.destroy();
    return {
      port,
      encryption,
      ok: true,
      detail: 'Connected, TLS negotiated, credentials accepted.',
      ms: Date.now() - started,
    };
  } catch (error) {
    return { port, encryption, ok: false, detail: (error as Error).message, ms: Date.now() - started };
  }
}

/** Turns two probe rows into the one sentence the operator needs. */
export function probeAdvice(configuredPort: number, results: ProbeResult[]): string {
  const working = results.filter((r) => r.ok);
  const configured = results.find((r) => r.port === configuredPort);

  if (configured?.ok) {
    return `Port ${configuredPort} works end to end — connection, TLS and login all passed. If a message still fails, the reason will be in lastFailure on /mail/status.`;
  }
  if (working.length > 0) {
    const alt = working[0]!;
    return `Port ${configuredPort} is unreachable from here, but port ${alt.port} works and sending falls back to it automatically. To make it the first choice, set SMTP_PORT=${alt.port} and redeploy.`;
  }
  const authFailure = results.find((r) => /535|AUTH/i.test(r.detail));
  if (authFailure) {
    return `The server was reached but rejected the login (${authFailure.detail}). Reset the mailbox password in Hostinger → Emails, update SMTP_PASS, and redeploy.`;
  }
  return `Neither port ${results.map((r) => r.port).join(' nor ')} could be reached from this deployment (${results[0]?.detail ?? 'no detail'}). That points at network egress, not credentials.`;
}

/**
 * Delivers one message. Resolves with the final server reply, which is
 * worth keeping — it usually contains the provider's message id.
 */
export async function deliver(config: SmtpConfig, message: MailMessage): Promise<string> {
  const timeoutMs = config.timeoutMs ?? 15_000;
  const boundary = `jm-${createHmac('sha256', config.host).update(message.to).digest('hex').slice(0, 24)}`;

  const socket = await open(config, timeoutMs);

  try {
    const envelopeFrom = config.from.match(/<([^>]+)>/)?.[1] ?? config.from;
    await send(socket, `MAIL FROM:<${envelopeFrom}>`, 'MAIL FROM', timeoutMs);
    await send(socket, `RCPT TO:<${message.to}>`, 'RCPT TO', timeoutMs);
    await send(socket, 'DATA', 'DATA', timeoutMs, 3);

    socket.write(`${buildMessage(config, message, boundary)}\r\n.\r\n`);
    const accepted = await readReply(socket, timeoutMs);
    if (Math.floor(accepted.code / 100) !== 2) {
      throw new SmtpError(accepted.code, accepted.text, 'message body');
    }

    try {
      await send(socket, 'QUIT', 'QUIT', timeoutMs);
    } catch {
      // A server that drops the connection at QUIT has still accepted the
      // message. Not worth failing a delivery over.
    }

    return accepted.text.trim();
  } finally {
    socket.destroy();
  }
}
