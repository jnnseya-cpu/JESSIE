/**
 * Meta Pixel and Google Tag: what they may see, and where.
 *
 * Both vendors are advertising networks. This platform holds health data
 * about people aged ten to a hundred, which makes the interesting question
 * not "how do we fire an event" but "what is this allowed to touch" — and
 * that question has three answers that are not negotiable by a call site.
 *
 * **Consent first, or nothing at all.** Under UK PECR a non-essential
 * tracker needs consent before it is set, and consent means before the
 * script is fetched — not before it fires. A visitor who declines must
 * never have contacted Meta or Google, because the request itself carries
 * their address and the page they were on. So the loaders here are gated on
 * an explicit opt-in and there is no path that runs them without one.
 *
 * **Marketing surfaces only.** Everything behind the account is off. Not
 * consent-gated, not anonymised — absent. A pixel on a page where somebody
 * logs a meal, declares a condition or reads a falls score is how a health
 * platform ends up explaining itself to a regulator, and it is the specific
 * failure that has cost hospitals large fines. The referral channel this
 * product depends on is built on link workers and falls instructors asking
 * "can this reach their employer or their family"; an advertising tag on a
 * health screen makes the honest answer to that question worse.
 *
 * **Adults only.** The ICO's Age Appropriate Design Code treats profiling
 * for advertising as off by default for children, and this platform already
 * publishes that promise for its ten- to twelve-year-olds. Age is checked
 * before the loader runs, not inside the event.
 *
 * What is left after those three is genuinely useful: a public marketing
 * site, an adult who agreed, and a small set of commercial events that say
 * somebody arrived, started an account, finished one, or paid. That is the
 * whole point of measurement for acquisition, and none of it needs a single
 * fact about anybody's health.
 */

/* ------------------------------------------------------------------ *
 * The events
 * ------------------------------------------------------------------ */

/**
 * One name per thing worth counting, mapped to what each vendor calls it.
 *
 * Held here rather than at the call sites so the two networks cannot drift
 * apart: a conversion that Meta records as `CompleteRegistration` and Google
 * never hears about is the reason two dashboards disagree and nobody can say
 * which is right.
 *
 * The names are deliberately commercial rather than descriptive. `subscribed`
 * says money changed hands; it does not say what the person subscribed for,
 * because "falls prevention" in an event name is a health disclosure wearing
 * a marketing label.
 */
export const TRACKING_EVENTS = {
  page_view: { meta: 'PageView', google: 'page_view', because: 'Somebody arrived.' },
  view_pricing: { meta: 'ViewContent', google: 'view_item', because: 'They looked at what it costs.' },
  begin_signup: { meta: 'InitiateCheckout', google: 'begin_checkout', because: 'They opened the form.' },
  signed_up: { meta: 'CompleteRegistration', google: 'sign_up', because: 'An account now exists.' },
  subscribed: { meta: 'Subscribe', google: 'purchase', because: 'Money changed hands.' },
  started_trial: { meta: 'StartTrial', google: 'generate_lead', because: 'The free tier began.' },
  contact: { meta: 'Contact', google: 'contact', because: 'An organisation asked to talk.' },
} as const;

export type TrackingEvent = keyof typeof TRACKING_EVENTS;

export const TRACKING_EVENT_KEYS = Object.keys(TRACKING_EVENTS) as TrackingEvent[];

/* ------------------------------------------------------------------ *
 * Where tracking may run
 * ------------------------------------------------------------------ */

/**
 * Paths a tracker may exist on.
 *
 * An allowlist rather than a blocklist, because the failure modes are not
 * symmetrical. A page missing from an allowlist loses a measurement; a page
 * missing from a blocklist leaks. New health surfaces will be added to this
 * product for years, and none of them should have to remember to opt out.
 */
export const TRACKABLE_PREFIXES: readonly string[] = [
  '/',
  '/how-it-works',
  '/micro-movement',
  '/body-balance',
  '/foodlens',
  '/mova',
  '/challenges',
  '/wearables',
  '/for-adults',
  '/industries',
  '/growth',
  '/partner-programme',
  '/assurance',
  '/about',
  '/blog',
  '/get-started',
  '/try',
  '/pricing',
  '/contact',
];

/**
 * Paths no tracker may ever run on, whatever the allowlist says.
 *
 * Belt and braces: `/account` is not in the allowlist above, so this is a
 * second refusal for the same thing. The duplication is deliberate — one day
 * somebody will add a marketing landing page under `/account/…` and reach
 * for the allowlist without thinking about what else lives there.
 *
 * `/for-children` is here rather than merely absent because it is a
 * marketing page, and it is exactly the marketing page whose audience makes
 * an advertising pixel indefensible.
 */
export const NEVER_TRACKED_PREFIXES: readonly string[] = [
  '/account',
  '/console',
  '/for-children',
  '/unsubscribe',
  '/auth',
];

/**
 * Payload keys that must never reach either vendor.
 *
 * This list is enforced rather than documented — `scrubPayload` drops
 * anything matching, and a test asserts the enforcement. It exists because
 * the dangerous version of this feature is not somebody deciding to send
 * health data; it is somebody passing an object through to a pixel because
 * it happened to be in scope at the call site.
 */
export const FORBIDDEN_PAYLOAD_KEYS: readonly string[] = [
  'email', 'name', 'displayName', 'firstName', 'lastName', 'phone', 'address', 'postcode',
  'userId', 'guardianId', 'dateOfBirth', 'dob', 'age',
  'condition', 'conditions', 'medication', 'medications', 'diagnosis', 'symptom', 'symptoms',
  'weight', 'weightKg', 'height', 'heightCm', 'bmi', 'waist', 'waistCm', 'bodyFat',
  'kcal', 'calories', 'meal', 'food', 'foodLog', 'nutrition', 'protein', 'plantPoints',
  'falls', 'fallsRisk', 'strength', 'balance', 'mobility', 'steps', 'heartRate', 'sleep',
  'acu', 'acuBalance', 'wallet', 'token', 'password', 'sessionId', 'ip',
];

/* ------------------------------------------------------------------ *
 * The decision
 * ------------------------------------------------------------------ */

export interface TrackingContext {
  /** The visitor pressed accept. Nothing else counts as consent. */
  readonly consented: boolean;
  /** Path being viewed, without query or hash. */
  readonly path: string;
  /**
   * Known age, when there is a session. `null` means signed out — which is
   * the ordinary case on a marketing page and is allowed, because there is
   * nobody to profile and no account to attach anything to.
   */
  readonly age: number | null;
  /** Browser-level opt-out: Do Not Track or Global Privacy Control. */
  readonly browserOptOut: boolean;
}

export type TrackingRefusal =
  | 'no_consent'
  | 'browser_opt_out'
  | 'surface_not_permitted'
  | 'under_age';

export interface TrackingVerdict {
  readonly may: boolean;
  readonly refusal?: TrackingRefusal;
  readonly because: string;
}

/** The lowest age an advertising tracker may run for. */
export const TRACKING_MIN_AGE = 18;

function pathAllowed(path: string): boolean {
  const clean = (path.split('?')[0] ?? '/').replace(/\/+$/, '') || '/';
  if (NEVER_TRACKED_PREFIXES.some((p) => clean === p || clean.startsWith(`${p}/`))) return false;
  return TRACKABLE_PREFIXES.some((p) => (p === '/' ? clean === '/' : clean === p || clean.startsWith(`${p}/`)));
}

/**
 * Whether a tracker may run at all, here, now, for this person.
 *
 * Order matters only for the message, not the outcome — every clause is a
 * hard refusal. Browser opt-out is checked before consent so that somebody
 * who set Global Privacy Control and then clicked accept out of habit is
 * still refused: a browser-level signal is a standing instruction, and
 * honouring it only when it agrees with the banner is not honouring it.
 */
export function mayTrack(context: TrackingContext): TrackingVerdict {
  if (context.browserOptOut) {
    return {
      may: false,
      refusal: 'browser_opt_out',
      because: 'This browser sends Do Not Track or Global Privacy Control. That is an instruction.',
    };
  }
  if (!context.consented) {
    return {
      may: false,
      refusal: 'no_consent',
      because: 'Nobody has agreed. Nothing is loaded and neither network has been contacted.',
    };
  }
  if (!pathAllowed(context.path)) {
    return {
      may: false,
      refusal: 'surface_not_permitted',
      because: 'Advertising tags do not run on the account or on any health surface.',
    };
  }
  if (context.age !== null && context.age < TRACKING_MIN_AGE) {
    return {
      may: false,
      refusal: 'under_age',
      because: `Under ${TRACKING_MIN_AGE}. This platform does not profile children for advertising.`,
    };
  }
  return { may: true, because: 'Consented adult, on a public marketing page.' };
}

/**
 * Strip anything that must not leave, and refuse anything unrecognised.
 *
 * Allowlisted keys only. A payload is a small set of commercial facts — a
 * plan name, a currency, a value — and an object arriving with a key nobody
 * planned for is far more likely to be a leak than a feature.
 */
export const ALLOWED_PAYLOAD_KEYS: readonly string[] = ['value', 'currency', 'plan', 'source', 'content_name'];

export function scrubPayload(payload: Record<string, unknown> = {}): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!ALLOWED_PAYLOAD_KEYS.includes(key)) continue;
    if (FORBIDDEN_PAYLOAD_KEYS.includes(key)) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      clean[key] = value;
    }
  }
  return clean;
}

/** What the consent banner says. Kept here so the copy cannot drift from the rules. */
export const CONSENT_COPY = {
  title: 'Measure how people find us?',
  body:
    'We would like to use Meta and Google’s measurement tags on our public pages, so we can see which routes actually bring people here. They never run on your account, never on a health screen, and never for under-18s.',
  accept: 'Yes, that’s fine',
  decline: 'No thanks',
  detail:
    'Decline and nothing is loaded — neither company is contacted at all. You can change your mind at any time from the cookie policy.',
} as const;
