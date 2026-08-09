/**
 * Every linkable destination on this site, and the phrases that point at it.
 *
 * This module imports nothing. `blog.ts` needs it to tell a real path from
 * an invented one during the audit, and `link-graph.ts` needs both it and
 * `blog.ts` to build the graph — so the registry sits at the bottom where
 * neither has to reach around the other.
 *
 * Holding the destinations in one list is what lets the rest of the system
 * check a link rather than trust it. A model asked for internal links will
 * cheerfully invent `/blog/movement-guide` because it looks like the other
 * URLs; against this registry that is a blocker at audit time instead of a
 * 404 in production.
 */

/* ------------------------------------------------------------------ *
 * The registry
 * ------------------------------------------------------------------ */

export interface LinkTarget {
  /** Site-relative, always leading-slash, never trailing. */
  readonly path: string;
  readonly label: string;
  /** What a link to this page is promising the reader. */
  readonly summary: string;
  /**
   * Phrases that should become a link to this page when they appear in
   * prose. Longest match wins, so put the specific ones in.
   */
  readonly phrases: readonly string[];
  readonly cluster?: string;
  /**
   * A pillar is the page a cluster's articles link up to. Pillars are held
   * to a higher inbound-link standard than ordinary pages.
   */
  readonly kind: 'pillar' | 'product' | 'company' | 'legal' | 'entry';
  /** Excluded from the sitemap: private, transient or duplicate. */
  readonly noIndex?: boolean;
  /**
   * Reachable from the navigation or the footer, which every page carries.
   *
   * This is not decoration. A page in the site chrome has an inbound link
   * from every other page and is discovered on the first crawl; a page that
   * is not has to be found some other way, and if nothing else links to it
   * it is an orphan whatever the sitemap says. Marking it here is what lets
   * the graph tell those two situations apart instead of assuming.
   */
  readonly inChrome?: boolean;
}

export const LINK_TARGETS: readonly LinkTarget[] = [
  /* --- the pillars, which everything else points at --- */
  {
    path: '/micro-movement',
    label: 'Micro-movement',
    summary: 'What micro-movement is, and why the unit is a minute rather than an hour.',
    phrases: ['micro-movement', 'micro movement', 'movement snack', 'movement snacks', 'movement break'],
    cluster: 'micro-movement',
    kind: 'pillar',
    inChrome: true
  },
  {
    path: '/body-balance',
    label: 'BodyCommand',
    summary: 'Weight, waist and trend, read as a direction rather than a verdict.',
    phrases: ['body balance', 'bodycommand', 'waist measurement', 'weight trend'],
    cluster: 'weight-control',
    kind: 'pillar',
    inChrome: true
  },
  {
    path: '/foodlens',
    label: 'FoodLens 360°',
    summary: 'Reading a meal from a photograph, with the uncertainty stated rather than hidden.',
    phrases: ['foodlens', 'food lens', 'food photograph', 'photograph of a meal', 'plant points'],
    cluster: 'food-intelligence',
    kind: 'pillar',
    inChrome: true
  },
  {
    path: '/industries',
    label: 'For organisations',
    summary: 'Workplace movement programmes that report on a group and never on a person.',
    phrases: ['workplace programme', 'workforce reporting', 'k-anonymity', 'employer dashboard'],
    cluster: 'workplace',
    kind: 'pillar',
    inChrome: true
  },
  {
    path: '/for-children',
    label: 'For children',
    summary: 'Movement for ages 10 to 17, with no weight, no energy figures and no body talk.',
    phrases: ['for children', 'children', 'a minor', 'guardian visibility', 'school day'],
    cluster: 'children',
    kind: 'pillar',
    inChrome: true
  },

  /* --- product --- */
  {
    path: '/mova',
    label: 'MOVA',
    summary: 'The coach that answers in one line and never invents a number.',
    phrases: ['mova', 'the coach', 'coaching'],
    kind: 'product',
    inChrome: true
  },
  {
    path: '/how-it-works',
    label: 'How it works',
    summary: 'The whole platform end to end, in the order somebody meets it.',
    phrases: ['how it works', 'the platform', 'end to end'],
    kind: 'product',
    inChrome: true
  },
  {
    path: '/challenges',
    label: 'Challenges',
    summary: 'Group challenges that forgive a missed day rather than punishing it.',
    phrases: ['challenge', 'challenges', 'streak', 'habit streak'],
    kind: 'product',
    inChrome: true
  },
  {
    path: '/wearables',
    label: 'Wearables',
    summary: 'What a watch adds, and what it cannot settle on its own.',
    phrases: ['wearable', 'wearables', 'a watch', 'step count'],
    kind: 'product',
    inChrome: true
  },
  {
    path: '/for-adults',
    label: 'For adults',
    summary: 'The adult modes, and what each one shows.',
    phrases: ['for adults', 'adult mode'],
    kind: 'product',
    inChrome: true
  },
  {
    path: '/communications',
    label: 'Notifications',
    summary: 'When this platform speaks, and the far longer list of when it does not.',
    phrases: ['notification', 'notifications', 'nudge', 'nudges'],
    kind: 'product',
    inChrome: true
  },

  /* --- company and trust, which is where citations land --- */
  {
    path: '/about',
    label: 'About',
    summary: 'Who built this, and the constraints it was built under.',
    phrases: ['about us', 'who we are'],
    kind: 'company',
    inChrome: true
  },
  {
    path: '/privacy',
    label: 'Privacy',
    summary: 'What is stored, for how long, and what leaves the platform.',
    phrases: ['privacy', 'what we store', 'data protection'],
    kind: 'legal',
    inChrome: true
  },
  {
    path: '/policies',
    label: 'Policies',
    summary: 'The charter, the safeguarding rules and the editorial standard.',
    phrases: ['the charter', 'ethical gamification charter', 'safeguarding'],
    kind: 'legal',
    inChrome: true
  },
  {
    path: '/terms',
    label: 'Terms',
    summary: 'The agreement, in the plainest English it can be written in.',
    phrases: ['terms of service', 'the terms'],
    kind: 'legal',
    inChrome: true
  },
  {
    path: '/status',
    label: 'Status',
    summary: 'What is running right now, from the deployment rather than from a spreadsheet.',
    phrases: ['status page', 'uptime'],
    kind: 'company',
    inChrome: true
  },
  {
    path: '/assurance',
    label: 'Assurance',
    summary:
      'What the platform refuses to do, how each refusal is enforced, and the clinical hazard log in full.',
    phrases: [
      'assurance summary',
      'clinical safety',
      'clinical risk',
      'hazard log',
      'dcb0129',
      'dtac',
      'digital technology assessment criteria',
    ],
    kind: 'company',
    inChrome: true
  },
  {
    path: '/developers',
    label: 'Developers',
    summary: 'The API, and what it will and will not hand back.',
    phrases: ['the api', 'developers', 'integration'],
    kind: 'company',
    inChrome: true
  },
  {
    path: '/growth',
    label: 'Growth',
    summary: 'How this platform grows without buying attention.',
    phrases: ['referral programme', 'referrals'],
    kind: 'company',
    inChrome: true
  },
  {
    path: '/partner-programme',
    label: 'Partner programme',
    summary: 'Working with practitioners, clubs and employers.',
    phrases: ['partner programme', 'partners'],
    kind: 'company',
    inChrome: true
  },
  {
    path: '/blog',
    label: 'Blog',
    summary: 'Everything written down, including the decisions that went badly.',
    phrases: ['the blog', 'we wrote about'],
    kind: 'entry',
    inChrome: true
  },

  /* --- entry points --- */
  {
    path: '/',
    label: 'JESS MOVE',
    summary: 'The platform, in one page.',
    phrases: [],
    kind: 'entry',
    inChrome: true
  },
  {
    path: '/get-started',
    label: 'Get started',
    summary: 'What happens in the first five minutes.',
    phrases: ['get started', 'sign up'],
    kind: 'entry',
    inChrome: true
  },
  {
    path: '/try',
    label: 'Try it',
    summary: 'The platform, without an account.',
    phrases: ['try it', 'without an account'],
    kind: 'entry',
    inChrome: true
  },
  {
    path: '/contact',
    label: 'Contact',
    summary: 'How to reach a person.',
    phrases: ['contact us'],
    kind: 'company',
    inChrome: true
  },

  /* --- signed-in surfaces, deliberately kept out of the index --- */
  { path: '/account', label: 'Your account', summary: 'Everything signed in: the ledger, the coach and the insight.', phrases: [], kind: 'entry', noIndex: true },
  { path: '/console', label: 'Console', summary: 'The staff console, behind a session and a role.', phrases: [], kind: 'entry', noIndex: true },
  { path: '/offline', label: 'Offline', summary: 'What the installed app shows when the network has gone.', phrases: [], kind: 'entry', noIndex: true },
];

const BY_PATH = new Map(LINK_TARGETS.map((t) => [t.path, t]));

export function normalisePath(path: string): string {
  const trimmed = path.trim().split(/[?#]/)[0] ?? '';
  if (!trimmed || trimmed === '/') return '/';
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withSlash.replace(/\/+$/, '') || '/';
}

/** Is this a real destination on this site? Blog posts count, given the slugs. */
export function isKnownPath(path: string, postSlugs: readonly string[] = []): boolean {
  const p = normalisePath(path);
  if (BY_PATH.has(p)) return true;
  const slug = p.startsWith('/blog/') ? p.slice('/blog/'.length) : null;
  return slug !== null && postSlugs.includes(slug);
}

export function targetFor(path: string): LinkTarget | null {
  return BY_PATH.get(normalisePath(path)) ?? null;
}

/** Everything a crawler should be offered, in the order it should meet it. */
export function indexablePaths(): readonly string[] {
  return LINK_TARGETS.filter((t) => !t.noIndex).map((t) => t.path);
}

