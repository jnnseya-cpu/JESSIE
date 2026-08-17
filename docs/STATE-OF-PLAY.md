# State of play

One file, kept current, so that nobody — human or agent — has to
reconstruct the state of this platform from memory or from scrollback.

The companion to this file is `CLAUDE.md` at the repository root, which
holds the engineering directive and the repository's verified facts.
That file says *how* to work here; this one says *where the work has got
to*. Both are loaded before planning anything.

It exists because the alternative was observed and is expensive: work
gets re-explained, the same question gets asked three times, and a
platform that is actually progressing reads as unstable because there
is no record saying otherwise. A repository that cannot answer "what is
done, what is proven, and who is next" produces that failure every time
the conversation restarts.

Three columns of truth, and they are not the same column:

- **Built** — the code exists and is on the branch.
- **Proven** — it was exercised against a real database or a real
  browser, and the result was observed. Passing tests count. A
  successful build does not.
- **Live** — it is verified working on jessmove.com.

Something can be built and proven and still not live. Saying so plainly
is the point of the file.

---

## Built and proven

| What | Proven by |
|---|---|
| Walking counts as movement | Migration 0018, tests against real Postgres |
| Macros in the ledger, protein in the advice | Migration 0020, coverage honesty tested |
| A human check on every door | `packages/shared/src/humanity.ts`, 6 doors, per-door token age and attempt limits |
| Instructions from outside are refused | Guard runs before the provider chain, so a deployment with no key still refuses |
| Injection detection calibrated on member language | 0 false positives on 22 realistic sentences, 0 misses on 16 hostile |
| Security events recorded | Migration 0019 |
| Registration reachable from every page | The zero-customer cause. Build fails if it regresses |
| Funnel instrumented and readable | Migration 0021, funnel screen on the account page |
| Referral route for care settings | Migration 0022, 9 referrer kinds, no referral fee |
| Posts persist and publish | Migration 0023, status machine has no draft-to-published edge |
| Autopilot runs survive a restart | Migration 0024, shown as "What it tried" |
| Every ACU says where it came from | `grantSourceLabel`, disclosure on the account page |
| Weekly newsletter, composed from the site's own pages | Migration 0025, 6–7 links an issue, 11-week rotation, sent and re-sent against real Postgres |
| A newsletter reaches nobody twice | `UNIQUE (issue_id, user_id)`; second send attempted 0 with 4 rows for 4 people |
| No marketing email without consent, and none to minors | Consent defaults false with a dated CHECK; an opted-in 12-year-old is still refused |
| One-click unsubscribe with no session | Token `NOT NULL DEFAULT`, so no INSERT can create a member who cannot opt out |
| A launch screen on every installed platform | 36 iOS launch images generated at build from one list; in-document splash verified in Chromium app mode |
| The splash never reaches the open web | `display: none` outside `display-mode: standalone`, confirmed in a browser tab and mutation-tested |
| A failed bundle cannot leave a blank screen | With JavaScript disabled the splash still clears itself and the site is usable |

Test suite: **773 passing, 0 failing** — 726 backend, 25 body-command, 22 foodlens.

---

## Built, not yet verified live

These are the only open items. Each names who can close it, because
none of them can be closed from inside a sandbox.

| What | Who can close it | How |
|---|---|---|
| Do the AI provider keys actually work in production? | Justin | Account page → editorial queue → "Check the AI keys actually work" |
| Has the deploy picked up the branch head? | Justin | Vercel build log |
| Four CSO registration fields for DCB0129 | Justin | See `docs/GO-LIVE.md` |
| Does the newsletter actually deliver? | Justin | Needs `SMTP_USER` / `SMTP_PASS` in Vercel. Without them every issue renders in full and is recorded as `sandbox` — the flow is proven, the delivery is not |
| Weekly cron for the newsletter | Justin | `POST /api/newsletter/cron` with `Authorization: Bearer $CRON_SECRET` |
| Automatic sending, or approve each issue by hand? | Justin | Unset, the scheduler composes and queues for review. Set `NEWSLETTER_AUTO_APPROVE_BY` to a real name to have it approve and send too — that name is recorded on every issue |

**Why an agent cannot close these.** Outbound HTTPS from the build
sandbox to `jessmove.com` and `api.jessmove.com` is refused by the
environment's network policy — `CONNECT tunnel failed, 403`. That is a
policy denial, not an outage, and it is not to be worked around. Any
claim about production behaviour made from inside this sandbox is a
guess, and should be written as one or not written.

---

## Settled — do not reopen

Questions that were investigated, answered, and are closed. They are
recorded here so they stop being asked.

**"The ACUs are increasing instead of reducing."** Not a metering
fault. Nothing in the ledger can mint allowance: `refund()` is capped
at `grant.amount - grant.remaining`, so it can only restore spend and
never exceed it, and `settle()` creates no grants. Reproduced against a
real database — the balance held at exactly 50 across three failed
calls, holds released cleanly. The observed 535.094 reconstructs
exactly as 50 free tier + 200 + 286 staff grants = 536. The grants were
issued by the account owner deliberately. Closed.

**"Not a single customer."** Cause found and fixed: registration was
not reachable from any public page. A build-time check now fails if
that regresses.

---

## Rules that outlive any one conversation

- Develop on `claude/jessie-os-spec-doc-7audof`. Never push elsewhere.
- No vendor beyond Vercel and Firebase.
- `MIN_TRANSACTION_GBP=5`.
- No AI vendor or model names on public-facing pages.
- API keys live in the Vercel dashboard only. Never in the repository.
- Do not disable TLS verification. Do not unset the proxy. Do not route
  around a policy denial — report the blocked host and stop.

---

## Keeping this file honest

Update it in the same commit as the work it describes. A status file
that lags the code is worse than no status file, because it is believed.

If an item moves from "built" to "proven", move it and say what proved
it. If a question gets settled, move it to Settled with the evidence
attached — the evidence is what stops it being reopened.
