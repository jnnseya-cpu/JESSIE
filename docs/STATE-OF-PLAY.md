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
| No route names a user without guarding them | Structural test walks every controller; the three that did not are fixed |
| A guard is never imported and left unapplied | Six controllers carried a dead guard import; the test now fails on any |
| The smoke suite matches the security posture | 83/83 signed out and signed in, and idempotent across runs |
| Every committed script runs | `docs:sales` and `economics` had never executed |
| Meta Pixel and Google Tag, consent-gated | Browser-verified: no vendor contacted before an opt-in, none at all on the account, the children's page, or with GPC set |
| Conversions counted without a tag on health screens | Signup and payment go server to server, carrying an event and a value and no identity |
| Blog views actually arrive and actually persist | Migration 0026; a real browser session writes a row, and it survives a restart |
| Every published article has an SEO score | The prose moved to shared, so the audit has a body — scores now 15–40, and the findings are real |
| One balance cannot be spent twice | Migration 0027. Measured against real Postgres: eight concurrent full-balance writes, **eight accepted before, one after** |
| A stale instance cannot resurrect spent allowance | The same run, mutation-tested — removing the version guard restores 500 spent ACU |
| A spend that cannot be written is refused, not allowed | `persist` throws instead of logging; the caller refuses and the provider is never called |
| Money that goes back takes the allowance with it | `charge.refunded` and `charge.dispute.created` reverse proportionally against the grant the payment created |
| A reversal happens once | `UNIQUE (kind, reference)` on `wallet_adjustments` — five deliveries of one refund claimed it once |
| What could not be recovered is counted, not hidden | `shortfall_acus`, with a partial index so the losses can be found |
| A dispute freezes the subscription | State moves to `paused` at the same moment the allowance is reversed |
| The billing portal opens only your own account | `customerId` no longer comes from the request; it is resolved server-side from the session |
| A self-only check cannot be skipped by sending an array | The guard refuses anything that is not a string equal to the caller's id |
| The past-due grace period ends | `state_since` only moves on a real transition, so a second failed payment cannot extend it |
| A top-up credits what the pricing advertises | £10 buys the published 1,040 ACU, not 1,000 |
| No plan sells allowance below what it costs to serve | `realisedProtectionMultiple` is computed and pinned per plan; below 1.0 fails the build. family_annual moved from 1.00× to 2.00× |

Test suite: **820 passing, 0 failing** — 773 backend, 25 body-command, 22 foodlens.
Smoke suite: **83/83**, both signed out and signed in.
Money integrity: **11/11** against real Postgres (`pnpm verify:money`).

---

## Built, not yet verified live

These are the only open items. Each names who can close it, because
none of them can be closed from inside a sandbox.

| What | Who can close it | How |
|---|---|---|
| Do the AI provider keys actually work in production? | Justin | Account page → editorial queue → "Check the AI keys actually work" |
| Has the deploy picked up the branch head? | Justin | Vercel build log |
| Four CSO registration fields for DCB0129 | Justin | See `docs/GO-LIVE.md` |
| Are the pixel IDs set? | Justin | `NEXT_PUBLIC_META_PIXEL_ID` and `NEXT_PUBLIC_GOOGLE_TAG_ID` in Vercel. Without them the banner never appears and nothing tracks |
| Server-side conversions | Justin | `META_PIXEL_ID` + `META_CAPI_TOKEN`, and `GOOGLE_TAG_ID` + `GOOGLE_MP_API_SECRET`. Signup and payment stay uncounted until these exist |
| Does the newsletter actually deliver? | Justin | Needs `SMTP_USER` / `SMTP_PASS` in Vercel. Without them every issue renders in full and is recorded as `sandbox` — the flow is proven, the delivery is not |
| Weekly cron for the newsletter | Justin | `POST /api/newsletter/cron` with `Authorization: Bearer $CRON_SECRET` |
| Automatic sending, or approve each issue by hand? | Justin | Unset, the scheduler composes and queues for review. Set `NEWSLETTER_AUTO_APPROVE_BY` to a real name to have it approve and send too — that name is recorded on every issue |
| Migration 0027 applied in production | Justin | Applies on the next boot via `DbService.onModuleInit`. Until it does, the wallet write is unconditional and the reversal tables do not exist |
| Stripe Price IDs still match the plans | Justin | The family *allowances* changed; the family *prices* did not, so no Stripe Price needs recreating. Worth confirming the metadata still says `family_monthly` / `family_annual` |

**Why an agent cannot close these.** Outbound HTTPS from the build
sandbox to `jessmove.com` and `api.jessmove.com` is refused by the
environment's network policy — `CONNECT tunnel failed, 403`. That is a
policy denial, not an outage, and it is not to be worked around. Any
claim about production behaviour made from inside this sandbox is a
guess, and should be written as one or not written.

---

## Known and deliberately not done

**This repository has no linter.** Not in the root, not in any of the four
packages. That is why a security decorator sat imported and unapplied in six
controllers for weeks with a green build, a green typecheck and a green test
suite — nothing in the toolchain reports an unused import.

It is not fixed here because adding ESLint across four packages is an
architectural change that would touch far more than the audit it came from,
and it is the owner's call rather than a cleanup. Two structural tests in
`admin-guard.test.ts` now cover the specific class of bug that actually bit —
a route naming a user without a guard, and a guard imported without being
applied. A linter would still be worth having.

**No plan clears the 4× the Cost Governor assumes, and one of them used
to lose money.** `requiredAcus` prices every action at
`direct cost × 4 × 100 ACU`, where the 100 defines one ACU as a penny of
customer revenue. A top-up pays exactly that penny, so top-ups clear 4×.
Subscriptions sell below it:

| Plan | £ per ACU | Was | Now |
|---|---|---|---|
| family_monthly | 0.00650 | 1.30× | **2.60×** |
| premium_monthly | 0.00499 | 2.00× | 2.00× |
| family_annual | 0.00500 | **1.00×** | **2.00×** |
| organisation_seat | 0.00500 | 2.00× | 2.00× |
| premium_annual | 0.00385 | 1.54× | 1.54× |

**Fixed:** both family allowances were halved — `family_monthly` 4,000 →
2,000 and `family_annual` 52,000 → 26,000, prices unchanged. At the old
figures a family_annual household that used what it bought cost £130 of
provider spend against £129.99 of revenue, before Stripe's £3.06 and
before any of the £1.49 per paying user per month in
`OVERHEAD_PER_PAID_USER_MONTH`. That was a guaranteed loss, and it is now
2.00×, level with premium.

`realisedProtectionMultiple()` computes the figure, `money-integrity.test.ts`
pins every plan's, and any plan falling below 1.0 fails the build.

**Two things left for the owner, neither of them a loss.** `premium_annual`
is now the thinnest at 1.54×. And a family seat now carries 400 ACU a month
against premium's 1,200 for one seat, so five individual premium
subscriptions buy three times the allowance of one family plan for roughly
two and a half times the money — defensible as a budget tier, but the
ladder is worth a look before the pricing page is written.

**Auto top-up is declared and not wired.** `autoTopUpDue` exists, nothing
calls it and nothing sets `autoTopUp`, so it charges nobody today. If it is
ever connected it needs a daily cap first — a wallet pinned at zero would
otherwise trigger a charge on every refused action.

**The free tier is per account, and accounts are per email.** Two free
months of 50 ACU can be had again with a second address. At 50 ACU the
provider cost is about £0.125 an account, so the effort exceeds the prize
and no fingerprinting is being added to a health platform to stop it. Worth
watching if signups ever spike without matching activity.

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

**"Could somebody cancel their subscription and only top up instead?"**
Investigated in full. Not a loophole on price — the cheapest top-up sells
an ACU at 1.86× the premium monthly rate and 2.85× the family monthly
rate, so a top-up-only member pays roughly double per unit of AI. The real
exposure is the other way round: `OVERHEAD_PER_PAID_USER_MONTH` is £1.49 a
month whether or not the member buys anything, so a top-up-only account
must spend about £20 a year to cover its own overhead. Nothing on the
platform is gated on holding a subscription — every AI gate is a balance
check — so cancelling forfeits the monthly allowance and nothing else. That
is coherent as a design; it is recorded here so it is a decision rather
than an accident. The audit that question triggered found the reversal,
concurrency and billing-portal defects listed above. Closed.

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
