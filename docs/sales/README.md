# Sales collateral

## `JESS-MOVE-for-organisations` — the corporate deck

Twelve slides for a first conversation with a company — from a ten-seat
team to a corporate payroll. Built as a **design-partner pitch**, and
that framing is not a euphemism: there are no customers, no case studies
and no measured outcomes, so the deck contains no logos, no testimonials,
no "trusted by" and no return-on-investment figure presented as a result.

The audience is an employer, so the deck talks about a workforce rather
than about ages 10 to 100. The full age range still matters and appears
on slide 5, framed the way it lands with a corporate buyer: four of the
six bands are working age, and 40–64 is the band most step-count
programmes quietly design past.

Every number in it is a property of the product, read out of this
repository, and every endpoint on the verification slide was called
against a running instance of this build before it went on the slide.

### The arc, and why it is in this order

An earlier cut opened on "no customers yet" and held the strongest
argument until slide four. That is an audit, not a pitch. Honesty does
not require leading with your weakness, so:

| # | Slide | Job it does |
| --- | --- | --- |
| 1 | Can't spy. Can't nag. Can't exclude. | Three enforced constraints, not three features |
| 2 | Can my employer see what I did today? → **No.** | The one claim no competitor can make, made early |
| 3 | You have bought this before. | Three failure modes; they recognise their last purchase |
| 4 | It knows when to say nothing. | Why engagement does not decay |
| 5 | Five variants, or it does not ship. | Nobody is excluded, and the working-age bands |
| 6 | Enough to run a programme. Not enough to manage a person. | What they get, and what is not built |
| 7 | Don't trust us. Call the API. | Four endpoints, live, in the meeting |
| 8 | Four things enforced. Four things open. | Legal, HR and security, answered before they ask |
| 9 | You would be our first. | The confession, repositioned as the terms of a deal |
| 10 | From £2 per employee per month. | Commercials |
| 11 | One team. Twelve weeks. No procurement epic. | The ask, small enough to approve |
| 12 | Give us one team and twelve weeks. | Close on the ask, not the product |

Slide 9 is the pivot. Having no track record is stated as terms that get
worse for the buyer once there is one, which is both true and a reason to
sign this quarter. Selling it as scarcity rather than confessing it as a
weakness changes nothing about the facts on the slide.

### Every claim, and where it comes from

| Slide | Claim | Source |
| --- | --- | --- |
| 2, 6, 8 | The reporting floor is 8 people | `K_ANONYMITY_THRESHOLD` |
| 2 | No per-person field exists | `OrganisationReport` in `apps/backend/src/groups/groups.logic.ts` |
| 4 | What silences a prompt | `HARD_BLOCKS` in `packages/shared/src/context.ts` |
| 5 | Five variants, six age bands | `MOVEMENT_VARIANTS`, `AGE_MODES`, and the gate rule in `movements.controller.ts` |
| 5 | Variant names | `VARIANT_LABELS` — used verbatim, not paraphrased |
| 5 | The working-age bands and their prompt caps | `AGE_MODE_DEFINITIONS` — 18–39, 40–64, 65–79, plus teen |
| 6 | What the cohort report returns | The fields of `OrganisationReport`, and nothing else |
| 7 | 32 controls, 21 enforced, 7 implemented, 4 open | `GET /api/assurance` |
| 7 | 942 automated tests | `pnpm test` — 893 backend, 27 body-command, 22 foodlens |
| 8 | Four enforced data-protection controls | The `data_protection` area of `assuranceByArea()` |
| 8 | Four open gaps, named | `assuranceGaps()` — all four, verbatim, none omitted |
| 10 | From £2, up to £5, minimum 10 seats | The `organisation` entry in `packages/shared/src/core-concepts.ts` |

### What the deck says is *not* built

Three slides carry gaps, deliberately.

**Slide 6** — the analytics a workforce buyer expects and we do not have:
a trend series against a baseline, sedentary-risk distribution, a
return-on-investment model, and single sign-on. Framed as a design
partner's to prioritise, which is what they are.

**Slide 8** — the four items `assuranceGaps()` returns, unedited: no
external WCAG 2.2 AA audit and no VPAT, self-declared age, no one-click
export archive, and an incomplete DCB0129 appointment record. A
procurement team asks for a VPAT early; being handed the gap before they
ask is worth more than a slide claiming accessibility.

**Slide 10** — single sign-on and directory sync, a contracted inclusion
of the organisation plan that exists nowhere in the code. Labelled
"contracted, not yet built", and week zero of the pilot does not promise
it wired. A buyer who finds that out in a technical review after signing
is a buyer lost; a buyer told on slide ten is a buyer who believes slide
seven.

If any of these get built, move the line across in the deck and update
this table. Do not move it early.

### The one commercial term to keep consistent

The organisation plan's standing term is a **minimum annual contract**
(`core-concepts.ts`). The twelve-week exit on slides 9 and 11 is a
design-partner term for the pilot only. Left implicit those two read as a
contradiction, and the commercials slide is the one a procurement lawyer
reads twice — so slide 10 says "annual term once a pilot converts, not
before". If the pilot terms change, change all three slides together.

### Rebuilding it

Needs `pptxgenjs` and, for the PDF, LibreOffice with Impress
(`libreoffice-impress` — `libreoffice-core` alone cannot open a `.pptx`).

```sh
node docs/sales/organisations-deck.js            # writes the .pptx here
soffice --headless --convert-to pdf JESS-MOVE-for-organisations.pptx
```

Re-check the figures in the table above before sending a rebuilt deck to
anybody. A number that was true in September and is quoted in March is an
invented number with a provenance.
