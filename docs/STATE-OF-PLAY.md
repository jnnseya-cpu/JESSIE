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
| **Every AI call clears 4× its provider cost** | Token counts priced at real per-model rates, then `× 4 × 100` once. Every model on the chain measured at 4.08×–6.79× on three call shapes |
| Every plan clears 4× | Allowance is `price × 100` on all five. Pinned per plan; anything below 4× fails the build |
| An unpriced call is refused, not served free | A zero, negative or unknown provider cost now breaches the guard instead of passing it |
| No caller can discount an action | Every cost component floored at zero, contingency clamped to 0–0.2 |
| An unrecognised model is charged at the dearest rate known | So a changed environment variable cannot switch the margin off |
| An annual plan is delivered monthly | Migration 0028. Eleven deposits owed, released on read, exactly once under four concurrent claims |
| Compute delivered and not paid for is counted | Recorded against `wallet_adjustments`, not silently absorbed |
| A non-GBP invoice grants nothing | Every plan is priced in GBP; an unexpected currency is refused, not converted at an invented rate |

Test suite: **829 passing, 0 failing** — 780 backend, 27 body-command, 22 foodlens.
Smoke suite: **85/85**, signed out.
Money integrity: **16/16** against real Postgres (`pnpm verify:money`).
Migrations 0027 and 0028 verified applying on a real boot.

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
| **The AI token rates are right** | Justin | `MODEL_TOKEN_RATES` in `packages/shared/src/ai-costs.ts` — list prices rounded up at $1 = £0.80. Check against real invoices; an under-estimate is a loss on every call. `AI_TOKEN_RATES_JSON` overrides without a deploy |
| Migration 0028 applied in production | Justin | Applies on the next boot. Until it does, an annual plan still grants the whole year at once |
| Stripe Price IDs still match the plans | Justin | Allowances changed; prices did not, so no Stripe Price needs recreating. Worth confirming the metadata still says the plan name |

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

**The 4× rule is now true, and it was not true anywhere before.** The two
halves both failed, independently, and each hid the other.

**The token price — the larger half.** `requiredAcus` was correct: it takes
a provider cost and returns `cost × 4 × 100 ACU`. It was never given a
provider cost. The adapters computed ACU from a formula of their own —
`((input + output × 3) / 10_000) × (frontier ? 1 : 0.35)` — which knows
nothing about what any model charges, and the gateway then *divided that
back down by 400* to produce the "provider cost" it handed to the
profitability guard. The guard was checking a number reconstructed from the
number it was checking. It could not fail and it never did.

Measured against list prices, on a 2,600-in / 500-out call:

| Model | Billed | Real cost | Cleared |
|---|---|---|---|
| claude-opus-5 | £0.0041 | £0.0602 | **0.068×** |
| claude-sonnet-5 | £0.0014 | £0.0121 | 0.119× |
| gpt-4.1 | £0.0041 | £0.0072 | 0.566× |
| gemini-2.5-pro | £0.0041 | £0.0065 | 0.631× |
| gemini-2.5-flash | £0.0014 | £0.0016 | 0.898× |
| gpt-4.1-mini | £0.0014 | £0.0015 | 0.990× |

Not one AI call this platform ever served cleared 4×. Every one lost money,
and the better the model the worse the loss. `packages/shared/src/ai-costs.ts`
now holds real per-model rates and there is one pricing path; every model
measures 4.08×–6.79× on three call shapes.

**The plan price — the smaller half.** Every allowance sold an ACU below the
penny of revenue the governor assumes, so no plan cleared 4× either.
Allowances are now `price × 100` exactly:

| Plan | Allowance was | Now | Was | Now |
|---|---|---|---|---|
| premium_monthly | 1,200 | 599 | 2.00× | **4.00×** |
| premium_annual | 15,600 | 5,999 | 1.54× | **4.00×** |
| family_monthly | 4,000 | 1,299 | 1.30× | **4.00×** |
| family_annual | 52,000 | 12,999 | **1.00×** | **4.00×** |
| organisation_seat | 400 | 200 | 2.00× | **4.00×** |

Top-up volume bonuses are removed for the same reason — £10 for 1,040 ACU
is 3.85×, and a bonus below face value is the platform paying part of the
member's provider bill. They had never been granted anyway; the tier table
was read by nothing.

**What this costs.** A premium month falls from 1,200 ACU to 599 — roughly
120 mid-model analyses or 24 frontier ones. That is the honest number. The
old one was selling AI at a discount nobody had decided to give.

**One input still needs the owner.** The rates in `ai-costs.ts` are list
prices, rounded up, converted at a deliberately conservative $1 = £0.80.
They are the one number in this model that cannot be derived from the code,
they change without notice, and an under-estimate is a direct loss on every
call. **Justin: check them against real invoices.** `AI_TOKEN_RATES_JSON`
overrides them without a deploy; a zero or negative override is rejected.

**Also worth a look before the pricing page is written.** A family seat
carries 260 ACU a month against premium's 599 for one seat, so five
individual premium subscriptions buy well over twice the allowance of one
family plan. Defensible as a budget tier, but it is a deliberate choice now
rather than an accident.

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
