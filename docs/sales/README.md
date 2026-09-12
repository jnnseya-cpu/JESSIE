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

| Slide | Claim | Where it comes from |
| --- | --- | --- |
| 2 | 942 automated tests | `pnpm test` — 893 backend, 27 body-command, 22 foodlens |
| 2, 4, 7 | The reporting floor is 8 people | `K_ANONYMITY_THRESHOLD` |
| 4 | No per-person field exists | `OrganisationReport` in `apps/backend/src/groups/groups.logic.ts` |
| 5 | Five variants, six age modes | `MOVEMENT_VARIANTS`, `AGE_MODES`, and the gate rule in `movements.controller.ts` |
| 5 | Variant names | `VARIANT_LABELS` — used verbatim, not paraphrased |
| 5 | The working-age bands and their prompt caps | `AGE_MODE_DEFINITIONS` — 18–39, 40–64, 65–79, plus teen |
| 6 | What silences a prompt | `HARD_BLOCKS` in `packages/shared/src/context.ts` |
| 7 | What the cohort report returns | The fields of `OrganisationReport`, and nothing else |
| 8 | 32 controls, 21 enforced, 7 implemented, 4 open | `GET /api/assurance` |
| 9 | Four enforced data-protection controls | The `data_protection` area of `assuranceByArea()` |
| 9 | Four open gaps, named | `assuranceGaps()` — all four, verbatim, none omitted |
| 10 | From £2, up to £5, minimum 10 seats | The `organisation` entry in `packages/shared/src/core-concepts.ts` |

### What the deck says is *not* built

Three slides carry gaps, deliberately.

**Slide 7** — the analytics a workforce buyer expects and we do not have:
a trend series against a baseline, sedentary-risk distribution, and a
return-on-investment model. The cohort report returns a size, a
participation percentage, an active count, a median and a suppression
flag, and nothing else.

**Slide 9** — the four items `assuranceGaps()` returns, unedited: no
external WCAG 2.2 AA audit and no VPAT, self-declared age, no one-click
export archive, and an incomplete DCB0129 appointment record. A
procurement team asks for a VPAT early; being handed the gap before they
ask is worth more than a slide claiming accessibility.

**Slide 10** — single sign-on and directory sync, a contracted inclusion
of the organisation plan that exists nowhere in the code. It is labelled
"contracted, not yet built", and week zero of the pilot no longer
promises it wired. A buyer who finds that out in a technical review after
signing is a buyer lost; a buyer told on slide ten is a buyer who
believes slide eight.

If any of these get built, move the line across in the deck and update
this table. Do not move it early.

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
