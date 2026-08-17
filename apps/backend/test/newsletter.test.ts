import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  NEWSLETTER,
  composeIssue,
  featuresForWeek,
  isValidUnsubscribeToken,
  issueKeyFor,
  mayReceiveNewsletter,
  orderedPaths,
  sellableTargets,
  unsubscribePath,
  isKnownPath,
} from '@jessmove/shared';
import { wrapMessage } from '../src/mail/mail-render.logic.ts';

/**
 * The weekly newsletter.
 *
 * Everything asserted here is something that was wrong at some point while
 * this was being built, or something whose failure would be silent. Those
 * are the only assertions worth the maintenance.
 *
 * The two that matter most are the rotation and the render. A rotation bug
 * does not throw — it produces a perfectly good email that happens to be
 * the same email as last time, and the only symptom is an open rate that
 * decays while everything reports success. A render bug does not throw
 * either: the message arrives, and the reader sees
 * `[start here](/micro-movement)` where a link should be. That exact
 * failure already happened once on this platform, in the blog's
 * auto-linker, and it survived a check that grepped the whole page for the
 * href — which matched the site navigation instead of the article. So the
 * assertions below look at the rendered anchor, not at the presence of a
 * path somewhere in the output.
 */

/* ------------------------------------------------------------------ *
 * Weeks
 * ------------------------------------------------------------------ */

test('a date maps to its ISO week, including across a year boundary', () => {
  assert.equal(issueKeyFor(new Date('2026-08-17T00:00:00Z')), '2026-W34');

  // 2026-12-31 is a Thursday, so ISO week 53 of 2026 — the case a naive
  // implementation gets wrong by reporting week 1 of the wrong year.
  assert.equal(issueKeyFor(new Date('2026-12-31T00:00:00Z')), '2026-W53');

  // 2027-01-01 is a Friday in that same ISO week.
  assert.equal(issueKeyFor(new Date('2027-01-01T00:00:00Z')), '2026-W53');
});

/* ------------------------------------------------------------------ *
 * The rotation — the failure that reports success
 * ------------------------------------------------------------------ */

test('the rotation reaches every sellable page and never repeats a lead twice running', () => {
  const eligible = sellableTargets().filter((t) => t.path !== '/assurance');

  // 53 is the highest ISO week there is. Iterating past it tests nothing
  // real: `weekOf` rejects an impossible week and the composer falls back
  // to week one, so two out-of-range keys produce the same issue and look
  // like a rotation bug that is not there.
  const leads: string[] = [];
  for (let week = 1; week <= 53; week += 1) {
    const key = `2026-W${String(week).padStart(2, '0')}`;
    leads.push(featuresForWeek(key)[0]?.path ?? '');
  }

  // Every page that may lead, does lead. A window stepped by its own width
  // silently covered only a quarter of them.
  assert.equal(
    new Set(leads).size,
    eligible.length,
    `only ${new Set(leads).size} of ${eligible.length} sellable pages ever lead an issue`,
  );

  // And no subscriber gets the same subject two weeks running.
  for (let i = 1; i < leads.length; i += 1) {
    assert.notEqual(leads[i], leads[i - 1], `weeks ${i} and ${i + 1} both lead on ${leads[i]}`);
  }
});

test('the organisation assurance page never opens a member’s issue', () => {
  // It belongs in the body — for an NHS or school buyer it is the whole
  // pitch — but a weekly email that opens on a clinical hazard log is
  // answering a question almost no member asked.
  for (let week = 1; week <= 30; week += 1) {
    const key = `2026-W${String(week).padStart(2, '0')}`;
    assert.notEqual(featuresForWeek(key)[0]?.path, '/assurance');
  }
});

test('an issue is a pure function of its week', () => {
  // This is what makes a scheduler safe to retry: a cron that fires twice
  // recomposes byte-identical copy rather than a second different email.
  const a = composeIssue('2026-W34');
  const b = composeIssue('2026-W34');
  assert.deepEqual(a, b);
  assert.notEqual(composeIssue('2026-W35').subject, a.subject);
});

/* ------------------------------------------------------------------ *
 * Links
 * ------------------------------------------------------------------ */

test('every issue carries enough links, and every link goes somewhere real', () => {
  for (let week = 1; week <= 24; week += 1) {
    const key = `2026-W${String(week).padStart(2, '0')}`;
    const issue = composeIssue(key);

    assert.ok(
      issue.linkCount >= NEWSLETTER.minLinks,
      `${key} composed only ${issue.linkCount} links`,
    );
    assert.equal(issue.linkCount, orderedPaths(issue.body).length);

    for (const path of issue.paths) {
      // A newsletter linking to a page that does not exist is worse than
      // one that links to nothing: it spends the click and loses the reader.
      assert.ok(isKnownPath(path), `${key} links to ${path}, which is not in the registry`);
    }
  }
});

test('a subject line fits in an inbox', () => {
  for (let week = 1; week <= 24; week += 1) {
    const issue = composeIssue(`2026-W${String(week).padStart(2, '0')}`);
    // The database allows 160. A phone shows roughly fifty, so the useful
    // limit is far tighter than the one the column enforces.
    assert.ok(issue.subject.length >= 8, `subject too short: "${issue.subject}"`);
    assert.ok(issue.subject.length <= 70, `subject ${issue.subject.length} chars: "${issue.subject}"`);
    // A truncation that leaves a dangling comma reads as a bug.
    assert.doesNotMatch(issue.subject, /[,;:]…?$/);
  }
});

/* ------------------------------------------------------------------ *
 * Who it may reach
 * ------------------------------------------------------------------ */

test('consent is never inferred from registration', () => {
  const registered = {
    userId: 'u_1',
    email: 'someone@example.test',
    age: 44,
    marketingEmailConsent: false,
  };
  const verdict = mayReceiveNewsletter(registered);
  assert.equal(verdict.may, false);
  assert.equal(verdict.refusal, 'no_consent');
});

test('a minor is not an audience, consent or not', () => {
  // The platform serves ten-year-olds. Marketing email does not, and an
  // opted-in minor is still refused — consent cannot unlock an age rule.
  const child = { userId: 'u_2', email: 'kid@example.test', age: 12, marketingEmailConsent: true };
  const verdict = mayReceiveNewsletter(child);
  assert.equal(verdict.may, false);
  assert.equal(verdict.refusal, 'under_age');
});

test('an adult who opted in is reachable', () => {
  const adult = { userId: 'u_3', email: 'a@example.test', age: 70, marketingEmailConsent: true };
  assert.equal(mayReceiveNewsletter(adult).may, true);
});

test('an account with no usable address is skipped rather than attempted', () => {
  const noAddress = { userId: 'u_4', email: '', age: 30, marketingEmailConsent: true };
  assert.equal(mayReceiveNewsletter(noAddress).refusal, 'no_address');
});

/* ------------------------------------------------------------------ *
 * Unsubscribing
 * ------------------------------------------------------------------ */

test('an unsubscribe token is opaque, fixed-length, and not the user id', () => {
  assert.ok(isValidUnsubscribeToken('0'.repeat(32)));
  assert.ok(isValidUnsubscribeToken('f89375f9eed21f240799292f40f058c4'));

  assert.equal(isValidUnsubscribeToken('u_8f00b6c7-eaf'), false, 'a user id must not pass');
  assert.equal(isValidUnsubscribeToken('short'), false);
  assert.equal(isValidUnsubscribeToken('F89375F9EED21F240799292F40F058C4'), false, 'lowercase hex only');
  assert.equal(isValidUnsubscribeToken(`${'a'.repeat(32)} or 1=1`), false);
});

test('the unsubscribe link carries the token safely', () => {
  const path = unsubscribePath('f89375f9eed21f240799292f40f058c4');
  assert.equal(path, '/unsubscribe?t=f89375f9eed21f240799292f40f058c4');
  // A token is generated by the database, but the encoder is what stops a
  // hand-made value breaking out of the query string.
  assert.match(unsubscribePath('a b&c=d'), /^\/unsubscribe\?t=a%20b%26c%3Dd$/);
});

/* ------------------------------------------------------------------ *
 * The render — the other failure that reports success
 * ------------------------------------------------------------------ */

/*
 * The wrapper is exercised through the real render module rather than a
 * copy of its regexes. A test that reimplements the thing it is testing
 * proves only that the author can write the same bug twice.
 *
 * It imports `mail-render.logic.ts` and not `MailService`, because the
 * service is a Nest provider with a constructor parameter property and the
 * strip-only runner cannot load one. That constraint is why the rendering
 * was extracted in the first place.
 */

test('a composed issue renders as real anchors, not as markdown a reader can see', () => {
  const issue = composeIssue('2026-W34');
  const out = wrapMessage(
    issue.subject,
    issue.body,
    `https://jessmove.com${unsubscribePath('f89375f9eed21f240799292f40f058c4')}`,
  );

  // The failure this guards against: the body arrives intact and the reader
  // sees "[start here](/micro-movement)" where a link should be.
  assert.doesNotMatch(out.html, /\]\(\//, 'markdown link syntax survived into the HTML');
  assert.doesNotMatch(out.html, /\*\*/, 'bold markers survived into the HTML');

  // Every path the issue promised is an actual anchor with an absolute
  // href. Checking for the path alone is what let a link bug through once
  // before — the path matched the site navigation, not the article.
  for (const path of issue.paths) {
    assert.ok(
      out.html.includes(`<a href="https://jessmove.com${path}"`),
      `${path} did not render as an anchor`,
    );
  }

  // The subject is echoed into the heading, so a composed subject that
  // never reached the wrapper would show up here.
  assert.ok(out.html.includes('BodyCommand'));
});

test('the plain-text part gives a reader somewhere to go', () => {
  const issue = composeIssue('2026-W34');
  const out = wrapMessage(issue.subject, issue.body);

  // A text part still carrying markdown is worse than none: the reader sees
  // punctuation where a destination should be and cannot reach the page.
  assert.doesNotMatch(out.text, /\]\(\//);
  assert.ok(out.text.includes(`(https://jessmove.com${issue.paths[0]})`));
});

test('the render refuses to turn an injected external link into an anchor', () => {
  // Issue bodies are composed from the registry, but an operator may edit
  // one before approval, so the render path treats the body as untrusted.
  const hostile = [
    '[click me](https://evil.example/steal)',
    '[or me](//evil.example)',
    '[or me](javascript:alert(1))',
    '[or me](/legit" onmouseover="alert(1))',
    '<script>alert(1)</script>',
  ].join('\n\n');

  const out = wrapMessage('Hostile body', hostile);

  /*
   * What is asserted is that nothing became a *link*, not that the text
   * vanished. Leaving a refused target as visible literal markup is the
   * designed behaviour: a reviewer reading the issue sees
   * "[click me](https://evil.example/steal)" sitting there obviously wrong,
   * which is far safer than the render quietly dropping it and the reviewer
   * approving copy whose real content they never saw.
   */
  const anchors = out.html.match(/<a\s[^>]*href="([^"]*)"/g) ?? [];
  for (const anchor of anchors) {
    assert.doesNotMatch(anchor, /evil\.example/, `an external host became a link: ${anchor}`);
    assert.doesNotMatch(anchor, /javascript:/, `a script scheme became a link: ${anchor}`);
  }

  /*
   * Nothing may break out of an attribute or reintroduce a tag. The test is
   * for an *unescaped* quote, not for the handler's name: the payload
   * `/legit" onmouseover="alert(1)` renders as
   * `[or me](/legit&quot; onmouseover=&quot;alert(1))` — the words survive
   * as prose, the quotes do not survive as syntax, and there is no anchor
   * at all because the path failed the allowlist.
   */
  assert.doesNotMatch(out.html, /onmouseover="/, 'an attribute escaped the quoting');
  assert.doesNotMatch(out.html, /<script>/, 'a tag survived escaping');
  assert.ok(out.html.includes('&lt;script&gt;'), 'the tag should be present but inert');
});

test('an unsubscribe link appears when one is passed, and never otherwise', () => {
  const withOptOut = wrapMessage(
    'Subject',
    'Body.',
    'https://jessmove.com/unsubscribe?t=' + 'a'.repeat(32),
  );
  assert.match(withOptOut.html, /Unsubscribe from these emails/);
  assert.match(withOptOut.text, /Stop these emails: https:\/\/jessmove\.com\/unsubscribe/);

  // A password reset must not carry a marketing opt-out, so the footer is
  // driven by the caller rather than inferred from the event.
  const transactional = wrapMessage('Verify your email address', 'Body.');
  assert.doesNotMatch(transactional.html, /Unsubscribe/);
  assert.doesNotMatch(transactional.text, /Stop these emails/);
});

test('existing transactional mail renders exactly as it did before links were added', () => {
  // The linkifier runs after escaping and only recognises two constructs,
  // so a body containing neither must come out byte-identical. This is the
  // regression guard for every email the platform already sends.
  const plain = 'Hello,\n\nSomething happened on your account (nothing to do).\n\nRegards.';
  const out = wrapMessage('Registration received', plain);
  assert.ok(out.html.includes('Something happened on your account (nothing to do).'));
  assert.ok(out.text.startsWith(plain));
});
