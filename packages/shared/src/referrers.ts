/**
 * The people who already gather the people.
 *
 * A falls-prevention group runs a twelve-week course and then the course
 * ends. A social prescribing link worker sees somebody for six weeks and
 * is asked what happens afterwards. A care home activities coordinator
 * plans a week at a time for people who mostly sit down. A community
 * pharmacist hands over a prescription and has ninety seconds.
 *
 * Every one of them is already in front of exactly the person this
 * platform is for, is already trusted by them, and is already being asked
 * "is there anything for at home?". One of those relationships is worth
 * more than a very large amount of search traffic, and no amount of
 * writing reaches them, because they are not searching — they are working.
 *
 * What reaches them is a link they can hand over without worrying. This
 * module is what sits behind that link.
 */

export const REFERRER_KINDS = [
  'falls_group',
  'social_prescribing',
  'care_setting',
  'pharmacy',
  'gp_practice',
  'school',
  'workplace',
  'community_group',
  'other',
] as const;
export type ReferrerKind = (typeof REFERRER_KINDS)[number];

export interface ReferrerKindDefinition {
  readonly label: string;
  /** Who they are handing this to, in their words rather than ours. */
  readonly handsItTo: string;
  /**
   * The question they will ask before they pass anything on, and it is
   * never "what do I get". It is some version of "will this hurt the
   * person who trusts me".
   */
  readonly asksFirst: string;
  /** What on this platform actually answers that question. */
  readonly answeredBy: string;
}

export const REFERRER_KIND_DEFINITIONS: Readonly<Record<ReferrerKind, ReferrerKindDefinition>> = {
  falls_group: {
    label: 'Falls prevention group',
    handsItTo: 'Somebody finishing a strength and balance course, at the point the course ends.',
    asksFirst: 'Will it tell them they are fine when they are not, and will it get them doing something unsafe on their own?',
    answeredBy:
      'The strength and balance module produces a starting level and never a falls risk score, and says in as many words that a good result is not evidence of being at low risk. Safety notes come before the method and the input is withheld until they have been read past.',
  },
  social_prescribing: {
    label: 'Social prescribing link worker',
    handsItTo: 'Somebody at the end of a six-week block who wants to keep going.',
    asksFirst: 'What happens to what they tell it, and can it reach their employer or their family?',
    answeredBy:
      'Declared conditions are stored as catalogue identifiers with no free text, never leave the account, and are deleted in one action. Group reporting has a floor of eight and no health data crosses it at any size.',
  },
  care_setting: {
    label: 'Care home or supported living',
    handsItTo: 'Residents and the coordinator planning a week of activity.',
    asksFirst: 'Does it work for somebody who cannot stand, and does it push people?',
    answeredBy:
      'Every movement ships with five variants including seated, chair-supported and reclined, and the programme starts from the seated level when nothing has been recorded. Nothing is a target and nothing is a streak that punishes a missed day.',
  },
  pharmacy: {
    label: 'Community pharmacy',
    handsItTo: 'Somebody collecting a repeat prescription, in about ninety seconds.',
    asksFirst: 'Will it contradict what I have just told them, or comment on their medication?',
    answeredBy:
      'No condition card comments on a dose, a timing, an escalation or whether to continue. Where a condition has a prescribed treatment the card names it as the prescriber’s and stops, and a test scans every card for that language.',
  },
  gp_practice: {
    label: 'GP practice or PCN',
    handsItTo: 'Patients a practice would otherwise have nothing to offer between appointments.',
    asksFirst: 'Is there a hazard log, and who is accountable for it?',
    answeredBy:
      'A DCB0129 hazard log is published in full with initial and residual ratings and the mechanism enforcing every control. It states plainly that the officer appointment is not yet complete for submission.',
  },
  school: {
    label: 'School or youth club',
    handsItTo: 'Pupils, through a parent or guardian.',
    asksFirst: 'Will a child ever be shown a weight or a calorie figure?',
    answeredBy:
      'No. Charter rule C6: no weight, no body-mass index and no energy figure can be rendered for an account under 18 — absent rather than hidden, and asserted in the test suite rather than described in a policy.',
  },
  workplace: {
    label: 'Workplace or occupational health',
    handsItTo: 'Staff, usually through a wellbeing lead.',
    asksFirst: 'What will the employer be able to see about an individual?',
    answeredBy:
      'Nothing. Group reporting enforces a floor of eight and no module outside the conditions service can read a condition at all — which is asserted by a test rather than promised.',
  },
  community_group: {
    label: 'Community or peer group',
    handsItTo: 'Members of a walking group, a lunch club or a peer support group.',
    asksFirst: 'Is it free, and does it turn into a bill?',
    answeredBy:
      'The account is free and everything that is not AI stays free. AI features carry a small monthly allowance for two months and then need a plan — said before signup, not after.',
  },
  other: {
    label: 'Other',
    handsItTo: 'Whoever this organisation already works with.',
    asksFirst: 'Is this safe to pass on?',
    answeredBy:
      'Everything the platform refuses to do is published at /assurance, generated from the code rather than written about it.',
  },
};

/* ------------------------------------------------------------------ *
 * The rule that makes this work
 * ------------------------------------------------------------------ */

/**
 * Nobody is paid for a referral here, and that is the point rather than
 * an omission.
 *
 * The partner programme pays influencers, with disclosure, and that is a
 * different relationship: an audience knows it is being sold to. A link
 * worker, a pharmacist or a falls instructor recommending something they
 * are paid per head for is in a conflict with the person in front of
 * them, that person cannot see it, and the recommendation carries the
 * weight of a professional judgement. Several of these roles sit under
 * codes that would make it a disciplinary matter.
 *
 * It is also, straightforwardly, the most persuasive sentence available:
 * the first question a careful professional asks about a link is what the
 * person handing it over is getting out of it.
 */
export const NO_REFERRAL_FEE =
  'Nobody is paid for this. There is no commission, no per-signup fee and no revenue share ' +
  'behind a referral code — the code exists so we can tell which routes reach people and ' +
  'nothing else. If you are in a role where recommending a paid product for a fee would be a ' +
  'conflict, that is exactly why this works the way it does.';

export const REFERRER_PROMISE = [
  'The account is free to create, and everything that is not AI stays free.',
  'Nothing anybody records here reaches you, their family, their employer or us in a form that identifies them.',
  'No weight, body-mass index or calorie figure is ever shown to anybody under 18.',
  'The strength and balance check produces a starting level, never a falls risk score.',
  'Nothing comments on a prescription — where a condition has a treatment, the card names it as the prescriber’s and stops.',
  'You are not paid, and neither is anybody else for passing this on.',
] as const;

/** A code somebody can read down a phone without spelling it twice. */
export function isValidReferrerCode(code: string): boolean {
  return /^[a-z0-9-]{3,24}$/.test(code);
}

/**
 * Turn an organisation's name into a code.
 *
 * Readable rather than random, because it gets said aloud, written on the
 * back of a leaflet, and typed in by somebody who is not looking forward
 * to typing it.
 */
export function codeFromLabel(label: string): string {
  return label
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
    .replace(/-+$/, '');
}

export interface ReferrerRecord {
  readonly code: string;
  readonly label: string;
  readonly kind: ReferrerKind;
  readonly active: boolean;
}
