# Sales collateral

## `JESS-MOVE-for-organisations` — the corporate deck

Eleven slides for a first conversation with an employer, school, care
provider or council of any size. Built as a **design-partner pitch**, and
that framing is not a euphemism: there are no customers, no case studies
and no measured outcomes, so the deck contains no logos, no testimonials,
no "trusted by" and no return-on-investment figure presented as a result.

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
| 6 | What silences a prompt | `HARD_BLOCKS` in `packages/shared/src/context.ts` |
| 7 | What the cohort report returns | The fields of `OrganisationReport`, and nothing else |
| 8 | 32 controls, 21 enforced, 7 implemented, 4 open | `GET /api/assurance` |
| 9 | From £2, up to £5, minimum 10 seats | The `organisation` entry in `packages/shared/src/core-concepts.ts` |

### What the deck says is *not* built

Slide 7's right-hand column and slide 9's fourth term, stated as gaps
rather than features: a trend series against a baseline, sedentary-risk
distribution, a return-on-investment model, and single sign-on with
directory sync. Single sign-on is a contracted inclusion of the
organisation plan that does not exist in the code, so the slide says
"contracted, not yet built" instead of listing it alongside things that
ship. A buyer who finds that out in a technical review after signing is a
buyer lost; a buyer told on slide seven is a buyer who trusts slide eight.

If any of those four are built, move the line from the right column to the
left and update this table. Do not move it early.

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
