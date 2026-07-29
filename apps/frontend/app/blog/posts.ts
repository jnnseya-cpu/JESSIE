import { SEED_POSTS, type PostCategory } from '@jessmove/shared';

/**
 * The article bodies.
 *
 * Slugs, titles, categories, dates and target phrases live in
 * `@jessmove/shared` (`SEED_POSTS`) so the site's routes and the API's
 * analytics cannot drift apart. Only the prose lives here — the API has no
 * reason to carry it, and shipping it to the backend bundle would be dead
 * weight in a container.
 */

export interface Section {
  readonly h: string;
  readonly p: readonly string[];
}

export interface Article {
  readonly slug: string;
  readonly description: string;
  readonly lede: string;
  readonly sections: readonly Section[];
  readonly links: readonly { href: string; label: string }[];
}

const ARTICLES: readonly Article[] = [
  {
    slug: 'charter-rule-c6-conflict',
    description:
      'Charter rule C6 banned weight and body-composition framing at every age. Then we ' +
      'specified a product built on exactly those numbers. Here is the whole argument.',
    lede:
      'C6 passed as a build gate before anyone had written a line of BodyCommand. Nine months ' +
      'later we specified a body-composition product that depends on precisely the numbers C6 ' +
      'forbids. One of the two had to give, and the interesting part is which.',
    sections: [
      {
        h: 'What C6 actually said',
        p: [
          'The Ethical Gamification Charter has fourteen rules and all of them are assertions in ' +
            'a test file rather than paragraphs in a policy document. C6 was the shortest: no ' +
            'weight, no body-mass index, no energy figures, no appearance framing, at any age, in ' +
            'any mode, under any consent setting.',
          'It was written for a specific reason. A product used by ten-year-olds that also shows a ' +
            'number labelled "body fat" is a product that will eventually hurt someone, and no ' +
            'consent checkbox makes that acceptable when the person consenting is twelve.',
        ],
      },
      {
        h: 'And then the market asked for the opposite',
        p: [
          'Adults kept asking for the thing C6 banned. Not vanity metrics — the ordinary, ' +
            'reasonable request of somebody in their fifties who wants to know whether what they ' +
            'are doing is working, in a number they can compare to last month.',
          'We wrote up three options. Ship it as a separate product outside the platform, keeping ' +
            'the Charter untouched. Amend C6 and rewrite the test. Or scope the rule by audience.',
          'Option A was the coward\'s answer: same company, same data, different logo, and the ' +
            'safeguarding argument evaporates the moment anyone looks closely. Option B meant ' +
            'weakening a rule because it had become commercially inconvenient, which is exactly ' +
            'how every safeguarding failure starts.',
        ],
      },
      {
        h: 'The carve-out, and what it cost',
        p: [
          'We took option C. C6 holds absolutely under 18 — not consent-gated, not parent-gated, ' +
            'absent from the interface. Above 18 it is opt-in, never competitive, never on a ' +
            'leaderboard, and never the first thing a person sees.',
          'The implementation detail that makes it real: `bodySurfacePolicy` is a single function ' +
            'that both paths call, and below 18 it does not read the consent flag at all. There is ' +
            'no branch where a truthy value in the wrong field unlocks a child\'s weight. The ' +
            'database rejects the write as well, so a bug in the service layer cannot store one.',
          'This cost us a procurement conversation with a schools buyer who wanted the metrics ' +
            'panel enabled for sixth-formers. Sixth-formers are seventeen. The answer was no.',
        ],
      },
      {
        h: 'Why the test is the artefact',
        p: [
          'The Charter is not a page on this site that describes our values. It is ' +
            '`charter.test.ts`, and a build that violates it does not deploy. That is the only ' +
            'version of an ethical commitment that survives a quarter where the numbers are bad.',
        ],
      },
      {
        h: 'What a scoped rule looks like once it is code',
        p: [
          'A rule scoped by audience is only as good as the place the scoping happens. Put it in ' +
            'the interface and it is a display decision. Put it in each service and it is six ' +
            'display decisions, five of which will stay correct.',
          'So there is one function. `bodySurfacePolicy` takes an age and a consent flag and ' +
            'returns what may be surfaced, and every path that could show a number calls it. ' +
            'Below 18 it returns the growth pathway with metrics null and does not read the ' +
            'consent argument at all — not "reads it and ignores it", does not read it. A ' +
            'reviewer can see that in eight lines.',
          'Underneath, the database has a constraint that rejects any row storing a body metric ' +
            'against an account whose verified age is below 18. If the service layer ever grew a ' +
            'bug that let one through, the write would fail rather than succeed quietly, which is ' +
            'the difference between an incident and a near miss.',
          'The API tells the same story. Send an assessment for a twelve-year-old with the ' +
            'consent flag deliberately set to true and you get back `CHILD_GROWTH` with ' +
            '`metrics: null`. It is one of the ten checks on our public console, and it is there ' +
            'so that anybody evaluating the platform can verify the claim in a browser rather ' +
            'than believing a page like this one.',
        ],
      },
    ],
    links: [
      { href: '/body-balance', label: 'BodyCommand' },
      { href: '/for-children', label: 'What children see' },
    ],
  },

  {
    slug: 'rules-in-postgresql',
    description:
      'We moved the platform invariants out of application code and into CHECK constraints. ' +
      'Postgres rejected four writes the same afternoon that services had been allowing.',
    lede:
      'Application code is where invariants go to be forgotten. Somebody adds a second write ' +
      'path, the validation lives on the first one, and the rule quietly stops being true.',
    sections: [
      {
        h: 'The four that fell over immediately',
        p: [
          'A Snap outside the 90 to 300 second window. A prescription stored without the context ' +
            'decision that authorised it. A minor account with no linked guardian. A cohort report ' +
            'materialised with fewer than eight contributing people.',
          'All four were forbidden. All four had passing unit tests. All four were reachable ' +
            'through a path that did not run the validating code, and we found them within hours ' +
            'of the constraints going in, because Postgres does not care which service is calling.',
        ],
      },
      {
        h: 'What a constraint proves that a test does not',
        p: [
          'A unit test proves that one function rejects one input. A CHECK constraint proves that ' +
            'no row can exist in that state, whatever wrote it — a service, a migration, a ' +
            'back-office script, a person with psql open at two in the morning.',
          'That last case is the one that matters. Every serious incident involving health data ' +
            'that I have read about involved a write path nobody had modelled.',
        ],
      },
      {
        h: 'Testing the constraints themselves',
        p: [
          'A constraint you have not attempted to violate is a constraint you are assuming. So ' +
            'there are fourteen tests in `db/test`, and each one issues the write that should be ' +
            'rejected and asserts the rejection, including the error class.',
          'They run in CI against a real Postgres 16, not a mock. `pnpm db:test` printing fourteen ' +
            'rejections is a release gate.',
        ],
      },
      {
        h: 'What does not belong in the database',
        p: [
          'Anything that is a judgement rather than an invariant. Dose calibration, timing, the ' +
            'ranking of one movement over another — these change weekly and belong in code where ' +
            'they can be reasoned about and reverted.',
          'The line we drew: if violating it would be a safeguarding failure or a privacy breach, ' +
            'it goes in the schema. If violating it would just be a worse recommendation, it ' +
            'stays in the service.',
        ],
      },
      {
        h: 'The four that were already wrong',
        p: [
          'Worth being specific, because "it found bugs" is the kind of claim that costs nothing ' +
            'to make. The Snap duration violation came from a seeding script that predated the ' +
            '90 to 300 second window and had been re-run during a data migration three weeks ' +
            'earlier. The context-decision violation came from a retry path that rebuilt a ' +
            'prescription from a cached candidate and forgot to carry the decision identifier ' +
            'across.',
          'The guardian violation was the uncomfortable one. An account created through an ' +
            'organisation import could reach an under-18 age band without a guardian link, ' +
            'because the import validated against the organisation schema rather than the ' +
            'consumer one. Nobody had done it in production. The path existed.',
          'The k-anonymity violation was a materialised view refreshing on a schedule, which ' +
            'recomputed cohorts as membership changed and did not re-check the threshold on ' +
            'refresh. A cohort of eleven people in January was a cohort of six by March, and the ' +
            'view happily reported it.',
        ],
      },
      {
        h: 'What this costs on a normal day',
        p: [
          'Migrations get slower to write, because a constraint has to be satisfied by every row ' +
            'that already exists before it can be added. Twice we have had to write a backfill ' +
            'first and add the constraint second, which is more work than not having the ' +
            'constraint and is the entire point.',
          'Error messages also have to be handled properly. A raw Postgres constraint violation ' +
            'is not something to show a person, so each one maps to a domain error with a ' +
            'sentence that says what was wrong and what to do instead.',
        ],
      },
      {
        h: 'Where we drew the line',
        p: [
          'The rule of thumb that settled the arguments: if violating it would be a safeguarding ' +
            'failure or a privacy breach, it belongs in the schema. If violating it would only ' +
            'produce a worse recommendation, it stays in the service where it can be tuned ' +
            'weekly and reverted on a Friday afternoon.',
          'That puts fourteen things in the database and several hundred in code, which is about ' +
            'the ratio we expected. The fourteen are the ones we would have to explain to a ' +
            'regulator.',
        ],
      },
    ],
    links: [
      { href: '/developers', label: 'Developer reference' },
      { href: '/policies', label: 'All policies' },
    ],
  },

  {
    slug: 'six-modes-not-a-font-size',
    description:
      'Accessibility as a settings toggle produces a worse product for everyone. Six modes ' +
      'change register, density, mechanics, data collection and clinical guardrails together.',
    lede:
      'The usual approach is one interface with a text-size slider and a high-contrast switch. ' +
      'It is cheap, it demonstrates good intent, and it does not work.',
    sections: [
      {
        h: 'What a mode changes',
        p: [
          'Mode is derived from a verified age band and a capability profile. It is not a ' +
            'preference and it cannot be chosen freely, because it governs safeguarding rules ' +
            'rather than taste.',
          'Between Explorer at ten and Vitality at ninety, the following all change: interface ' +
            'density and target size, the coach\'s register and vocabulary, which gamification ' +
            'mechanics are legal, what data may be collected at all, which clinical guardrails ' +
            'apply, and the default movement variant.',
          'A ten-year-old and an eighty-eight-year-old are not the same person with different ' +
            'eyesight. Treating them as such produces an interface that patronises one and ' +
            'exhausts the other.',
        ],
      },
      {
        h: 'The mechanics that are illegal by mode',
        p: [
          'Competitive leaderboards do not exist below 18. Loss framing does not exist anywhere. ' +
            'Body metrics do not exist below 18 and are opt-in above it. Public visibility of ' +
            'another person\'s activity requires a mode that permits it, and two of the six do not.',
          'Because these are enforced per mode rather than per feature flag, adding a new mechanic ' +
            'means declaring which modes it is legal in. There is no default of "all".',
        ],
      },
      {
        h: 'Minimum sizes are not a setting',
        p: [
          'Body text is 16 pixels in the middle modes, 18 in Independence and 20 in Vitality — as ' +
            'a floor, not a starting point a user drags. Touch targets go from 48 pixels to 56 in ' +
            'later life, against a WCAG minimum of 24.',
          'The reason to bake this in rather than expose it: the person who most needs the larger ' +
            'target is the person least likely to go looking for the setting that provides it.',
        ],
      },
      {
        h: 'The cost',
        p: [
          'Six times the review surface on every screen. Every component takes mode as an input ' +
            'and every design review looks at six states. It is slower and it is not optional — a ' +
            'product for ages ten to a hundred that only really works for one of those decades is ' +
            'a product for one of those decades.',
        ],
      },
      {
        h: 'What changes between two adjacent modes',
        p: [
          'Balance covers 40 to 64 and Independence covers 65 to 79, which sound close and are ' +
            'not. Balance defaults to standing variants and treats a chair as an option. ' +
            'Independence defaults to chair-supported and treats standing as something to be ' +
            'chosen. That single default is the difference between an app that assumes you are ' +
            'fine and one that assumes nothing.',
          'The coach\'s register changes too. In Balance it is direct and slightly terse, ' +
            'because the research on that age band is unambiguous that people find encouragement ' +
            'patronising. In Independence it is warmer and states the safety point explicitly ' +
            'rather than leaving it implied, because the consequence of a misjudged movement is ' +
            'materially different.',
          'Data collection narrows as well. Independence and Vitality collect less, not more, ' +
            'despite the clinical case for collecting more being stronger. The reasoning is that ' +
            'the people most likely to be harmed by a breach are the people least able to ' +
            'recover from one.',
        ],
      },
      {
        h: 'Why mode is not a user setting',
        p: [
          'You can change your capability profile, your goals, your notification preferences and ' +
            'the coach\'s presence level. You cannot change your mode, because mode is derived ' +
            'from a verified age band and it governs which safeguarding rules apply.',
          'The obvious objection is that a fit 70-year-old is being patronised by Independence ' +
            'defaults. They are not, because capability is a separate input: the mode sets the ' +
            'safeguarding floor and the capability profile sets the difficulty. A very fit ' +
            '70-year-old gets hard movements with a chair available and no leaderboard.',
        ],
      },
    ],
    links: [
      { href: '/how-it-works', label: 'How it works' },
      { href: '/micro-movement', label: 'Micro-Movement' },
    ],
  },

  {
    slug: 'the-nudge-we-did-not-send',
    description:
      'Law 2 treats a notification fired into a moment you cannot move as a defect. We count ' +
      'silence as a successful outcome, and the held rate is a headline metric.',
    lede:
      'Most engagement systems optimise for the message being opened. We hold roughly a third of ' +
      'everything the engine wants to send, and that number is on the dashboard.',
    sections: [
      {
        h: 'The defect nobody logs',
        p: [
          'A reminder to stand up, delivered while you are driving, is not a neutral event. It is ' +
            'a small tax on attention and a slightly larger one on trust, and after enough of them ' +
            'the person turns notifications off — at which point the product is finished, however ' +
            'good the recommendation engine is.',
          'So the context agent runs before every send, and returns one of three verdicts: deliver, ' +
            'defer with a retry window, or block with a named reason. A block is recorded as a ' +
            'successful decision, not a failure to deliver.',
        ],
      },
      {
        h: 'What blocks a send',
        p: [
          'Driving, detected from motion state rather than location. An active call. Do-not-disturb. ' +
            'The daily cap, which is per person and per mode. A minimum gap since the last one. ' +
            'Quiet hours. A calendar block marked as focused, which we read structurally — the ' +
            'titles never leave the device.',
          'When a send is blocked, the API returns it as a success with `held: true`, the blocking ' +
            'reasons, and a retry window. It is not an error, and treating it as one is how you end ' +
            'up with a client that retries into the same wall.',
        ],
      },
      {
        h: 'The awkward growth conversation',
        p: [
          'Held rate as a headline metric makes every growth review slightly uncomfortable, because ' +
            'the obvious lever for weekly active users is to send more. We have the number in front ' +
            'of us specifically so that lever is visible when somebody reaches for it.',
          'What we measure instead is completion rate per delivered message. Sending fewer and ' +
            'better moves that number in the direction that actually correlates with people still ' +
            'using the product in month six.',
        ],
      },
      {
        h: 'Timing is a bandit, not a language model',
        p: [
          'The decision of when to send is a contextual bandit with a sub-second budget. It is not ' +
            'an LLM and the architecture notes say so explicitly, because "upgrade it to a model" ' +
            'is a suggestion that arrives about twice a year and is wrong every time.',
        ],
      },
      {
        h: 'How a calendar is read without reading it',
        p: [
          'The most useful signal for when somebody can move is their calendar, and the calendar ' +
            'is also the single most sensitive thing on a work device. Titles contain client ' +
            'names, medical appointments, disciplinary meetings and resignations.',
          'So the calendar is read structurally. Start time, end time, busy or free, accepted or ' +
            'tentative, number of attendees, whether it recurs. The title is never transmitted, ' +
            'never logged and never sent to a model — it is in the redaction list the AI Gateway ' +
            'enforces before any external call, alongside names, clinical notes and free-text ' +
            'responses.',
          'This costs accuracy. A meeting called "1:1 with Sam" and one called "quarterly board ' +
            'review" look identical to us, and the second is a much worse moment to interrupt. ' +
            'We accept the worse recommendation, and the notification a person receives says ' +
            '"calendar titles never left your device" so the trade is visible rather than ' +
            'assumed.',
        ],
      },
      {
        h: 'What a held nudge actually returns',
        p: [
          'The response is a success with `held: true`, an array of blocking reasons, and a retry ' +
            'window in seconds. Not a 4xx, not an empty body, not a silent no-op.',
          'That shape matters more than it looks. A client that receives an error retries, logs ' +
            'an exception, and eventually shows the user something is broken. A client that ' +
            'receives an explicit hold with a retry window waits, and can tell the person why if ' +
            'they ask.',
        ],
      },
      {
        h: 'The metric we watch instead',
        p: [
          'Completion rate per delivered message, split by mode. It is the number that moves when ' +
            'the timing model improves and the number that falls when somebody quietly raises a ' +
            'daily cap to hit a weekly target.',
          'Held rate sits next to it, unexplained and deliberately prominent. If it drops sharply ' +
            'without a corresponding change to the context model, something has been loosened and ' +
            'somebody should have to say what.',
        ],
      },
    ],
    links: [
      { href: '/mova', label: 'MOVA AI Coach' },
      { href: '/micro-movement', label: 'Micro-Movement' },
    ],
  },

  {
    slug: 'why-the-streak-forgives',
    description:
      'Loss-aversion mechanics work by making people feel bad. We built Grace Tokens, Flare ' +
      'Mode and a Bereavement Hold instead, and guilt turned out to be a churn driver.',
    lede:
      'A streak counter is the most effective retention mechanic in consumer software and it ' +
      'works by threatening you. We kept the mechanic and removed the threat.',
    sections: [
      {
        h: 'What breaks a chain',
        p: [
          'We looked at what actually interrupts a run of consistent days. It is almost never ' +
            'apathy. It is illness, a caring responsibility, a shift pattern change, a bereavement, ' +
            'or a flare-up of a condition the person did not choose.',
          'Punishing all of those identically, with a counter reset to zero and a notification ' +
            'about breaking the chain, is a design that works well against the people it should be ' +
            'protecting.',
        ],
      },
      {
        h: 'Three mechanics that hold the line',
        p: [
          'Grace Tokens accrue with consistency and are spent automatically on a missed day, ' +
            'without being asked for. Flare Mode is user-declared and drops the target rather than ' +
            'pausing the chain. The Bereavement Hold suspends everything, including the coach, for ' +
            'a period the person sets, and nothing is lost.',
          'None of them can be purchased. Paid streak restoration is banned in the Charter, because ' +
            'the moment a company sells relief from a feeling it manufactured, it has an incentive ' +
            'to manufacture more of it.',
        ],
      },
      {
        h: 'The measurement',
        p: [
          'Guilt-framed recovery messaging produced a small bump in next-day return and a larger ' +
            'drop in week-six retention. Forgiveness framing was flat on next-day and materially ' +
            'better at six weeks.',
          'That is not a moral argument, it is an arithmetic one, and it is the version of this ' +
            'argument that survives contact with a board meeting.',
        ],
      },
      {
        h: 'What we will not build',
        p: [
          'No "you lost your streak" message. No bottom-of-leaderboard exposure. No countdown ' +
            'timer on a recovery window. These are in the Charter test, which means they are not ' +
            'in the roadmap either — a feature that fails the build is not a feature.',
        ],
      },
      {
        h: 'What a Grace Token is, precisely',
        p: [
          'Tokens accrue at a rate tied to consistency rather than volume — roughly one per two ' +
            'weeks of regular activity, capped so they cannot be hoarded into indefinite ' +
            'immunity. They are spent automatically on the first missed day, without a prompt ' +
            'and without a decision.',
          'The automatic part is deliberate. A dialogue asking "use a Grace Token to save your ' +
            'streak?" reintroduces exactly the loss framing the mechanic exists to remove, and ' +
            'turns a kindness into a small negotiation with a person having a bad week.',
          'The notification afterwards says the chain held and does not mention what it cost. If ' +
            'somebody wants the detail it is in their history.',
        ],
      },
      {
        h: 'Flare Mode and the Bereavement Hold',
        p: [
          'Flare Mode is declared by the person, not detected. It drops the daily target to ' +
            'something achievable from a chair or a bed and keeps the chain intact. There is no ' +
            'evidence requirement and no time limit, because building a proof-of-illness flow ' +
            'into a wellbeing product is a way of telling people you do not believe them.',
          'The Bereavement Hold is heavier. It suspends the chain, the targets, the coach and ' +
            'every notification except account security for a period the person sets, and ' +
            'nothing accrues or expires while it is on. Coming back does not require catching up ' +
            'on anything.',
          'Both were added after user research rather than being designed in from the start, ' +
            'which is a polite way of saying we did not think of them and were told.',
        ],
      },
      {
        h: 'What the Charter forbids outright',
        p: [
          'Paid streak restoration. Loss-framed copy of any kind. Bottom-of-leaderboard exposure. ' +
            'Countdown timers on a recovery window. Any message containing the phrase "you lost".',
          'These are assertions in `charter.test.ts`, which means they are not on the roadmap ' +
            'either — a feature that fails the build is not a feature, it is a proposal that has ' +
            'already been rejected.',
          'The commercial case for at least two of them is genuinely strong. That is the point of ' +
            'writing the rule down before the quarter in which somebody makes it.',
        ],
      },
    ],
    links: [
      { href: '/challenges', label: 'Challenges' },
      { href: '/policies', label: 'All policies' },
    ],
  },

  {
    slug: 'five-variants-or-it-does-not-ship',
    description:
      'Every movement exists as standing, seated, chair-supported, bed or recliner, and ' +
      'adaptive single-limb — authored independently, not degraded. There is no override.',
    lede:
      'The publishing gate refuses a movement that has fewer than five authored variants. There ' +
      'is no force-publish flag, no admin bypass, and yes, this has delayed releases.',
    sections: [
      {
        h: 'Independently authored, not degraded',
        p: [
          'The tempting implementation is to write the standing version and generate the rest by ' +
            'removing things. It produces seated movements that are worse than they need to be, ' +
            'because a good seated movement is not a standing one with the legs deleted — it uses ' +
            'the chair.',
          'So each of the five is authored, reviewed and dosed on its own terms. The equivalence ' +
            'multiplier that lets them be compared is computed, not assumed.',
        ],
      },
      {
        h: 'The five',
        p: [
          'Standing. Seated. Chair-supported, where the chair takes load rather than just holding ' +
            'the person. Bed or recliner, for people who are not reliably transferring. And ' +
            'adaptive single-limb, for anyone working with one usable side.',
          'Independence and Vitality modes default to chair-supported rather than standing. In ' +
            'Vitality, standing requires an explicit clearance rather than being the assumption ' +
            'somebody has to opt out of.',
        ],
      },
      {
        h: 'Why there is no override',
        p: [
          'Because an override is used. It gets added for a genuine emergency, it stays, and ' +
            'within a year the library has forty movements that only work if you can stand. The ' +
            'people affected are the ones least likely to complain and most likely to just stop ' +
            'opening the app.',
          'A partial movement stays in draft indefinitely. That is the entire enforcement ' +
            'mechanism and it is enough.',
        ],
      },
      {
        h: 'What it costs',
        p: [
          'Roughly four times the authoring effort per movement and a slower library. In exchange, ' +
            'the sentence "every body qualifies" is a property of the system rather than a claim ' +
            'on a marketing page.',
        ],
      },
      {
        h: 'The equivalence multiplier',
        p: [
          'Five independently authored variants create a problem: if a seated version is not a ' +
            'reduced standing version, the two are not directly comparable, and the whole ' +
            'progress model depends on comparing them.',
          'So each variant carries an equivalence multiplier computed against a reference ' +
            'effort, not assumed from its posture. A well-chosen chair-supported movement can ' +
            'score higher than a lazily performed standing one, and the numbers reflect that ' +
            'rather than encoding a hierarchy where standing is simply worth more.',
          'This has a pleasant consequence: somebody who moves to a seated variant during a ' +
            'flare-up does not watch their progress collapse. Their effort is measured on its ' +
            'own terms.',
        ],
      },
      {
        h: 'Substitution goes down the ladder, never up',
        p: [
          'There is a support ladder — standing, chair-supported, seated, bed or recliner — and ' +
            'the engine may substitute downward without asking. If the context suggests standing ' +
            'is a poor idea right now, it offers the supported version.',
          'It may never substitute upward. A person who has been offered seated movements does ' +
            'not suddenly get a standing one because their step count looked promising, because ' +
            'the cost of being wrong in that direction is a fall.',
          'Upward movement happens only when the person changes their capability profile, or ' +
            'when a clinician-facing clearance is recorded. In Vitality mode, standing requires ' +
            'that clearance rather than being the default somebody has to opt out of.',
        ],
      },
      {
        h: 'Six cue sets, as well as five variants',
        p: [
          'The gate checks more than posture. Every movement also carries text, audio, captioned ' +
            'video, haptic and voice-only cue sets, plus an Easy Read register, because a movement ' +
            'somebody cannot understand is as unavailable as one they cannot perform.',
          'Captioned video is the one that catches authors out. An uncaptioned demonstration is ' +
            'not a video with a missing feature, it is a movement that does not exist for a deaf ' +
            'user, and the gate treats it as such.',
        ],
      },
      {
        h: 'What this looks like from outside',
        p: [
          'The publishing contract is a public endpoint. Ask `/movements/gate` and it returns the ' +
            'five variants, the six cue sets and the screening requirement, in full, as data. Then ' +
            'attempt to publish a movement with four variants and read the refusal.',
          'A claim you can call is worth more than a claim you can read.',
        ],
      },
    ],
    links: [
      { href: '/micro-movement', label: 'Micro-Movement' },
      { href: '/wearables', label: 'Wearables' },
    ],
  },

  {
    slug: 'the-employer-dashboard-that-does-not-exist',
    description:
      'If an HR director can see that one named person stopped moving in March, the product is ' +
      'a liability. The individual view is absent from the type system, not permission-gated.',
    lede:
      'Every workplace wellbeing platform we looked at has an individual view behind a ' +
      'permission. Permissions get granted. We removed the view instead.',
    sections: [
      {
        h: 'The failure mode',
        p: [
          'An employer can see that a named employee\'s activity dropped sharply in March. That is ' +
            'health information about a person, inferred from a wellbeing benefit they were ' +
            'encouraged to use, sitting in a dashboard belonging to the people who decide their ' +
            'promotion.',
          'It does not matter that the intent was supportive. The capability is the problem, and a ' +
            'role-based permission is not a control — it is a setting, and settings change when ' +
            'somebody senior asks.',
        ],
      },
      {
        h: 'Absent, not gated',
        p: [
          'There is no API that returns per-person activity to an organisation. Not restricted, ' +
            'not audited, not available to a super-admin. The response type has no field for it, so ' +
            'a client asking for one does not compile.',
          'Cohort metrics require at least eight contributing people. Below that the value is ' +
            'replaced with a suppression marker, and the suppression is enforced in the query ' +
            'planner and again as a database constraint.',
        ],
      },
      {
        h: 'The intersection attack',
        p: [
          'k-anonymity of eight is not sufficient on its own. Filter by department, then by site, ' +
            'then by age band, and each filter is above the threshold while the intersection is one ' +
            'person.',
          'So the check runs across filter combinations rather than per query, and a combination ' +
            'that would narrow to fewer than eight is suppressed even when every individual filter ' +
            'looks safe. This makes some legitimate questions unanswerable in small organisations, ' +
            'which is the correct outcome.',
        ],
      },
      {
        h: 'What an employer does get',
        p: [
          'Participation, aggregate movement trend, sedentary-risk distribution by cohort, and a ' +
            'return-on-investment model with its assumptions written down. Enough to run a ' +
            'programme. Not enough to manage an individual.',
        ],
      },
      {
        h: 'Why the type system rather than a permission',
        p: [
          'The usual objection is that a permission is fine as long as nobody grants it. In ' +
            'practice a permission is a conversation waiting to happen: a senior person asks, an ' +
            'administrator finds the toggle, and the control that existed on paper is gone in an ' +
            'afternoon with no code review and no record.',
          'Removing the capability changes the conversation entirely. There is no toggle to ' +
            'find. Adding one means a schema change, a migration, a code review and a deliberate ' +
            'decision by named engineers — which is exactly the amount of friction a decision ' +
            'like that deserves.',
          'It also changes the sales conversation, and not always in our favour. Some buyers want ' +
            'the individual view and go elsewhere when told it does not exist. That is a cost we ' +
            'have decided to keep paying.',
        ],
      },
      {
        h: 'What the suppression marker looks like',
        p: [
          'When a cohort falls below the threshold the response carries a suppression marker ' +
            'rather than a number, and the marker is a distinct value in the type rather than a ' +
            'zero or a null. A client cannot accidentally render it as "0 people moved this ' +
            'week", which would be both wrong and worse than saying nothing.',
          'The dashboard shows it as "too few people to report", with the threshold stated. ' +
            'Administrators of small organisations see a lot of it, and the honest answer to ' +
            'their complaint is that an eleven-person company cannot have anonymous reporting, ' +
            'and a product that pretends otherwise is selling them a risk rather than a feature.',
        ],
      },
      {
        h: 'What the organisation actually buys',
        p: [
          'Participation and engagement at cohort level. Aggregate sedentary-risk distribution. ' +
            'Trend over time against a baseline. A return-on-investment model with its assumptions ' +
            'written down and adjustable, so nobody has to take our multiplier on faith.',
          'That is enough to decide whether to renew, where to run a campaign, and which sites ' +
            'need attention. It is not enough to have a conversation with one employee about their ' +
            'activity, and it is not supposed to be.',
        ],
      },
    ],
    links: [
      { href: '/industries', label: 'Industries' },
      { href: '/privacy', label: 'Privacy Policy' },
    ],
  },

  {
    slug: 'a-photograph-cannot-tell-you-the-calories',
    description:
      'FoodLens returns a range, its evidence source and a confidence level, and refuses to ' +
      'collapse the range unless the source is verified. Twelve dimensions, no health score.',
    lede:
      'A photograph of a plate does not contain the information required to state an energy ' +
      'figure. Every product that states one anyway is guessing and rounding the guess.',
    sections: [
      {
        h: 'What a photograph actually supports',
        p: [
          'Identification of components, reasonably. Relative proportions, roughly. Preparation ' +
            'method, sometimes. Portion mass, poorly — this is the one that dominates the error, ' +
            'and it is the one a photograph is worst at.',
          'A curry can vary by a factor of three in energy density depending on how it was made, ' +
            'and nothing in the image distinguishes the versions. So FoodLens returns a range, and ' +
            'the range is wide when it should be.',
        ],
      },
      {
        h: 'The evidence ladder',
        p: [
          'A barcode is verified. A restaurant menu item with published data is verified. A ' +
            'user-entered weight is strong. A photograph alone is weak. The range narrows as the ' +
            'evidence improves and never narrows because the interface would look better.',
          'This produces the counter-intuitive result that a barcode-scanned ready meal is analysed ' +
            'with more confidence than a carefully photographed home-cooked salad, which is correct ' +
            'and occasionally annoying.',
        ],
      },
      {
        h: 'Meal Intelligence scores the analysis, not the food',
        p: [
          'The number at the top of a FoodLens result is not a verdict on the meal. There is no ' +
            'composite health score — a single number that ranks food good or bad is the shortest ' +
            'path to a disordered relationship with eating, and the Charter forbids it.',
          'Meal Intelligence measures how much the system knows: evidence source, item coverage, ' +
            'portion certainty, preparation certainty. It answers "how well did we read this ' +
            'plate", and the caption saying so is fixed in code rather than left to a designer.',
        ],
      },
      {
        h: 'And never to a child',
        p: [
          'No energy figure, no macronutrient breakdown and no portion judgement is shown below ' +
            '18, in any mode, under any consent. What a younger user sees is component ' +
            'identification, plant variety, and allergen flags — which is the genuinely useful part ' +
            'anyway.',
        ],
      },
      {
        h: 'The twelve dimensions, and why there is no thirteenth',
        p: [
          'A FoodLens result carries twelve independent dimensions — component identification, ' +
            'portion estimate, energy range, macronutrient split, plant variety, fibre, ' +
            'preparation method, allergen flags, evidence source, confidence, agreement between ' +
            'estimates, and personal relevance against what the person has told us.',
          'What it does not carry is a thirteenth number that combines them. Every reasonable ' +
            'objection to that decision is about convenience, and every objection to the ' +
            'alternative is about what happens to somebody who starts organising their eating ' +
            'around a score that a piece of software invented.',
          'The Charter forbids the composite, and the test suite asserts that no dimension named ' +
            'anything like a health score exists in the response type. It is the most frequently ' +
            'requested feature we have.',
        ],
      },
      {
        h: 'Allergens are the one place we refuse to estimate',
        p: [
          'Fourteen allergens are flagged under UK labelling rules, and a photograph can suggest ' +
            'the presence of most of them. It can never establish absence.',
          'So the result has three states, not two: present, unknown, and verified-absent. The ' +
            'third requires a barcode or published data — it is never inferred from appearance, ' +
            'however confident the identification looks.',
          'The interface says "cannot confirm" rather than showing a reassuring empty space, ' +
            'because an empty space reads as "no allergens" to somebody scanning quickly, and ' +
            'the consequence of that misreading is not a slightly worse meal.',
        ],
      },
      {
        h: 'Swaps, and the uncertainty they add',
        p: [
          'Simulating a change — swap the rice for salad, halve the sauce — is the most useful ' +
            'thing FoodLens does and the easiest to get wrong, because a simulated meal has all ' +
            'the uncertainty of the original plus the uncertainty of the substitution.',
          'So a swap widens the range rather than narrowing it, which is the opposite of what ' +
            'makes a good screenshot. The comparison shown is between two ranges, and where they ' +
            'overlap the interface says the difference is not distinguishable rather than picking ' +
            'a winner.',
        ],
      },
    ],
    links: [
      { href: '/foodlens', label: 'FoodLens 360°' },
      { href: '/for-children', label: 'What children see' },
    ],
  },
];

export interface FullPost extends Article {
  readonly title: string;
  readonly category: PostCategory;
  readonly publishedAt: string;
  readonly keyword: string;
  readonly clusterKey: string | null;
  readonly words: number;
  readonly readMinutes: number;
  readonly displayDate: string;
}

const DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

function assemble(): readonly FullPost[] {
  return SEED_POSTS.map((seed) => {
    const article = ARTICLES.find((a) => a.slug === seed.slug);
    if (!article) {
      // A seed without a body is a build-time error, not a blank page.
      throw new Error(`no article body for seed post "${seed.slug}"`);
    }
    const words =
      article.lede.split(/\s+/).length +
      article.sections.reduce(
        (n, s) => n + s.h.split(/\s+/).length + s.p.join(' ').split(/\s+/).length,
        0,
      );
    return {
      ...article,
      title: seed.title,
      category: seed.category,
      publishedAt: seed.publishedAt,
      keyword: seed.keyword,
      clusterKey: seed.clusterKey,
      words,
      readMinutes: Math.max(1, Math.round(words / 220)),
      displayDate: DATE.format(new Date(`${seed.publishedAt}T00:00:00Z`)),
    };
  });
}

export const POSTS: readonly FullPost[] = assemble();

export function postBySlug(slug: string): FullPost | undefined {
  return POSTS.find((p) => p.slug === slug);
}
