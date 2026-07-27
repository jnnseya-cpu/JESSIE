/**
 * The core concepts. Everything in MOVEQUEST is built around, for and to
 * achieve what is described here.
 *
 * The product is not a fitness reminder. It is a Movement Operating System
 * that continuously identifies safe, realistic opportunities to move across
 * work, school, home, travel and later life — without requiring anyone to
 * "work out".
 *
 * UK guidance is explicit that meeting a weekly exercise target does not
 * cancel the risk of spending the rest of the day sitting. That gap is the
 * product. Every claim in this file that touches population health must be
 * sourced and dated in the Clinical Evidence Register before it appears in
 * a commercial surface.
 */

/* ============================================================
   1 — The promise
   ============================================================ */

export const PROMISE = 'Move more without reorganising your life.' as const;

export const POSITIONING: string =
  'A context-aware AI operating system that discovers the smallest realistic ' +
  'opportunity to move and turns it into an engaging, inclusive and measurable ' +
  'daily action.';

/** What the OS is not. Kept in code because positioning drifts under sales pressure. */
export const NOT = [
  'a step counter',
  'a generic reminder app',
  'a gym application',
  'a calorie tracker',
  'a workout-video library',
  'a corporate leaderboard',
  'a medical diagnosis platform',
] as const;

/** The nine questions the engine answers before it says anything at all. */
export const NINE_QUESTIONS = [
  'When were they last active?',
  'What are they doing right now?',
  'Where are they?',
  'What physical capability do they have?',
  'How much time is genuinely available?',
  'Is movement safe and socially appropriate here?',
  'Which activity is most likely to be completed?',
  'What level of encouragement will actually work?',
  'When should we not interrupt at all?',
] as const;

/** Concrete moments the OS converts. Used verbatim in marketing copy. */
export const RECLAIMED_MOMENTS = [
  'two minutes before a meeting',
  'three minutes after a lesson',
  'a movement break during the adverts',
  'mobility while the kettle boils',
  'seated movement on a train',
  'balance practice at the kitchen counter',
  'family movement games after dinner',
  'recovery after a long stretch at a screen',
] as const;

/* ============================================================
   2 — The Movement Opportunity Engine
   ============================================================ */

/**
 * Opportunity Score =
 *   availableTime × sedentaryDuration × readiness × environmentalSuitability
 *   × safetyConfidence × completionProbability × personalBenefit
 *   − interruptionCost − socialAwkwardnessRisk − fatigueRisk
 *
 * A prompt fires only when the score clears the threshold. Every factor is
 * normalised to 0–1 so the multiplicative half cannot be gamed by one large
 * input, and safety sits in the multiplied half so a zero there is fatal
 * regardless of how attractive the rest of the moment looks.
 */
export interface OpportunityInput {
  readonly availableTime: number;
  readonly sedentaryDuration: number;
  readonly readiness: number;
  readonly environmentalSuitability: number;
  readonly safetyConfidence: number;
  readonly completionProbability: number;
  readonly personalBenefit: number;
  readonly interruptionCost: number;
  readonly socialAwkwardnessRisk: number;
  readonly fatigueRisk: number;
}

export const OPPORTUNITY_MULTIPLIERS = [
  'availableTime',
  'sedentaryDuration',
  'readiness',
  'environmentalSuitability',
  'safetyConfidence',
  'completionProbability',
  'personalBenefit',
] as const;

export const OPPORTUNITY_PENALTIES = [
  'interruptionCost',
  'socialAwkwardnessRisk',
  'fatigueRisk',
] as const;

/** Below this, the OS stays silent. Silence is a valid, logged outcome. */
export const OPPORTUNITY_THRESHOLD = 0.34;

export function opportunityScore(input: OpportunityInput): number {
  for (const key of [...OPPORTUNITY_MULTIPLIERS, ...OPPORTUNITY_PENALTIES]) {
    const v = input[key];
    if (!Number.isFinite(v) || v < 0 || v > 1) {
      throw new RangeError(`${key} must be normalised to 0–1`);
    }
  }
  const gain = OPPORTUNITY_MULTIPLIERS.reduce((acc, k) => acc * input[k], 1);
  const cost =
    OPPORTUNITY_PENALTIES.reduce((acc, k) => acc + input[k], 0) / OPPORTUNITY_PENALTIES.length;
  return Number(Math.max(0, gain - cost).toFixed(4));
}

export function shouldPrompt(input: OpportunityInput): boolean {
  return opportunityScore(input) >= OPPORTUNITY_THRESHOLD;
}

/** Contexts the engine must recognise before it can judge suitability. §3. */
export const CONTEXT_CATEGORIES = [
  'office_desk',
  'home_office',
  'classroom',
  'library',
  'kitchen',
  'bedroom',
  'living_room',
  'train',
  'bus',
  'airport',
  'parked_vehicle',
  'care_home',
  'hospital_waiting_area',
  'hotel',
  'outdoors',
  'public_environment',
  'private_environment',
] as const;
export type ContextCategory = (typeof CONTEXT_CATEGORIES)[number];

/* ============================================================
   3 — The agent ecosystem
   ============================================================ */

export interface ConceptAgent {
  readonly n: number;
  readonly name: string;
  readonly role: string;
  readonly does: readonly string[];
}

/**
 * The twelve conceptual agents. The runtime registry in `agents.ts`
 * decomposes these into twenty-six deployable services with their own tool
 * allow-lists and cost ceilings; this list is the shape of the system as a
 * person should understand it.
 */
export const CONCEPT_AGENTS: readonly ConceptAgent[] = [
  {
    n: 1,
    name: 'Daily Rhythm',
    role: 'Builds a living model of the day',
    does: [
      'Analyses calendar patterns and recurring sedentary periods',
      'Separates work, study, travel and personal time',
      'Predicts suitable windows and protects focus blocks',
    ],
  },
  {
    n: 2,
    name: 'Micro-Movement Coach',
    role: 'Selects the single most suitable activity',
    does: [
      'Weighs age, capability, clothing, equipment and joint limitations',
      'Respects noise, privacy and available space',
      'Avoids anything completed too recently',
    ],
  },
  {
    n: 3,
    name: 'Sedentary Pattern Detector',
    role: 'Finds inactivity trends, not just timer expiry',
    does: [
      'Long uninterrupted sitting and back-to-back meetings',
      'Extended gaming, television and revision marathons',
      'Recurring afternoon and weekend inactivity',
    ],
  },
  {
    n: 4,
    name: 'Behaviour & Motivation',
    role: 'Learns why a person accepts, ignores or abandons a prompt',
    does: [
      'Builds a motivational profile from real responses',
      'Adjusts wording, timing, frequency and reward mechanics',
      'Distinguishes encouragement-sensitive from low-pressure users',
    ],
  },
  {
    n: 5,
    name: 'Movement Safety',
    role: 'Screens every activity before it reaches a person',
    does: [
      'Age, mobility profile, restrictions, pregnancy and balance risk',
      'Environmental hazards, recent pain reports and repeated strain',
      'Can only narrow a recommendation, never widen it',
    ],
  },
  {
    n: 6,
    name: 'Accessibility',
    role: 'Transforms the experience to the individual',
    does: [
      'Seated, single-limb and reduced-range alternatives',
      'Audio description, captions, BSL-compatible pathways, screen readers',
      'Tremor-friendly targets, reduced animation, voice-only navigation',
    ],
  },
  {
    n: 7,
    name: 'Gamification Director',
    role: 'Generates missions, rewards and challenges',
    does: [
      'Prevents repetition and detects reward fatigue',
      'Balances individual against team goals',
      'Protects users from unhealthy competition',
    ],
  },
  {
    n: 8,
    name: 'Recovery & Fatigue',
    role: 'Stops the platform becoming intrusive',
    does: [
      'Lowers intensity after poor sleep; swaps strength for mobility',
      'Pauses prompts during illness and activates Low Energy Day',
      'Actively prevents overtraining behaviour',
    ],
  },
  {
    n: 9,
    name: 'Team Challenge',
    role: 'Builds inclusive group competition',
    does: [
      'Workplaces, schools, families, care communities, councils',
      'Scores participation rather than physical capability',
      'Keeps the strongest athlete from dominating every event',
    ],
  },
  {
    n: 10,
    name: 'Corporate Wellbeing',
    role: 'Produces anonymised organisational insight',
    does: [
      'Departments with long meeting blocks; low-participation periods',
      'Office versus remote engagement and campaign performance',
      'Structurally cannot expose an individual',
    ],
  },
  {
    n: 11,
    name: 'Family Wellbeing',
    role: 'Connects generations through shared activity',
    does: [
      'Grandparent and grandchild streaks',
      'Household missions and weekend expeditions',
      'Remote family celebration',
    ],
  },
  {
    n: 12,
    name: 'Engagement Rescue',
    role: 'Detects disengagement before abandonment',
    does: [
      'Reduces frequency, changes activity style, offers a fresh world',
      'Replaces streaks with weekly flexibility',
      'Offers a seven-day restart rather than a guilt message',
    ],
  },
];

/* ============================================================
   4 — Movement and gamification
   ============================================================ */

/**
 * The user-facing kinds of movement a prompt can offer. Distinct from
 * MOVEMENT_CATEGORIES in `effort.ts`, which is the scoring taxonomy that
 * carries the Effort Equivalence weights.
 */
export const MOVEMENT_KINDS = [
  'mobility',
  'balance',
  'strength',
  'light_cardio',
  'coordination',
  'posture_reset',
  'eye_and_screen_recovery',
  'breathing_with_movement',
  'seated_movement',
  'wheelchair_movement',
  'family_movement',
  'workplace_safe_movement',
] as const;
export type MovementKind = (typeof MOVEMENT_KINDS)[number];

/** Every completed Snap improves the world the user chose. §5.5. */
export const GAME_WORLDS = [
  'Space Explorer',
  'Kingdom Builder',
  'Wildlife Protector',
  'Global Traveller',
  'City Rebuilder',
  'Garden of Movement',
  'Ocean Adventure',
  'Future Athlete',
  'Gentle Vitality Journey',
] as const;

export const REWARD_ASSETS = [
  'MovePoints',
  'Energy Crystals',
  'Streak Shields',
  'Level Stars',
  'Team Power',
  'World-building materials',
  'Character accessories',
  'Digital trophies',
  'Partner rewards',
  'Charity contribution tokens',
  'Family celebration cards',
] as const;

/** What earns points. §5.3. */
export const POINTS_REWARD = [
  'starting',
  'completing',
  'returning after a lapse',
  'supporting a teammate',
  'trying a new movement category',
  'consistency',
  'completing an accessible alternative',
  'moving during a previously inactive period',
] as const;

/** What must never drive points. Asserted in the Charter test. §5.3. */
export const POINTS_NEVER = [
  'calories',
  'body weight',
  'physical appearance',
  'maximum intensity',
  'comparison of medical or biometric information',
] as const;

/*
 * Team scoring lives in `challenges.ts`, which owns the weights, the
 * contribution ceiling and the capability guard. It is not duplicated here.
 */

/** The nine-step loop the whole product runs on. §5.1. */
export const GAME_LOOP = [
  'Detect an appropriate movement opportunity',
  'Offer a personalised 90–300 second mission',
  'Accept, delay, replace or decline',
  'Complete the activity',
  'Verify by wearable, device motion or confirmation',
  'Earn progress',
  'The world changes',
  'The engine learns from the interaction',
  'The next mission is more accurate',
] as const;

/* ============================================================
   5 — Onboarding
   ============================================================ */

export const ACCOUNT_TYPES = [
  'individual',
  'child_with_parent',
  'family',
  'employee',
  'student',
  'older_adult',
  'supported_user',
  'carer_managed',
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ONBOARDING_STEPS = [
  {
    n: 1,
    title: 'Account type',
    detail: 'Individual, child with parent, family, employee, student, supported or carer-managed.',
  },
  {
    n: 2,
    title: 'Movement readiness',
    detail:
      'A non-diagnostic questionnaire: confidence, balance, accessibility needs, restrictions, ' +
      'seated versus standing preference, coaching style.',
  },
  {
    n: 3,
    title: 'Daily context',
    detail:
      'Work or school schedule, commute, wake and sleep windows, home-working days, ' +
      'meeting-heavy days, times that are never suitable.',
  },
  {
    n: 4,
    title: 'Integrations',
    detail: 'Optional, granular and individually revocable. Nothing is required to start.',
  },
  {
    n: 5,
    title: 'First plan',
    detail:
      'A seven-day starter programme with a hard daily prompt cap, preferred windows, ' +
      'a safe starting intensity, a game world and rest logic.',
  },
] as const;

export const INTEGRATIONS = [
  'Google Calendar',
  'Microsoft Outlook',
  'Apple Calendar',
  'Apple Health',
  'Google Health Connect',
  'Fitbit',
  'Garmin',
  'Samsung Health',
  'Oura',
  'Polar',
  'Workplace identity provider',
  'School timetable systems',
] as const;

/* ============================================================
   6 — Markets
   ============================================================ */

export interface Industry {
  readonly slug: string;
  readonly name: string;
  readonly lede: string;
  readonly capabilities: readonly string[];
  readonly boundary: string;
}

export const INDUSTRIES: readonly Industry[] = [
  {
    slug: 'workplaces',
    name: 'Workplaces',
    lede:
      'Hybrid and remote teams are the first commercial entry point: a clear sedentary problem, ' +
      'measurable participation and no safeguarding complexity on day one.',
    capabilities: [
      'SSO, department structure and employee invitation',
      'Challenge builder and a wellbeing campaign calendar',
      'Aggregate participation, office versus remote engagement',
      'Meeting-culture insight — which blocks never leave a gap',
      'Branded company challenges and reward management',
    ],
    boundary:
      'An employer never sees health conditions, movement history, heart rate, sleep, ' +
      'disability, declined activities, calendar content or an individual risk score.',
  },
  {
    slug: 'schools',
    name: 'Schools & education',
    lede:
      'Teacher-controlled movement breaks that fit inside a lesson, with safeguarding and ' +
      'parental consent as the default rather than a setting.',
    capabilities: [
      'Timetable integration and teacher-triggered classroom breaks',
      'Class and house challenges; revision-reset mode',
      'Parent consent workflows and age assurance',
      'Accessibility adaptations for every routine',
      'Aggregate school reporting only — no public child profiles',
    ],
    boundary:
      "Children's data is never used in a way detrimental to their physical or mental " +
      'wellbeing, never targeted for advertising and never exposed to unknown adults.',
  },
  {
    slug: 'care',
    name: 'Care & later life',
    lede:
      'Seated, bed-compatible and carer-assisted movement, delivered on a television or by ' +
      'voice, producing activity evidence as a by-product.',
    capabilities: [
      'Resident profiles with representative and consent controls',
      'Group sessions and a seated movement library',
      'Smart-TV mode and voice-guided sessions',
      'Family participation and celebration',
      'Participation records suitable for inspection evidence',
    ],
    boundary:
      'Stable-support reminders, seated defaults, slow transitions, pain and dizziness stop ' +
      'prompts, and an explicit non-medical position on every screen.',
  },
  {
    slug: 'public-health',
    name: 'Councils & public health',
    lede:
      'Population-scale movement for people that every other product designs out — reached ' +
      'over SMS and WhatsApp where there is no app and no wearable.',
    capabilities: [
      'Regional and multi-site licensing',
      'Sponsored public-health programmes',
      'Lightweight delivery to any phone that receives a message',
      'Privacy-protected outcome reporting at cohort level',
      'Multilingual UK support',
    ],
    boundary:
      'A general wellness programme. It does not diagnose, does not treat and is not a ' +
      'substitute for any NHS pathway.',
  },
  {
    slug: 'families',
    name: 'Families',
    lede:
      'One household, four decades. Intergenerational movement is the mechanic no ' +
      'single-audience competitor can copy.',
    capabilities: [
      'Up to six profiles across every mode',
      'Grandparent and grandchild streaks',
      'Household missions and weekend expeditions',
      'Guardian controls and shared rewards',
      'Remote family celebration across distance',
    ],
    boundary:
      'A guardian sees participation and safety, not a child’s private check-ins or ' +
      'free-text conversation with the coach.',
  },
];

/* ============================================================
   7 — Measurement
   ============================================================ */

export const KPI_GROUPS = [
  {
    group: 'Engagement',
    metrics: [
      'Daily and weekly active users',
      '7-, 30- and 90-day retention',
      'Accepted prompt rate',
      'Completed prompt rate',
      'Micro-movements per active day',
      'Return-after-lapse rate',
      'Team challenge participation',
    ],
  },
  {
    group: 'Movement outcomes',
    metrics: [
      'Sedentary periods interrupted',
      'Average uninterrupted sitting duration',
      'Daily active minutes generated',
      'Movement consistency',
      'Self-reported stiffness and energy',
      'Mobility-confidence improvement',
    ],
  },
  {
    group: 'Commercial',
    metrics: [
      'Free-to-paid conversion',
      'Customer acquisition cost and lifetime value',
      'Monthly recurring revenue',
      'Corporate renewal rate and active seats',
      'Cost per completed movement',
      'Reward cost as a share of revenue',
    ],
  },
  {
    group: 'AI quality',
    metrics: [
      'Recommendation acceptance accuracy',
      'Unsafe recommendation block rate',
      'Inappropriate interruption rate',
      'Replacement request rate',
      'Notification-disable rate',
      'Model fairness across age and accessibility groups',
    ],
  },
] as const;

/* ============================================================
   8 — Defensibility
   ============================================================ */

export const MOAT = [
  {
    name: 'Movement Opportunity Graph',
    detail:
      'A continuously improving model linking context, available time, sedentary duration, ' +
      'movement type, motivation, environment, age, capability and outcome.',
  },
  {
    name: 'Completion Probability Model',
    detail:
      'Predicts which activity this individual will actually finish at this specific moment — ' +
      'not which activity is theoretically best.',
  },
  {
    name: 'Contextual Movement Dataset',
    detail:
      'Which prompts work, for whom, in which environment, at what time, after what level of ' +
      'inactivity, in which tone, with which reward.',
  },
  {
    name: 'Inclusive Gamification Engine',
    detail:
      'A scoring system that lets a child, a wheelchair user and an octogenarian compete ' +
      'fairly in the same challenge.',
  },
  {
    name: 'Organisation Behaviour Layer',
    detail:
      'Anonymised insight into how meeting structure and work pattern shape participation.',
  },
] as const;

/* ============================================================
   9 — Roadmap
   ============================================================ */

export const ROADMAP = [
  {
    phase: 'Phase 1',
    name: 'Validation',
    items: [
      'User and workplace interviews',
      'Prototype testing',
      'Movement library clinical review',
      'Data protection impact assessment',
      'Waiting list and pilot recruitment',
    ],
  },
  {
    phase: 'Phase 2',
    name: 'MVP',
    items: [
      'Mobile application',
      'Calendar integration',
      'Micro-movement engine',
      'Gamification and a basic team challenge',
      'Subscription and analytics',
    ],
  },
  {
    phase: 'Phase 3',
    name: 'Commercial pilot',
    items: [
      'Five to ten UK employers',
      '300–1,000 users over 8–12 weeks',
      'Sedentary interruption measurement',
      'Qualitative wellbeing feedback',
      'Employer renewal testing',
    ],
  },
  {
    phase: 'Phase 4',
    name: 'Consumer OS',
    items: [
      'Family accounts',
      'Wearable integrations',
      'Advanced game worlds and friend groups',
      'Motivation profiles',
      'Reward marketplace',
    ],
  },
  {
    phase: 'Phase 5',
    name: 'Education & later life',
    items: [
      'Safeguarded child accounts and the school portal',
      'Independence and Vitality modes',
      'Care dashboard',
      'Smart-TV and voice support',
      'Clinically reviewed accessibility library',
    ],
  },
  {
    phase: 'Phase 6',
    name: 'National platform',
    items: [
      'Councils and NHS-adjacent prevention partnerships',
      'Insurers and large employers',
      'Public-health programmes',
      'Multilingual UK support',
      'International expansion',
    ],
  },
] as const;

/* ============================================================
   10 — Plans
   ============================================================ */

export interface Plan {
  readonly key: string;
  readonly name: string;
  readonly price: string;
  readonly cadence: string;
  readonly forWhom: string;
  readonly includes: readonly string[];
  readonly featured?: boolean;
}

export const PLANS: readonly Plan[] = [
  {
    key: 'free',
    name: 'Free',
    price: '£0',
    cadence: 'forever',
    forWhom: 'Anyone who wants to see whether their day really does have room.',
    includes: [
      'Basic movement prompts',
      'Limited daily missions',
      'One game world',
      'Basic progress',
      'Manual movement breaks',
      'Community challenges',
      'No card, and nothing charged under £5 ever',
    ],
  },
  {
    key: 'premium',
    name: 'Premium',
    price: '£5.99–£8.99',
    cadence: 'per month',
    forWhom: 'One person who wants the full engine pointed at their actual calendar.',
    includes: [
      'Full AI schedule analysis',
      'Wearable integrations',
      'Unlimited personalisation',
      'Advanced game worlds',
      'Detailed progress',
      'Engagement rescue',
      'The expanded movement library',
    ],
    featured: true,
  },
  {
    key: 'family',
    name: 'Family',
    price: '£12.99–£17.99',
    cadence: 'per month',
    forWhom: 'Up to six people, from ten years old to a hundred, in one household.',
    includes: [
      'Six profiles across every mode',
      'Child and later-life experiences',
      'Household challenges',
      'Guardian controls',
      'Shared rewards',
      'Intergenerational missions',
    ],
  },
  {
    key: 'organisation',
    name: 'Organisation',
    price: '£2–£5',
    cadence: 'per employee per month',
    forWhom: 'Employers, schools, care providers and councils.',
    includes: [
      'SSO and directory integration',
      'Challenge builder and campaigns',
      'Privacy-protected aggregate analytics',
      'Branded programmes',
      'Minimum 10 seats, minimum annual contract',
      'Setup and integration support',
    ],
  },
];

/* ============================================================
   11 — Boundaries
   ============================================================ */

/** Said plainly, everywhere, in every mode. §12. */
export const CLINICAL_BOUNDARY = [
  'It does not diagnose any condition.',
  'It does not provide emergency services.',
  'It does not replace a doctor, physiotherapist or other professional.',
  'Stop if you feel pain, dizziness or any unusual symptom.',
  'If you have a relevant health concern, get professional advice first.',
  'Suggestions depend on the information you provide.',
] as const;

/** Metadata every movement in the library must carry before publication. §12. */
export const CONTENT_GOVERNANCE = [
  'target age range',
  'required capability',
  'contraindication flags',
  'accessibility alternatives',
  'environment requirements',
  'intensity',
  'balance demand',
  'equipment',
  'clinical review status',
  'version history',
] as const;

/** Granular, independent and individually revocable. §11. */
export const CONSENT_SCOPES = [
  'calendar access',
  'wearable access',
  'location context',
  'heart-rate use',
  'sleep-data use',
  'team participation',
  'employer analytics',
  'family visibility',
  'research participation',
  'marketing',
  'AI personalisation',
] as const;

/* ============================================================
   12 — The decision intelligence matrix
   ============================================================ */

/**
 * The strategic case, kept in code so it cannot quietly drift from what
 * the product actually does.
 *
 * Sedentary living is a major contributor to obesity and related harm in
 * the UK. Most people who are not moving enough are not refusing to
 * exercise — they cannot commit to a routine that needs an hour, a
 * changing room and a gym membership. Generic "stand up" reminders fail
 * because they know nothing about the person's day.
 */
export const THESIS = {
  situation:
    'Sedentary living is a major contributor to obesity and related harm in the UK. Many ' +
    'people cannot commit to traditional exercise because of time, cost or confidence, and ' +
    'generic stand-up reminders lack personalisation and engagement.',
  insight:
    'Breaking up prolonged sitting with frequent short bursts of activity produces real ' +
    'benefit. An engine that schedules those bursts against a person’s actual context — and ' +
    'makes them enjoyable and social — removes the usual barriers rather than arguing with them.',
  risk:
    'Calendar integration and activity tracking raise legitimate privacy concerns that must be ' +
    'answered transparently and architecturally. Sustaining engagement past the novelty period ' +
    'is the second hard problem, and it is why Engagement Rescue is an agent rather than a feature.',
  novelty:
    'The novelty is micro-movement intelligently placed inside a real schedule, not another ' +
    'reminder. Demand for accessible, non-intimidating routes into activity is unmet, and ' +
    'remote work plus widespread wearable adoption make the timing unusually good.',
} as const;

export const DECISION_MATRIX = [
  {
    key: 'optimal',
    title: 'Optimal route',
    body:
      'Build the universal, age-adaptive Movement OS, and enter commercially through UK ' +
      'workplace wellbeing for hybrid and remote teams. AI personalisation and inclusive ' +
      'gamification are the differentiators; no lifestyle overhaul is required of the user.',
  },
  {
    key: 'pivot',
    title: 'Pivot alternative',
    body:
      'Narrow to corporate wellness only — the coach sold B2B to UK employers improving ' +
      'employee health. Smaller ceiling, faster proof, and it keeps the consumer OS available ' +
      'as a later expansion rather than a prerequisite.',
  },
  {
    key: 'inaction',
    title: 'Risk of inaction',
    body:
      'The demand for frictionless health tooling is growing now. As general models improve, ' +
      'shallow versions of this will ship from every direction, and the proprietary asset — the ' +
      'contextual completion dataset — only accrues to whoever starts collecting it first.',
  },
  {
    key: 'value',
    title: 'Commercial value',
    body:
      'Recurring revenue from consumer subscriptions and employer contracts, with strong ' +
      'scalability: one engine serves a very large base at low marginal cost per user.',
  },
] as const;

/** The disciplined first spend: validate, do not build everything. §19. */
export const MVP = {
  investment: 'US$10,000',
  audience: 'UK remote and hybrid workers, 18–64',
  why: [
    'A clear, well-evidenced sedentary problem',
    'Accessible recruitment and measurable workplace value',
    'Far lower safeguarding complexity than launching with children',
    'Tests the consumer and employer motions at the same time',
  ],
  includes: [
    'Sign-in and onboarding assessment',
    'Workday schedule entry and calendar integration',
    'Sedentary detection',
    '40–60 clinically reviewed micro-movements',
    'AI recommendation ranking and smart notifications',
    'Movement player, points and streaks',
    'Small team challenges and a progress dashboard',
    'Consent centre and subscription capability',
  ],
  excludes: [
    'Clinical integrations',
    'The children’s version',
    'Care-home deployment',
    'Multiple wearable providers',
    'A public rewards marketplace',
    'Advanced employer analytics',
    'Smart-TV application',
    'Fully generative movement creation',
  ],
} as const;
