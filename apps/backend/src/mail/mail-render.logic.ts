import { BRAND, SIGNATURE_LINE, TAGLINE } from '@jessmove/shared';

/**
 * Rendering an email, as pure functions.
 *
 * This lives apart from `MailService` for a build reason and stays apart
 * for a testing reason. The service is a Nest provider: it carries
 * decorators and a constructor parameter property, neither of which the
 * type-stripping test runner can load, so a test that imports it fails
 * before it asserts anything. The rendering is where the subtle bugs are —
 * a link that arrives as literal markdown, an injected href that becomes a
 * working anchor — and those are exactly the things that must be testable.
 *
 * Nothing here touches SMTP, configuration or the database. Given a title
 * and a body it returns the two parts of a message, deterministically.
 */

/** Absolute base for links in email. A relative href is meaningless in an inbox. */
export const SITE = 'https://jessmove.com';

/**
 * A site-relative path this wrapper is willing to turn into a link.
 *
 * The allowlist is the security control, and it is deliberately narrower
 * than "a valid URL". Newsletter bodies are composed from the link
 * registry, but they are also editable by an operator before approval,
 * which means the render path has to assume the text is untrusted. A
 * pattern that accepts only a leading slash followed by lowercase path
 * characters refuses, by construction: `javascript:` and `data:` schemes,
 * absolute links to another host, protocol-relative `//evil.example`, and
 * credentials or ports smuggled into an authority. Anything not matching
 * is left as literal text — visibly wrong to a reviewer, rather than
 * quietly turned into a working link to somewhere else.
 */
export const SAFE_PATH = /^\/$|^\/[a-z0-9][a-z0-9\-/]*$/;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** `/` becomes the bare origin; every other allowed path is appended as-is. */
function href(path: string): string {
  return `${SITE}${path === '/' ? '' : path}`;
}

/**
 * Inline markup, applied strictly after escaping.
 *
 * The order matters and is the whole reason this is safe: the body is
 * HTML-escaped first, so any markup it contained is already inert text by
 * the time this runs. This then re-introduces exactly two constructs and
 * nothing else — a link to a known-shaped internal path, and bold — which
 * is why it cannot reintroduce an injection the escape just removed.
 *
 * Escaping leaves `[`, `]`, `(` and `)` untouched, so the patterns still
 * match; and a body containing no markdown is returned unchanged, which is
 * what keeps every existing transactional email byte-identical.
 */
export function inlineMarkup(escaped: string): string {
  return escaped
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, label: string, path: string) =>
      SAFE_PATH.test(path)
        ? `<a href="${href(path)}" style="color:#00a99d;font-weight:600">${label}</a>`
        : whole,
    )
    .replace(/\*\*([^*]+)\*\*/g, '<strong style="color:#102a43">$1</strong>');
}

/**
 * The plain-text alternative.
 *
 * A text part that still reads `[start here](/micro-movement)` is worse
 * than no text part: the reader sees punctuation where a destination should
 * be, and cannot reach the page at all. So links become "label (absolute
 * URL)" — the one form that survives a client with no HTML, and the form a
 * spam filter expects to find matching the HTML part.
 */
export function plainBody(body: string): string {
  return body
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, label: string, path: string) =>
      SAFE_PATH.test(path) ? `${label} (${href(path)})` : whole,
    )
    .replace(/\*\*([^*]+)\*\*/g, '$1');
}

/**
 * The branded wrapper. Same shell on every outbound message.
 *
 * `unsubscribeUrl` is passed in rather than derived, because a marketing
 * message must carry an opt-out and a password reset must not — and only
 * the caller knows which kind of message it is sending.
 */
export function wrapMessage(
  title: string,
  bodyText: string,
  unsubscribeUrl?: string,
): { text: string; html: string } {
  const text = [plainBody(bodyText), '', '—', SIGNATURE_LINE, SITE]
    .concat(unsubscribeUrl ? ['', `Stop these emails: ${unsubscribeUrl}`] : [])
    .join('\n');

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
    .map((p) => `<p style="margin:0 0 14px">${inlineMarkup(escapeHtml(p))}</p>`)
    .join('')}</div>
</td></tr>
<tr><td style="padding:8px 28px 26px">
<p style="margin:22px 0 0;padding-top:16px;border-top:1px solid #e6efee;font-size:12.5px;line-height:1.6;color:#7a8896">
${escapeHtml(SIGNATURE_LINE)}<br>
${BRAND.platform} is a general wellness product. It does not diagnose or treat any condition and never contacts emergency services.<br>
<a href="${SITE}/privacy" style="color:#00a99d">Privacy</a> ·
<a href="${SITE}/policies" style="color:#00a99d">All policies</a>${
    unsubscribeUrl
      ? `<br><a href="${escapeHtml(unsubscribeUrl)}" style="color:#7a8896;text-decoration:underline">Unsubscribe from these emails</a>`
      : ''
  }
</p>
</td></tr>
</table>
<p style="max-width:560px;margin:14px auto 0;font-size:11.5px;color:#9aa8b4;text-align:center">${escapeHtml(TAGLINE)}</p>
</div>`;

  return { text, html };
}
