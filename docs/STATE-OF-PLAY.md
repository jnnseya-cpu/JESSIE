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
| A native shell exists, and the web build does not depend on it | `apps/mobile`. Proven: `window.JessMoveNative` is `undefined` in a browser, the device-calendar button is not rendered, and the Snap request sends the identical payload it sent before the shell existed |
| A confused shell makes the product quieter, never louder | `native-bridge.test.ts` — 26 assertions, five of them reading the Swift and Kotlin source because no compiler here can. Low-confidence motion, stale motion, future timestamps, unknown health scopes and a mismatched bridge version all resolve to `unknown`, refused, or no capabilities |
| The calendar is read, and never seen | `packages/shared/src/calendar.ts` parses .ics in the browser. Proven at runtime: an event titled "Oncology follow-up with Dr Patel" produced 14 correct windows and the payload leaving the browser carried only weekdays and minutes |
| A free trial buys thirty FoodLens analyses, not two | `LENS` moved to `mid_tier_llm` and `FREE_TIER` to 150 ACU. Asserted by what it buys rather than by the number, so a model or rate change fails the test rather than a member's first week |
| The platform can start a conversation | Migration 0030, `/api/nudge/cron`. Proven against real Postgres: candidate → declared window → engine → VAPID sign → encrypt → POST |
| The daily cap is counted, not asserted by the caller | `snapsDeliveredToday`, `dailyCap` and `minutesSinceLastNudge` removed from the request DTO; counted from `member_activity` and read from the age mode. Proven: six offers today → `held / daily_cap_reached` |
| A failed push does not spend the member's ceiling | Proven: a delivery to an unreachable endpoint records `failed` and writes no `snap_offered` row |
| The context engine is no longer fed fabrications | The web client asserted `motionState: 'still'` and `locationClass: 'home'` on every request; both are now `unknown` and `onCall`/`doNotDisturb` are omitted rather than guessed |
| The comms module cannot claim a delivery it did not make | Four phantom provider keys deleted; every channel without a transport in this repository records `sandbox` |
| The status page publishes nothing it has not measured | `/status` reads `/api/health` per request, uncached. Proven both ways: with the API up it renders the live database and gateway checks; with the API killed it renders "Down / Unknown / Unknown" rather than guessing. `public-claims.test.ts` fails if a synthetic history or a dated incident returns |
| An article cannot reach review below 90/100 | `SEO_RULES.scorePass` is 90. At 25/8/3 for blocker/warning/note that permits one warning and nothing else. Both audit fixtures failed when it moved and were rewritten rather than the bar lowered |
| Every article on the site can be quoted, not only the agent's | All eight hand-written corpus articles carry three question-and-answer pairs, drawn from their own prose. `blog.test.ts` audits each one through the real `seoAudit` and asserts no `faq.*` finding |
| An article has a passage an answer engine can lift | `answer.missing` is a blocker: the body must open with 25–90 words containing the phrase, before any heading. `faq` pairs become `FAQPage`, rendered visibly as well as in the markup |
| A share is not a blank rectangle | `opengraph-image` per article. Proven: a real 1200×630 PNG for both a corpus article and a database-backed one. Every page declared `summary_large_image` and no image existed anywhere |
| The site offers no integration nobody can make | `PROVIDER_AVAILABILITY` gives every wearable a "connect today" answer, and `MOBILE_APP_RELEASED` is the one fact the API's readiness and the page's copy both read |
| The brand typefaces are actually delivered | Six self-hosted woff2 in `apps/frontend/public/fonts`; §8 named Inter and Manrope and nothing ever loaded them |
| Every text node on every public route clears WCAG AA | `pnpm check:contrast` — 7,274 nodes across 28 routes, 0 below threshold, down from 1,097. Translucent layers composited, gradients measured at every stop |
| The landing page speaks to one audience, and the organisation page to the other | `/` is consumer; `/industries` carries the command centre, the k-anonymity architecture and seat pricing |
| No efficacy target is drawn as though it were a result | `CompareBars` renders a `pending` row as a dashed outline labelled `target`; the 62% figure has never been measured |
| No page overflows, clips its own text or ships an undersized target | `pnpm check:layout` — 28 routes at 1440px and 390px, 0 problems, down from 133 |
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

| **Losing the database no longer kills the API** | Postgres stopped under a running API: before, `[exited with code 1]` and every route dead including `/health`; after, five read routes still 200 and the pool reconnects with no restart |
| The login rate limit survives an instance restart | 8 attempts, restart, limit engages at 14 total — a fresh instance used to allow 12 more |
| The API sends security headers | Eight headers on every response, and `X-Powered-By: Express` removed |
| A quote can never say an action is free | `providerCostGbp: 0` is a 400, not "0 ACU" |
| The build is reproducible from a clean clone | `pnpm build`, `typecheck` and `test` all pass with every `dist/` deleted |

| Zero known dependency vulnerabilities | Next 14 → 15.5.24, React 18 → 19, plus overrides on five build-time leaves. Was 31 advisories, 16 of them high |
| The restore procedure works | 53 tables, 387 rows, 29 migrations and 177 constraints rebuilt from a dump into an empty database, and compared |
| Deletion removes the member | Searched every text, uuid and jsonb column in the schema afterwards — no trace |
| The product works in a real browser | 21 routes render, registration completes, the view beacon fires, no sideways scroll at 360px, focus visible on 25/25 elements |
| No secret reaches the browser | 1.4MB of client bundle scanned for Stripe keys, webhook secrets, Postgres URLs, AI provider keys and AUTH_SECRET |
| It holds under concurrency | 6,300 requests, **0 errors**, including a 200-way spike; recovers cleanly and does not drift under soak |

Test suite: **942 passing, 0 failing** — 893 backend, 27 body-command, 22 foodlens.
Smoke suite: **85/85**, signed out.
Adversarial probe: **37/37**, 2 warnings (`pnpm verify:adversarial`).
Money integrity: **16/16** against real Postgres (`pnpm verify:money`).
Recovery and deletion: **9/9** (`pnpm verify:recovery`).
Browser journeys: **43/43** in Chromium (`pnpm verify:journeys`).
Dependency audit: **no known vulnerabilities**.
Migrations **0001–0029 verified applying to an empty database** on a real boot.

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
| **The Stripe webhook URL is wrong in the dashboard** | Justin | Registered as `https://www.jessmove.com/v1/payments/stripe-webhook`. That host is the Next.js site and that path exists nowhere in this repo, so every event 404s. Change it to **`https://api.jessmove.com/api/stripe/webhook`**, confirm the signing secret still matches `STRIPE_WEBHOOK_SECRET`, then replay the failed events. `GET /api/stripe/status` now prints the correct URL |
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

## Why no payment has ever granted anything

The Stripe endpoint for Jess Move is registered as
`https://www.jessmove.com/v1/payments/stripe-webhook`. Both halves are
wrong:

- `www.jessmove.com` is the Next.js site on Vercel. The NestJS API is a
  separate deployment at `api.jessmove.com` — see `apiBase()`.
- `/v1/payments/stripe-webhook` exists nowhere in this repository. There is
  no such route and no rewrite in `apps/frontend/vercel.json`. The
  controller is `@Controller('stripe')` + `@Post('webhook')` under
  `setGlobalPrefix('api')`, which is `/api/stripe/webhook`.

So every event has hit the frontend and 404'd. What follows from that:

- **`invoice.paid` is the only event that grants ACU, and it has never
  arrived.** No subscription has ever granted allowance.
- **`payment_intent.succeeded` credits top-ups, and it has never arrived.**
  No top-up has ever credited.
- **`checkout.session.completed` links a Stripe customer to an account.**
  It has never arrived, so `stripe_customers` is empty — which means a
  refund for an existing customer still cannot be matched to a wallet even
  after the URL is fixed, until that member transacts again.
- Signup and payment conversions were never counted, independently of
  whether the pixel IDs are set.

It also corroborates the ACU finding from earlier: the observed balance
reconstructed exactly as free tier plus staff grants, with no subscription
component. There was none to have.

The fix is a dashboard change and cannot be made from here. `GET
/api/stripe/status` now returns `webhookUrl` — the absolute URL, built from
`API_PUBLIC_URL` and `WEBHOOK_PATH` so the two cannot disagree. It used to
report only a path, and a path is not enough to get right.

Stripe retries a failed event for about three days, so anything older than
that is gone; the recent ones can be resent from the Events tab once the
URL is corrected.

---

## What a launch audit could not test from here

The audit that produced the fixes above ran against the release candidate
on a local instance with a real Postgres. These are the areas it could not
reach, and none of them should be read as passing:

| Area | Why | Who can close it |
|---|---|---|
| Anything on production | `CONNECT tunnel failed, 403` — the environment refuses jessmove.com and api.jessmove.com by policy | Justin |
| Load, stress, soak, p95/p99 | No production-like environment to load; local figures would be meaningless | Justin |
| Backup restoration | No production backup is reachable. **A backup that has never been restored is not a verified backup** | Justin |
| Rollback | Never exercised against a real deployment | Justin |
| Monitoring and alerting | None found in the repository. There is no error tracker, no uptime check, no alert routing, and no assigned responder | Justin |
| Cross-browser and device | Only Chromium is available here; Safari, Firefox and real mobile untested | Justin |
| Email, SMS and WhatsApp delivery | No SMTP credentials; every issue renders and is recorded as `sandbox` | Justin |
| Accessibility | No screen-reader or keyboard-only pass was run | Justin |
| The 31 dependency advisories | 16 high, mostly Next.js (SSRF in rewrites, middleware bypass, DoS). Patched versions require a major upgrade from Next 14 | Justin |

**No rate limit on `/blog/views`.** Forty unauthenticated writes in a row
were all accepted. It costs no AI, so it is not a denial-of-wallet — it is
analytics pollution and a spam surface. The humanity doors are limited;
this route is not behind one.

---

## Watch list

**One backend test failed once and has not failed again.** A recursive
`pnpm test` reported `# fail 1` on a single run; eight subsequent full
runs reported 942 passing and 0 failing, and the failing subtest's name
was not captured. So there is a flaky test in `apps/backend/test` and its
identity is unknown. That matters more than it looks: a suite that fails
one run in nine teaches everybody to re-run it, and the habit of
re-running a red suite is how a real regression gets shipped. Next time
it appears, capture the output — `pnpm test 2>&1 | tee /tmp/t.log` and
read the `not ok` line — rather than re-running to see if it clears.

**The sales deck's figures are a snapshot, not a live read.**
`docs/sales/` holds the corporate deck, its generator and a table mapping
every claim on every slide to the file it came from. Slide 7 and slide 9
name four things as *not built* — a trend series, sedentary-risk
distribution, a return-on-investment model, and single sign-on with
directory sync. Single sign-on is a contracted inclusion of the
organisation plan that exists nowhere in the code, which is exactly why
the slide says so. If one of the four gets built, move it across in the
deck and in that table. If a figure changes and the deck does not, the
deck is quoting an invented number with a provenance attached, which is
worse than no deck.

**The editorial pipeline now writes for being quoted, not only ranked.**
The bar moved from 80 to 90 and three things were added that decide
whether an article is extractable at all. Everything downstream of a
search box takes a passage rather than ranking a page — a featured
snippet, an AI overview, an assistant asked a question — and an article
that opens by setting the scene has nothing to take.

- **An opening answer is a blocker.** 25–90 words before any heading,
  containing the phrase, written to stand alone when quoted.
- **`FAQPage` structured data**, from pairs the agent must now return.
  Rendered visibly as well as in the markup: structured data describing
  content a reader cannot see is hidden markup by every search engine's
  guidelines, and penalised.
- **The named reviewer reaches the structured data** as `reviewedBy`. It
  is the one E-E-A-T signal this platform can make truthfully and most
  cannot, because the review is a clinical safety control rather than a
  workflow step — `posts` has a CHECK refusing a published row without
  one. `author` becomes a `Person` only when a person wrote it; a
  manufactured byline is worse than the lost signal.

Three gaps closed alongside it. **Every page declared
`twitter: summary_large_image` and no image existed anywhere** — no
`opengraph-image`, no static file, no `images` key — so every share into
Slack, WhatsApp or LinkedIn arrived as a reserved blank. There is now a
generated card per article, typographic rather than a stock photograph of
somebody stretching. **`/llms.txt`** describes the site to an assistant
in the form the convention expects, generated from the same registry the
sitemap reads. **`robots.txt` names the assistants explicitly** —
`GPTBot`, `ClaudeBot`, `PerplexityBot`, `Google-Extended` and the rest —
which changes no permission the wildcard already gave and makes it a
decision somebody has to argue with rather than a default that gets
tightened by accident.

**A real linking defect, found on the way.** `renderBody` applied
`max: 6` per paragraph with `exclude` computed from that paragraph alone,
so no state crossed a paragraph boundary and a twelve-paragraph article
could link `/micro-movement` twelve times. `autoLinksFor` documents "one
link per destination" and the rule held inside each call while the
article as a whole broke it. One budget now spends top-down across the
article, and it scales with length — `linkBudgetFor` at seven per
thousand words, floored at four and capped at fourteen, because density
is what a reader notices and that is a rate rather than a count. Proven
against a rendered article: one link per destination in the body, with
the cluster's own navigation link separate and deliberate.

**The platform could not take money, and nothing reported it.**
`/stripe/checkout`, `/topup`, `/portal` and `/subscription/:userId` were
complete — `@SelfOnly` guarded, priced from `PLAN_DEFINITIONS`, covered by
a webhook that is idempotent about money — and **no code in the
application called any of them**. The homepage advertised Premium at a
monthly price with a button reading "Start free" that created a free
account. There was no path from anywhere on the site to a payment.

Now wired into the account panel: Upgrade, Manage billing and a £5 top-up.
The checkout URL is always taken from our own API's response — a URL
assembled on the client is one somebody else can assemble too — and a
deployment without `STRIPE_SECRET_KEY` says "payments are not switched on
for this deployment yet" rather than offering a button that fails.
Proven: both routes refuse an unauthenticated POST with 401, and
`/stripe/status` reports `secretKeyConfigured: false` here, which is what
the honest UI state reads.

**`scripts/find-unreachable.mjs`, and why it is a different question.**
`find-unwired` asks whether an export is consulted; `admin-guard` asks
whether a route is guarded. Neither asks whether a member can get to the
thing, which is the failure that has cost the most here — the native
bridge, calendar permission, push in the app and now payment all
compiled, typechecked and passed every test while being unreachable.

It maps all 181 routes against every call the site makes, and against the
endpoints `/developers` publishes as a product, since those are reachable
by a third party by design. 113 are reached; 68 are not. Getting the tool
honest took three passes and each correction is recorded in it: matching
helper names missed `api(\`/auth/${mode}\`)` and reported `/auth/login`
as dead on a site that plainly logs people in; exact shape comparison
missed wildcards on the client side; and the character class stopped at
`encodeURIComponent(`. A reachability audit that cries wolf is worse than
none, because the second false positive is when somebody stops reading it.

**Nine member-facing routes remain unreachable, reported not fixed.** Four
are a complete profile subsystem — `autosave` with optimistic concurrency,
`commit`, `media`, and an `as/:viewer` visibility preview — while the
account panel uses `/auth/me` instead. That is two profile implementations,
and choosing between them is an architecture decision rather than a wiring
job. Five are the wearables connection flow, which cannot be reached
because no provider can be connected yet — the same fact
`PROVIDER_AVAILABILITY` publishes on `/wearables`.

**The corpus editing pass is done, and what is left is only the lexicon.**
Scores went from 0–65 to 50–100: three articles at 100, three at 75, two
at 50 — and those numbers are now arithmetic rather than judgement, since
a lexicon blocker costs 25 and nothing else is firing. `blog.test.ts`
asserts exactly that: zero non-lexicon findings on every article, and a
score equal to `100 - lexicon × 25`. A regression names itself.

The root cause was the same on all eight and worth recording: **every
article had zero occurrences of its own target keyword**. The phrases were
assigned as search targets and the prose was never written to them, which
is why `title.keyword`, `answer.keyword` and `keyword.density` fired
together everywhere. Fixed by editing the writing to say what the article
is actually about — titles now carry their phrase inside 30–62 characters,
ledes open with it, descriptions sit under 158, and every article links
to four real pages including its cluster pillar. No keyword was changed to
match weak prose.

**The lexicon exemption, scoped to the blog and narrow by construction.**
All eight corpus articles now score 100. The lexicon was doing two jobs:
stopping the product saying "burn fat" to a person, which is what it was
written for, and stopping the platform writing about its own rules, which
it was never meant to do — but `seoAudit` is the blog's gate and the check
lives inside it. Five essays failed on four terms, every one a mention:
`a number labelled "body fat"` explaining what C6 forbids, `No "you lost
your streak" message` quoting copy that will never be sent, and
"safeguarding failure" three times.

A person now declares the mention, per term, per article, in writing. Four
guards make it narrow rather than merely convenient:

- **A model cannot reach it.** `SeoAgentService` calls
  `assertEditorialSafe`, which throws before the audit is consulted and
  has no notion of an exemption. The path that produces copy at scale is
  exactly as absolute as it was; a declaration can only cover prose a
  person wrote and a named reviewer cleared.
- **Never a title or a description.** Those travel without their article
  into a search result, a social card and `llms.txt`. This guard cost a
  real edit: `why-the-streak-forgives` had "guilt" in its description and
  the description was rewritten rather than the guard widened.
- **Void under `strict`.** Anything a minor or a later-life reader may see
  gets the absolute list, whatever is declared. The strict additions —
  body, shape, size, compete, beat, rank — can never be exempted at all.
- **A stale declaration is a finding.** A permission for a word the
  article does not contain is a gate held open for prose to grow into.

`lexicon-exemption.test.ts` attacks each one, and the title guard was
mutation-tested: weakening it to honour declarations made the test fail,
which is the only evidence that it is testing anything.

**Still not fixed, deliberately: nothing on the corpus.**

The lexicon findings are the interesting half. These are engineering
essays *about* the rules: one is titled "A photograph cannot tell you the
calories", another argues about what counts as a safeguarding problem, a
third is about removing guilt from a streak. The lexicon exists so the
product never says "burn fat" to a member, and no regular expression
separates *using* a term from *framing somebody with* it.

The rest is ordinary and would be a morning's editing: titles that do not
contain their target phrase, descriptions outside the 110–158 window, two
internal links where four is the floor, and ledes that do not name the
phrase they answer.

Not fixed here on purpose. Closing it means either rewriting eight
human-reviewed articles or widening the exemptions on a safety control,
and both are the owner's call rather than a passing test's. The new FAQ
pairs *are* held to the lexicon and pass it — two answers were reworded
during this work rather than the list being touched.

**The public site was audited for claims, and three were not true.**

*The status page was fiction.* Twelve services with hardcoded `state`
values, each carrying a thirty-day history built from `up(30)` with
invented `degraded` days, under a heading reading "Live availability for
every part of the platform" — and three incident write-ups with dates,
resolution times and detail ("Partner has acknowledged; we will update
daily") describing events that had never happened. A status page is the
page somebody opens when deciding whether to rely on this, and again
during an outage; invented uptime there is worse than no page, because a
missing page tells you nothing and a false one tells you something wrong
with confidence. It now checks `/api/health` per request and reports
three things it can see, lists what is built but unmonitored as
*unknown*, names what is in build, and says plainly that there is no
incident history yet. `/api/health` gained a real database check — it
connects rather than reading a flag, because a green tick sourced from
configuration is the same failure in a smaller box.

*The wearables table offered seven integrations, none connectable.*
Columns for scopes, transport, privacy and lag, and no column for
availability. Two need an app that is in neither store, three need OAuth
credentials nobody has provisioned, one is a partner programme, and
Samsung Health has no client code at all. The API agreed with the page —
`connectionInfo` returned `ready: true` for on-device providers, which
was true about the server and false about the world. `MOBILE_APP_RELEASED`
is now the single fact both read, and flipping it on store-release day
corrects the API, the table and the copy together.

*An unmeasured business figure sat on the B2B page.* "This week — 68% of
enrolled employees completed at least one movement break", unlabelled. No
organisation has run a cohort. A buyer would have carried it into a
procurement document. Now marked as illustrative.

Checked and found honest: `/communications` (the `wired` flag is real and
SMS and WhatsApp are false), the homepage completion chart (the Jess Move
bar is explicitly an outline because it has not been measured), and the
absence of any store link or testimonial anywhere.

Still worth a human eye: the homepage cites 11% and 4% for generic
reminder apps as "Measured" with no source named. It is a claim about
other products rather than this one, and no citation could be added from
an environment that cannot reach the research.

**Settled, on the owner's instruction.** The two below were held back as
money decisions and have now been made.

*The free tier.* `LENS` was `frontier_llm`, so a FoodLens photograph cost
25 ACU and a 50-ACU free month bought two of them. `LENS` is now
`mid_tier_llm` (5 ACU a photograph on the default provider) and
`FREE_TIER.acusPerMonth` is 150. A free month is thirty analyses and
premium is 119. The 4x protection multiple is untouched and holds at
every model, so no margin moved; the real provider cost of a whole free
trial is £0.75. The pinned test now asserts what the allowance *buys*,
because pinning the number is how this broke silently the first time.

*The calendar.* Built as an on-device import rather than a server-side
OAuth integration. Google Calendar OAuth would have added a third vendor
and, more importantly, would have made "your calendar titles never leave
your device" false — the sentence the landing page and the whole
/industries argument rest on. `.ics` is parsed in the browser; the parser
never reads SUMMARY, DESCRIPTION, LOCATION, ATTENDEE or ORGANIZER, which
is asserted against its own source. Known limits, stated rather than
discovered: `RRULE` is expanded for weekly and daily only, and a named
`TZID` is treated as local time.

*What the free tier no longer hides:* `FREE_TIER` is 50 ACU a
month for two months. Measured against the real rates now in
`ai-costs.ts`, one FoodLens photograph (2,600 in / 500 out) costs 25 ACU
on `claude-opus-5` — which is what `LENS` asks for, since its
`modelClass` is `frontier_llm` and `AI_DEFAULT_PROVIDER` is anthropic.
**A free trial is two photographs.** On `claude-sonnet-5` it is ten; on
`gemini-2.5-flash`, fifty. Premium at £5.99 buys 23 opus photographs a
month against a product that invites one per meal.

Three levers, none of which an engineer should pull alone: change
`LENS.modelClass` to `mid_tier_llm` (a quality decision), change
`AI_DEFAULT_PROVIDER` (same), or raise `FREE_TIER.acusPerMonth` (a CAC
decision — 500 ACU a month costs about £1.25 of real provider spend per
free signup). The 4× protection holds at every model, so none of them
touches margin. Nothing has been changed here.

**The native application is written and has never been compiled.**
`apps/mobile` is a Capacitor shell — not a React Native rewrite, because
the web app is thirty routes and a 7,500-line design system and a second
implementation would be a second product to keep correct. The contract
(`packages/shared/src/native.ts`) and the seam
(`apps/frontend/app/native.ts`) are tested and shipped; the plugin's
TypeScript typechecks. **The Swift file and the four Kotlin files have
never been through a compiler** — there is no macOS, no Xcode and no
Android SDK on the machine they were written on, only Java and Gradle.
Treat the first `xcodebuild` and the first Gradle build as the first real
check of them. Neither app has been run on a device.
`apps/mobile/README.md` carries the build runbook, the required
Info.plist strings and manifest permissions, and the two things most
likely to cause a store rejection.

**Android motion is now written, and is shaped by the platform rather
than by preference.** Android has no synchronous "what is happening now"
call: activity recognition is a subscription over a `PendingIntent`, so
`MotionSubscription` registers, `ActivityTransitionReceiver` receives and
`MotionStore` holds the last arrival across a process death.
`readMotion` reads that store. Three rules carry the risk, and only the
last is testable here:

- an ENTER is stored and an EXIT clears, because "stopped driving" does
  not say what replaced it;
- `FLAG_MUTABLE` is required on the `PendingIntent` from Android 12, and
  its absence fails silently as permanent `unknown`;
- a transition-reported state is judged on `continuingSince` rather than
  on the three-minute sample window — the event is old while the state is
  current — with `MAX_CONTINUING_STATE_MINUTES` (six hours) as the
  ceiling. That constant lives in `packages/shared/src/native.ts` and is
  tested precisely because the Kotlin producing it cannot be.

The safety argument for six hours: `ContextService` blocks on `driving`
and `cycling` only, so a stale blocking state over-blocks (silence, the
safe direction) and a stale permissive state fails exactly as `unknown`
already fails. Staleness here can cost a block that would have been
missed anyway; it cannot cause a wrong one.

Also fixed on that path: `requestPermissionForAlias("motion", …)` had no
`Permission` declaration and no `@PermissionCallback`, so the request
would have thrown rather than prompted and the JavaScript promise would
never have settled. Both are now present.

**The iOS side, and five ways it would not have worked.** The Swift was
conventional and wrong in ways a compiler would not have caught, so the
checks are structural — `native-bridge.test.ts` reads the two platform
files:

- **`CAPBridgedPlugin` was missing.** Capacitor 6 replaced the
  Objective-C `CAP_PLUGIN` macro with that protocol. Without it the app
  compiles, links, installs, runs — and the bridge sees no methods, so
  every call fails as "not implemented". Nothing on iOS worked.
- **`capabilities.health` was permanently false.**
  `authorizationStatus(for:)` reports *share* authorisation and this app
  requests `toShare: nil`, so it could never return `.sharingAuthorized`.
  Now derived from `getRequestStatusForAuthorization`, which answers the
  only question HealthKit will answer — whether the sheet has been shown.
  It cannot report whether a read was granted, by design, so the honest
  meaning is "asked", and a read returning nothing is the safe failure.
- **iOS motion had the bug Android was just fixed for.**
  `CMMotionActivity.startDate` is when a state began — hours ago for
  anybody at a desk — and it was being sent as `observedAt`, so every
  reading older than three minutes failed the staleness window. The
  product's core user always read `unknown`. iOS now answers in the
  Android shape: `observedAt` now, `continuingSince` the start, and a
  six-hour query window because CoreMotion returns activities that
  *started* inside the range.
- **The permission sheet contradicted the public disclosure.** The Swift
  asked for six HealthKit categories;
  `PROVIDER_DEFINITIONS.apple_health.requests` publishes four, and
  `judgeSample` refuses the other two on arrival. `NATIVE_HEALTH_SCOPES`
  is now the one source, `toIngestBatch` refuses a scope the provider is
  not declared to request, and the test reads both platform files to check
  they match. Android had the mirror fault: it requested Health Connect's
  `HeartRateRecord` — the beat-to-beat series `NEVER_INGESTED` says nobody
  asks for — and never read `workouts` at all. Now
  `RestingHeartRateRecord` and `ExerciseSessionRecord`.
- **Sleep counted awake time as sleep** and double-counted a watch and a
  phone recording the same night — fourteen hours for a seven-hour night,
  feeding a readiness score. Both platforms now exclude `awake` and merge
  overlapping intervals.

**Two things made every grant useless, on both platforms.** The device
calendar had no request path anywhere, so `capabilities.calendar` could
never be true, so the button offering it was never rendered — a built,
shipped, unreachable feature. And `installHost` resolved capabilities
once at start-up, so a member who granted HealthKit got `true` from the
prompt and found reads still refused until the next cold start. The cache
now refreshes after any request and on return to the foreground.
`requestHealthAccess` and `requestMotionAccess` also no longer race a
4-second timeout against a human reading a permission sheet — a false
refusal looks like a considered answer.

**The bridge was never installed, and would have shipped that way.**
`capacitor.config.ts` sets `server.url` to the deployed site, so the
webview loads www.jessmove.com and no JavaScript from `apps/mobile` is
ever fetched. `installHost()` — written to publish `window.JessMoveNative`,
which `app/native.ts` then looked for — was exported and called from
nowhere, and could not have been called anywhere. Health, calendar,
motion and push registration would every one have returned exactly what a
browser returns, in the app built to provide them, with every test in
this repository passing and nothing failing loudly.

What makes it work was already there: `JSExport.getPluginJS` on Android
and a `WKUserScript` at document start on iOS both inject
`window.Capacitor.Plugins.JessMoveNative` into whatever page the webview
loads, one function per declared method, before the site's first line
runs. So `app/native.ts` reads that global — a global, not an import, so
the web build still has no Capacitor dependency — and `<NativeBridge />`
in the root layout is the thing on the site that asks. The dead plugin
bundle (`index.ts`, `web.ts`) is deleted; `definitions.ts` stays as the
contract the structural tests read.

Proven here: in a browser, `window.Capacitor` is undefined and every
caller behaves as before. Against a faithful simulation of what Capacitor
injects — the exact shape `getPluginJS` generates — the effect runs,
`capabilities()` is called across the bridge, the answer validates through
`usableCapabilities`, and the push tap listener is wired. That is not a
device, and it is the closest this environment can get.

**Notifications reach the installed app, which they could not before.**
Web Push was finished and correct — RFC 8291 against the spec's own test
vector, a real VAPID signature, a service worker, a scheduler — and
reached only browsers. A Capacitor webview has no `PushManager`, so
`account-panel.tsx` checked for one, found nothing, and told members
notifications were unsupported inside the application built to deliver
them.

- Migration 0031 adds `device_push_tokens`, a separate table rather than
  a nullable half of `push_subscriptions`, because the two are not the
  same guarantee: Web Push encrypts to the device and the service relays
  bytes it cannot read; APNs and FCM can read the alert. That is why the
  body stays a movement name and a duration, and why nothing about a
  health reading, a symptom, a measurement or a wallet balance goes
  through either.
- `apns.logic.ts` and `fcm.logic.ts` are the senders, without an SDK, on
  the same rule as the Stripe client and Web Push. iOS goes to Apple
  directly — Apple publishes the endpoint, and routing it through
  Firebase would put a vendor in the path for no capability. Android has
  no alternative to FCM, which is already approved.
- `PushService` stays the only door. The scheduler, account deletion and
  the admin test call one method and the fan-out happens behind it.

Three things would each have made it deliver nothing. The scheduler
aborted every run on `push.configured()`, which names the VAPID keys
alone — a deployment with APNs and FCM but no VAPID would have skipped
every member and reported "push is not configured". The candidate query
joined `push_subscriptions` for a time-zone offset, so a member whose
only device was the app had none, was dropped by the join, and was never
considered — native delivery would have addressed nobody. And that join
multiplied windows by devices; the offset is now reduced per member
before it.

**Caught by this repository's own guard, and it was a real hole.**
`admin-guard.test.ts` failed on `/push/device` taking a `userId` with
nothing checking it — anyone could have bound a device to another
member's account and received their prompts. Now `@SelfOnly` and a
required id. It is not the same case as `/push/subscribe`, which is
deliberately open: a Web Push endpoint is itself the capability, issued
by the browser, while a device token is bound to a member by the claim
alone. Proven: an unauthenticated registration is refused 401 and writes
no row.

Also fixed on the way through: `subscriptionsFor` never selected
`utc_offset_minutes` although `StoredSubscription` declared it, so every
subscription it returned looked offset-less; and the service worker had
no `tag`, so two Snaps stacked instead of the later replacing the
earlier — which matters because the earlier one describes a window that
has closed. Both native transports collapse on the same key.

Proven here, against real Postgres: registration through the guarded
endpoint, an app-only member becoming a scheduler candidate, the fan-out
running, and the failure naming the actual cause — "1 app device(s)
registered and none could be reached: apns not configured". Unproven:
any actual delivery. There is no Apple key, no Google service account and
no device in this environment, so what is asserted is everything decided
before the request leaves — signatures verify against their own keys, the
claims are what Apple and Google require, and every response code maps to
the right action. Getting the last of those wrong has the longest tail: a
dead token treated as retryable means pushing at an uninstalled app
forever, and a live one treated as dead unsubscribes a member who did
nothing.

Unproven until a device runs it: that a notification arrives on a locked
phone and its tap opens `/account`; that a real drive produces `driving`;
that force-stopping the app and reopening it re-subscribes rather than
answering with a state frozen at the force-stop; that the HealthKit sheet
lists four categories; and that granting in system settings and returning
works without a reload.

**The old note, kept because it is still the shape of the gap.** `apps/`
was `backend` and `frontend`.
That forecloses background motion sensing, on-device calendar access,
HealthKit, Health Connect, and reliable iOS notification delivery for
anyone who has not added the PWA to their home screen — and `/wearables`
names Apple Health and Health Connect. Declared movement windows are the
honest substitute for a scheduling signal; they are not a substitute for
the health integrations the page claims.

**SMS is catalogued and has no gateway.** `CHANNEL_DEFINITIONS.sms` said
`wired: true` on the strength of an env var nothing read, so
`resolveDelivery` was routing breach notifications and clinical red flags
to a channel that cannot carry them. It is now `wired: false` and drops
with a reason. Connecting a gateway is a new vendor decision.

**Two documents disagree about where the API runs.**
`docs/BACKEND-RUNBOOK.md` §5 deploys it to Vercel as a second project;
`docs/DEPLOY.md` §3 deploys it to Google Cloud Run. Only one is true, and
it decides which dashboard `STRIPE_SECRET_KEY` and
`STRIPE_WEBHOOK_SECRET` belong in — a secret set in the wrong one is
invisible and refuses every webhook with a 400, which is a shape this
platform has already been in. Settled by
`curl -sI https://api.jessmove.com/api/health` and reading the headers;
then delete whichever section is wrong. Cannot be settled from this
environment, which the network policy refuses that host.

**Pricing is now stated, not hedged.** `/` and `/get-started` said
"indicative pricing, confirmed at launch" under a heading that read
"Published, not quoted". The hedge is gone and the page now stands
behind the figures in `packages/shared/src/core-concepts.ts` — the same
ones the Stripe checkout charges. Two things follow that a person, not a
test, has to settle: whether the consumer prices are VAT-inclusive as UK
price-display rules require, and whether the business is willing to be
held to £5.99 and £12.99. Reverting is one sentence if not.

**There is still no social proof anywhere on the site.** No testimonial,
no named customer, no logo, no photograph of a person, and no measured
outcome. This is recorded as a gap rather than filled: inventing any of
them on a health product would be worse than the gap. The 62% conversion
figure is the platform's target and is now drawn as one.


**One unreproduced backend test failure.** During the design pass a
recursive `pnpm test` reported `807 pass / 1 fail` with an
`ERR_ASSERTION`, and the failing subtest name was not captured before the
output scrolled. Five subsequent runs — two recursive, three of the
backend suite alone — were `808 pass / 0 fail`. It is recorded here
rather than dismissed: an intermittent assertion in a suite that talks to
Postgres is the shape a race has. If it reappears, capture the subtest
name before doing anything else.

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
