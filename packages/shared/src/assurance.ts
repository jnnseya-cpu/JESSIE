/**
 * The assurance summary — one document, three buyers.
 *
 * A school asking whether a twelve-year-old can be shown a weight, an NHS
 * team working through the Digital Technology Assessment Criteria, and a
 * regulator asking how AI involvement is disclosed are all asking versions
 * of the same question: what does this platform refuse to do, and how
 * would anybody know?
 *
 * Everything here is generated from things that are actually true of the
 * code rather than written as a claim. Where a control is enforced by a
 * test, the test is named. Where it is not, the entry says so — an
 * assurance document that overstates itself is worse than none, because
 * the first buyer who checks stops believing the rest of it.
 *
 * What this is NOT: a DTAC submission, a clinical safety case, or a
 * conformity assessment. Those are documents a named accountable person
 * signs. This is the evidence they would be assembled from, published so
 * that the assembling is a day rather than a quarter.
 */

export type AssuranceArea =
  | 'clinical_safety'
  | 'data_protection'
  | 'technical_assurance'
  | 'interoperability'
  | 'usability_accessibility'
  | 'safeguarding'
  | 'ai_transparency';

export interface AssuranceControl {
  readonly area: AssuranceArea;
  readonly claim: string;
  /** How it is enforced. Named files and tests, or an honest gap. */
  readonly evidence: string;
  /**
   * `enforced` — a test fails if it stops being true.
   * `implemented` — it is true of the code, without a test pinning it.
   * `gap` — it is not done, and this says what would be needed.
   */
  readonly status: 'enforced' | 'implemented' | 'gap';
}

export const ASSURANCE_AREAS: Readonly<Record<AssuranceArea, string>> = {
  clinical_safety: 'Clinical safety',
  data_protection: 'Data protection',
  technical_assurance: 'Technical assurance',
  interoperability: 'Interoperability',
  usability_accessibility: 'Usability and accessibility',
  safeguarding: 'Safeguarding and age assurance',
  ai_transparency: 'AI transparency',
};

export const ASSURANCE_CONTROLS: readonly AssuranceControl[] = [
  /* --- clinical safety --- */
  {
    area: 'clinical_safety',
    claim: 'No AI-written health copy reaches the public without a named human reviewer.',
    evidence:
      'The editorial status machine has no draft-to-published transition, publishing requires a named reviewer, and a test asserts the autopilot only ever transitions to in_review and never passes a reviewer argument.',
    status: 'enforced',
  },
  {
    area: 'clinical_safety',
    claim: 'Guidance for a declared condition never comments on medication.',
    evidence:
      'Every condition card carries a clinicianOnly section, and a test scans all cards for dose, timing and escalation language and fails on any match.',
    status: 'enforced',
  },
  {
    area: 'clinical_safety',
    claim:
      'General guidance is suppressed where a declared condition makes it wrong, rather than shown alongside it.',
    evidence:
      'The insight engine applies condition effects before building any card, and the suppressed reading is stated on the page rather than silently removed. Tested against pancreatic insufficiency, kidney disease and appetite-suppressing medication.',
    status: 'enforced',
  },
  {
    area: 'clinical_safety',
    claim: 'Strength and balance checks produce a starting level, never a falls risk score.',
    evidence:
      'The falls module returns a level and a prompt to seek assessment. There is no risk field to return, and the reasoning is documented in the module and the migration.',
    status: 'implemented',
  },
  {
    area: 'clinical_safety',
    claim: 'A DCB0129 hazard log covering the clinical risks this system introduces.',
    evidence:
      'Fourteen hazards with causes, effects, initial and residual ratings on the DCB0129 matrix, and controls that each name the mechanism enforcing them. Held as data rather than as a document so it cannot drift from the software, and published in full.',
    status: 'implemented',
  },
  {
    area: 'clinical_safety',
    claim: 'A Clinical Safety Officer whose appointment satisfies DCB0129.',
    evidence:
      'An officer has been appointed and is named in the hazard log. The appointment record is incomplete: DCB0129 requires the officer to be a suitably qualified and experienced clinician holding current professional registration with training in clinical risk management, and the registration body, registration number, training evidence and date of appointment have not been recorded. The log reports itself as not yet valid for submission until they are, and this platform will not assert a clinical registration on anybody’s behalf.',
    status: 'gap',
  },

  /* --- data protection --- */
  {
    area: 'data_protection',
    claim: 'Special-category data is opt-in, minimal, and deletable in one action.',
    evidence:
      'Declared conditions are stored as catalogue identifiers only — no severity, dates, medication or free text — with free text dropped rather than stored. One call deletes the row.',
    status: 'enforced',
  },
  {
    area: 'data_protection',
    claim: 'Deleting an account deletes everything derived from it.',
    evidence:
      'Foreign keys with ON DELETE CASCADE from app_users cover conditions, the food ledger, growth results and strength checks, so deletion is a database guarantee rather than a callback somebody has to remember.',
    status: 'enforced',
  },
  {
    area: 'data_protection',
    claim: 'Health data never reaches a household or organisation view, at any group size.',
    evidence:
      'Group reporting enforces a k-anonymity floor of 8, and a test asserts that no module outside the conditions service references the conditions table at all.',
    status: 'enforced',
  },
  {
    area: 'data_protection',
    claim: 'Analytics identifiers are not reversible and do not persist across days.',
    evidence:
      'Blog view tracking hashes the address and user agent on arrival with a salt regenerated daily; the raw values are never held in a variable that outlives the request.',
    status: 'implemented',
  },
  {
    area: 'data_protection',
    claim: 'Nothing clinical is written by the ordinary draft autosave.',
    evidence:
      'The autosave document check refuses any key or value containing clinical, diagnosis or consent, and conditions save only through their own endpoint.',
    status: 'enforced',
  },

  /* --- technical assurance --- */
  {
    area: 'technical_assurance',
    claim: 'The schema is versioned and applied automatically, and drift fails the build.',
    evidence:
      'Numbered migrations apply on start against a schema_migrations table, and a test fails if the embedded SQL differs from the files by a byte.',
    status: 'enforced',
  },
  {
    area: 'technical_assurance',
    claim: 'Payment events are processed exactly once under concurrent delivery.',
    evidence:
      'Webhooks are claimed before processing with an insert-on-conflict, released on failure, and verified against eight simultaneous deliveries of one event.',
    status: 'enforced',
  },
  {
    area: 'technical_assurance',
    claim: 'Every AI action is gated against an available allowance before any provider is called.',
    evidence:
      'The gateway holds the agent ceiling before the provider chain, settles to actual afterwards, and releases in full when nothing was delivered. A test walks every call site for an unbilled one.',
    status: 'enforced',
  },
  {
    area: 'technical_assurance',
    claim: 'The running deployment can be identified from a request.',
    evidence: 'The health endpoint reports the commit the build was stamped from.',
    status: 'implemented',
  },

  /* --- interoperability --- */
  {
    area: 'interoperability',
    claim: 'Contracts are published and machine-readable rather than described.',
    evidence:
      'Policy endpoints publish the editorial rules, the metering rule, the condition catalogue, the falls thresholds and this assurance summary as JSON.',
    status: 'implemented',
  },
  {
    area: 'interoperability',
    claim: 'A member can take their record with them.',
    evidence:
      'The food ledger, conditions, strength checks and growth results are all readable through the member’s own endpoints. There is no single one-click export archive yet.',
    status: 'gap',
  },
  {
    area: 'interoperability',
    claim: 'Structured data and a sitemap are served for the public estate.',
    evidence:
      'Article and breadcrumb JSON-LD, a generated sitemap and robots file from one registry, and an RSS feed with autodiscovery.',
    status: 'enforced',
  },

  /* --- usability and accessibility --- */
  {
    area: 'usability_accessibility',
    claim: 'The interface is six age-calibrated modes, not one interface with a font-size control.',
    evidence:
      'Explorer, Teen, Momentum, Balance, Independence and Vitality, spanning 10 to 100, each with its own register, density and permitted content.',
    status: 'enforced',
  },
  {
    area: 'usability_accessibility',
    claim: 'Every movement ships with variants, including seated and supported.',
    evidence:
      'Publishing a movement requires five variants; the falls programme starts from the seated level when nothing has been recorded.',
    status: 'enforced',
  },
  {
    area: 'usability_accessibility',
    claim: 'A formal WCAG 2.2 AA audit against the live product.',
    evidence:
      'Not done. Accessibility is designed for and tested in places, but there is no external audit and no VPAT.',
    status: 'gap',
  },

  /* --- safeguarding --- */
  {
    area: 'safeguarding',
    claim: 'No weight, BMI or energy figure can be rendered for an account under 18.',
    evidence:
      'Charter rule C6. The insight engine returns unavailable for any age under 18 before computing anything, conditions cannot be declared, the falls module refuses, and each is covered by a test.',
    status: 'enforced',
  },
  {
    area: 'safeguarding',
    claim: 'A minor account cannot be created without a guardian.',
    evidence:
      'Registration under 18 requires a guardian email and the account activates on confirmation.',
    status: 'enforced',
  },
  {
    area: 'safeguarding',
    claim: 'Copy aimed at a minor uses a stricter lexicon than the general one.',
    evidence:
      'The strict list adds body, shape, size, compete, beat and rank, and applies to editorial and to partner marketing alike.',
    status: 'enforced',
  },
  {
    area: 'safeguarding',
    claim: 'Age is self-declared at registration.',
    evidence:
      'Honest gap. Ofcom’s 2026 position is that self-declaration is not highly effective age assurance. The platform’s protections are strongest exactly where a wrong age would matter, but the declaration itself is unverified and a buyer should be told so plainly.',
    status: 'gap',
  },

  {
    area: 'technical_assurance',
    claim: 'Every door that can act without a session is bounded, and the limits are published.',
    evidence:
      'Registration, login, password reset, account deletion and guardian confirmation each carry a signed form token that must be old enough to have been read, a field only a script fills in, and a sliding attempt window sized to the door. The numbers and the reason for each are published rather than described. This is not proof that anybody is human, and the platform says so in those words rather than implying otherwise.',
    status: 'enforced',
  },
  {
    area: 'technical_assurance',
    claim: 'Text arriving from outside cannot instruct the platform.',
    evidence:
      'Member and partner text is fenced as data before any model call, with a boundary marker generated per call that the text cannot have contained, and text shaped like a command to the system is refused before a provider is reached or an allowance is touched. Nine detectors, six of which refuse on their own; the rest need corroboration because a single ambiguous match is more often a person than an attack. A test corpus of ordinary questions asserts that none of them is refused or even logged.',
    status: 'enforced',
  },

  /* --- AI transparency --- */
  {
    area: 'ai_transparency',
    claim: 'AI involvement is disclosed wherever it produced something a person reads.',
    evidence:
      'Agent-drafted articles are marked, partner marketing carries a disclosure naming the partner as the publisher, and the coach states when it is answering live.',
    status: 'implemented',
  },
  {
    area: 'ai_transparency',
    claim: 'What the AI will not do is published rather than implied.',
    evidence:
      'Every AI surface publishes its own refusals — the coach, FoodLens, the editorial autopilot, the growth engine and the metering rule all expose a neverDoes list.',
    status: 'implemented',
  },
  {
    area: 'ai_transparency',
    claim: 'No AI decides who gets access to anything.',
    evidence:
      'Every block on this platform comes from a deterministic rule a person can read, and every limit is a window that expires on its own. The security agent reads the queue of things already blocked and writes an explanation for a reviewer; it has no power to block, ban or unblock, it is metered against the platform’s own allowance, and a test walks its source for any call that would change access.',
    status: 'enforced',
  },
  {
    area: 'ai_transparency',
    claim: 'Model decisions are logged with input hashes rather than inputs.',
    evidence:
      'The gateway redacts named field classes before any external call and logs a trace identifier, provider, model and cost — never the prompt.',
    status: 'enforced',
  },
  {
    area: 'ai_transparency',
    claim: 'Generated figures state their basis, and unmeasured values are never shown as zero.',
    evidence:
      'FoodLens returns energy as a range and marks each nutrient label, calculated, estimate, reference or unmeasured. Independent testing published in 2026 found leading photo apps underestimate meal energy substantially; this is the control that addresses it.',
    status: 'enforced',
  },
];

export interface AreaSummary {
  readonly area: AssuranceArea;
  readonly label: string;
  readonly enforced: number;
  readonly implemented: number;
  readonly gaps: number;
  readonly controls: readonly AssuranceControl[];
}

export function assuranceByArea(): readonly AreaSummary[] {
  return (Object.keys(ASSURANCE_AREAS) as AssuranceArea[]).map((area) => {
    const controls = ASSURANCE_CONTROLS.filter((c) => c.area === area);
    return {
      area,
      label: ASSURANCE_AREAS[area],
      enforced: controls.filter((c) => c.status === 'enforced').length,
      implemented: controls.filter((c) => c.status === 'implemented').length,
      gaps: controls.filter((c) => c.status === 'gap').length,
      controls,
    };
  });
}

/** Every honest gap, collected — the list a buyer should be handed first. */
export function assuranceGaps(): readonly AssuranceControl[] {
  return ASSURANCE_CONTROLS.filter((c) => c.status === 'gap');
}

export const ASSURANCE_PREAMBLE =
  'This is not a DTAC submission, a clinical safety case or a conformity assessment — those are ' +
  'documents a named accountable person signs. It is the evidence they would be assembled from, ' +
  'published so that a buyer can check rather than take on trust. Controls marked enforced fail ' +
  'the build if they stop being true. Controls marked as a gap are things this platform does not ' +
  'do, listed here rather than left for somebody to discover.';
