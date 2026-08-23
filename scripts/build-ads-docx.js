/**
 * JESS MOVE — Meta awareness campaign bundle, as a Word document.
 *
 * A copy-and-paste pack: somebody opens this next to Ads Manager, selects a
 * block, pastes it, and moves on. That shapes every formatting decision —
 * the pasteable text is set in a monospaced face on a tinted panel so it is
 * visually obvious what is copy and what is instruction, and the character
 * counts beside each block are measured here rather than estimated, because
 * a headline that turns out to be 46 characters gets truncated in the feed
 * and nobody notices until the campaign is live.
 *
 *   pnpm docs:ads
 */
const fs = require('fs');
const path = require('path');
const {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} = require('docx');

/* ---------------- brand ---------------- */
const NAVY = '102A43';
const TEAL = '00786C'; // darkened from the screen teal so it is readable in print
const LIME = '5E7A0F';
const RUST = 'A8481B';
const SLATE = '536575';
const RULE = 'DCE6E4';
const TINT = 'EFF5F4';
const PASTE = 'F4F7F7';

const FONT = 'Calibri';
const MONO = 'Consolas';

/* ---------------- helpers ---------------- */

const P = (text, o = {}) =>
  new Paragraph({
    spacing: { after: o.after ?? 140, line: 276 },
    alignment: o.align,
    children: [
      new TextRun({
        text,
        font: o.font ?? FONT,
        size: o.size ?? 21,
        bold: o.bold,
        italics: o.italics,
        color: o.color ?? '1A1A1A',
      }),
    ],
  });

const RICH = (parts, o = {}) =>
  new Paragraph({
    spacing: { after: o.after ?? 140, line: 276 },
    children: parts.map(
      ([text, f = {}]) =>
        new TextRun({
          text,
          font: f.font ?? FONT,
          size: f.size ?? o.size ?? 21,
          bold: f.bold,
          italics: f.italics,
          color: f.color ?? '1A1A1A',
        }),
    ),
  });

const H1 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 420, after: 80 },
    pageBreakBefore: true,
    children: [new TextRun({ text, font: FONT, size: 32, bold: true, color: NAVY })],
  });

const H2 = (text, color = NAVY) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 90 },
    children: [new TextRun({ text, font: FONT, size: 25, bold: true, color })],
  });

const H3 = (text, color = TEAL) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 60 },
    children: [new TextRun({ text, font: FONT, size: 22, bold: true, color })],
  });

const EYEBROW = (text, color = SLATE) =>
  new Paragraph({
    spacing: { before: 180, after: 50 },
    children: [
      new TextRun({
        text,
        font: FONT,
        size: 16,
        bold: true,
        color,
        allCaps: true,
        characterSpacing: 40,
      }),
    ],
  });

const BULLET = (text) =>
  new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 70, line: 276 },
    children: [new TextRun({ text, font: FONT, size: 21, color: '1A1A1A' })],
  });

const HR = () =>
  new Paragraph({
    spacing: { before: 160, after: 160 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE } },
    children: [new TextRun({ text: '', size: 2 })],
  });

/** A callout panel — used for the things that cost money if ignored. */
const PANEL = (title, lines, colour = TEAL) => [
  new Paragraph({
    spacing: { before: 200, after: 40 },
    shading: { type: ShadingType.CLEAR, fill: TINT, color: 'auto' },
    indent: { left: 160, right: 160 },
    border: { left: { style: BorderStyle.SINGLE, size: 18, color: colour } },
    children: [new TextRun({ text: title, font: FONT, size: 21, bold: true, color: NAVY })],
  }),
  ...lines.map(
    (line, i) =>
      new Paragraph({
        spacing: { after: i === lines.length - 1 ? 200 : 70, line: 276 },
        shading: { type: ShadingType.CLEAR, fill: TINT, color: 'auto' },
        indent: { left: 160, right: 160 },
        border: { left: { style: BorderStyle.SINGLE, size: 18, color: colour } },
        children: [new TextRun({ text: line, font: FONT, size: 20, color: '1A1A1A' })],
      }),
  ),
];

/**
 * A pasteable block.
 *
 * Monospaced on a tinted panel so it is unmistakable at a glance which text
 * goes into Ads Manager and which text is advice about it. The label line
 * carries the measured character count, and says where the feed truncates.
 */
const COPY_BLOCK = (label, text, limit) => {
  const chars = text.length;
  let meta = `${chars} characters`;
  if (limit && chars > limit) meta += ` — cut at ${limit} on mobile`;
  else if (limit) meta += ` — fits`;

  const out = [
    new Paragraph({
      spacing: { before: 180, after: 0 },
      children: [
        new TextRun({ text: label, font: FONT, size: 16, bold: true, color: TEAL, allCaps: true, characterSpacing: 30 }),
        new TextRun({ text: `   ${meta}`, font: FONT, size: 16, color: SLATE }),
      ],
    }),
  ];

  for (const line of text.split('\n')) {
    out.push(
      new Paragraph({
        spacing: { after: 0, line: 260 },
        shading: { type: ShadingType.CLEAR, fill: PASTE, color: 'auto' },
        indent: { left: 140, right: 140 },
        children: [new TextRun({ text: line || ' ', font: MONO, size: 19, color: '1A1A1A' })],
      }),
    );
  }
  out.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: '', size: 2 })] }));
  return out;
};

/* ---------------- tables ---------------- */

const TABLE_W = 9360;

function table(headers, rows, widths) {
  const cell = (text, o = {}) =>
    new TableCell({
      width: { size: o.w, type: WidthType.DXA },
      shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill, color: 'auto' } : undefined,
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [
        new Paragraph({
          spacing: { after: 0, line: 250 },
          children: [
            new TextRun({
              text,
              font: o.mono ? MONO : FONT,
              size: o.head ? 16 : 19,
              bold: o.head || o.bold,
              color: o.head ? 'FFFFFF' : o.color ?? '1A1A1A',
              allCaps: o.head,
              characterSpacing: o.head ? 20 : undefined,
            }),
          ],
        }),
      ],
    });

  return new Table({
    columnWidths: widths,
    width: { size: TABLE_W, type: WidthType.DXA },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: RULE },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: RULE },
      left: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      right: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: RULE },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: 'auto' },
    },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((h, i) => cell(h, { w: widths[i], head: true, fill: NAVY })),
      }),
      ...rows.map(
        (r, ri) =>
          new TableRow({
            children: r.map((c, i) =>
              cell(c, {
                w: widths[i],
                bold: i === 0,
                mono: ri >= 0 && i === widths.length - 1 && c.startsWith('£'),
                fill: ri % 2 === 1 ? 'F8FBFA' : undefined,
              }),
            ),
          }),
      ),
    ],
  });
}

/* ============================================================
   Content
   ============================================================ */

const body = [];

/* ---- cover ---- */
body.push(
  new Paragraph({ spacing: { before: 1200, after: 0 }, children: [new TextRun({ text: '' })] }),
  new Paragraph({
    spacing: { after: 40 },
    children: [
      new TextRun({ text: 'JESS MOVE', font: FONT, size: 60, bold: true, color: NAVY, characterSpacing: 30 }),
    ],
  }),
  new Paragraph({
    spacing: { after: 300 },
    children: [new TextRun({ text: 'Small Moves. Powerful Change.', font: FONT, size: 28, color: TEAL })],
  }),
  new Paragraph({
    spacing: { after: 60 },
    border: { top: { style: BorderStyle.SINGLE, size: 12, color: TEAL } },
    children: [new TextRun({ text: '', size: 2 })],
  }),
  new Paragraph({
    spacing: { before: 240, after: 60 },
    children: [
      new TextRun({ text: 'Facebook campaign bundle', font: FONT, size: 34, bold: true, color: '1A1A1A' }),
    ],
  }),
  P(
    'Everything except the pictures. One campaign, three ad sets, four concepts, eight primary texts, ' +
      'thirteen headlines — written to be pasted straight into Ads Manager, and written to survive ' +
      'Meta’s health advertising review, which is where most wellbeing ads die before anybody sees them.',
    { size: 22, color: SLATE, after: 300 },
  ),
  ...PANEL(
    'The one change to the brief',
    [
      'You asked for an Awareness campaign. Run Traffic instead, optimised for landing page views.',
      'Section 1 explains why in full. Everything in this document is built around that choice.',
    ],
    RUST,
  ),
  P('Prepared for: Justin Nseya   ·   Market: Greater Manchester   ·   Budget: £15/day, 14 days', {
    size: 18,
    color: SLATE,
  }),
);

/* ---- 1. the objective ---- */
body.push(
  H1('1. Awareness or Traffic — and why it matters more than the copy'),
  P(
    'You asked for awareness because the product is new, and the instinct is right: nobody knows ' +
      'the name, so the first job is to be seen. The disagreement is not about the goal. It is about ' +
      'which Meta setting actually delivers it.',
  ),
  H3('What the Awareness objective actually buys'),
  P(
    'Meta’s Awareness objective optimises for reach and estimated ad recall lift. It finds the ' +
      'cheapest people to show an advert to, and it counts an impression as a success. It does not ' +
      'care whether anybody visits the site, and at this budget it will happily spend two weeks ' +
      'showing Jess Move to people who scroll past without pausing.',
  ),
  P(
    'The number it hands back is reach — and reach has never told anybody whether a product is ' +
      'wanted. You would finish the fortnight with a large, encouraging figure and no idea what to ' +
      'do next.',
  ),
  H3('What Traffic buys instead'),
  P(
    'Traffic, with the performance goal set to landing page views, reaches a comparable number of ' +
      'people at this spend — but it optimises for the ones who click and wait for the page to load. ' +
      'That single difference gives you three things Awareness cannot.',
  ),
  BULLET(
    'A real signal. Cost per landing page view tells you whether the proposition is interesting to ' +
      'anybody. Reach tells you the budget was spent.',
  ),
  BULLET(
    'A retargeting audience. Everybody who lands becomes a warm audience you can advertise to later ' +
      'for a fraction of the price. This is the most valuable asset a first campaign produces, and ' +
      'an Awareness campaign produces almost none of it.',
  ),
  BULLET(
    'The second half of your own brief. You said awareness, and then keep them on the site. Traffic ' +
      'is the setting that does the "keep them on the site" part.',
  ),
  ...PANEL(
    'The short version',
    [
      'Awareness answers "how many people saw it". Traffic answers "did anybody care".',
      'At £15 a day in one city, the second question is the only one worth £210.',
      'You still get the awareness. You simply also find out whether it worked.',
    ],
    TEAL,
  ),
  H3('When Awareness would be the right call'),
  P(
    'It is not always wrong. Choose Awareness when the budget is large enough that frequency alone ' +
      'moves a market, when there is a broadcast moment to support — a launch event, a press push, ' +
      'a sponsorship — or when the product cannot be bought online and a website visit means nothing. ' +
      'None of those describe where Jess Move is this month.',
  ),
  P(
    'Revisit it when there is a real budget behind a real moment. For now, the campaign has to earn ' +
      'its next campaign, and it does that by producing an audience rather than an impression count.',
    { italics: true, color: SLATE },
  ),
);

/* ---- 2. before you spend ---- */
body.push(
  H1('2. Two things to do before you spend a pound'),
  P('Both are quick. Both decide whether the fortnight teaches you anything.'),

  H3('The pixel is built, and switched off'),
  P(
    'The Meta Pixel is already in the site — consent-gated, verified in a browser, and doing nothing ' +
      'at all until NEXT_PUBLIC_META_PIXEL_ID is set in Vercel. Set it before the ads go live. Without ' +
      'it the first fortnight of traffic builds no retargeting audience, and that warm pool is the ' +
      'main thing this campaign exists to produce.',
  ),
  P(
    'Then expect Meta to undercount. The pixel only fires for visitors who accept the consent banner, ' +
      'so Ads Manager will report fewer landing page views than really happened. Treat its number as a ' +
      'floor and judge the campaign on your own funnel screen, which sees everybody.',
  ),

  H3('Nobody has reviewed this copy yet'),
  P(
    'Jess Move’s standing rule is that nothing written about health reaches the public without a ' +
      'named person reading it first. That is a clinical safety control and it applies to an advert ' +
      'exactly as it applies to an article. Read every line in section 5 and put your name to it ' +
      'before it runs.',
  ),
  P(
    'The copy has been written to make no health claim at all — every line is about the day, never ' +
      'about the reader’s body — but written carefully is not the same as approved.',
    { italics: true, color: SLATE },
  ),
);

/* ---- 3. structure ---- */
body.push(
  H1('3. Campaign structure'),
  P('One campaign, three ad sets, the same four creatives in each — so the audience is what you are testing.'),
  table(
    ['Level', 'Setting', 'Value'],
    [
      ['Campaign', 'Objective', 'Traffic'],
      ['', 'Budget', 'Campaign budget optimisation, £15/day'],
      ['', 'Special ad category', 'None'],
      ['Ad set', 'Conversion location', 'Website'],
      ['', 'Performance goal', 'Maximise number of landing page views'],
      ['', 'Placements', 'Advantage+ placements (all)'],
      ['', 'Age', '18 to 65+'],
      ['', 'Schedule', '14 days, no dayparting'],
      ['Ad', 'Format', 'Single image — 1:1 and 4:5'],
      ['', 'Call to action', 'Learn more'],
      ['', 'Destination', 'https://www.jessmove.com'],
    ],
    [1700, 3200, 4460],
  ),
  ...PANEL(
    'Age 18+ is not optional',
    [
      'The product serves ages 10 to 100. The advertising does not.',
      'Never target under-18s, and never run a creative that shows a child as the user — Jess Move',
      'publishes a commitment not to profile children for advertising, and an ad set contradicts a',
      'policy page louder than the policy page can answer.',
    ],
    RUST,
  ),
);

/* ---- 4. ad sets ---- */
body.push(
  H1('4. The three ad sets'),
  P('Copy each block into the audience fields as written.'),
  ...COPY_BLOCK(
    'Ad set 1 — Broad',
    `Location: Greater Manchester (+10 mile radius)
Age: 18–65+
Gender: All
Detailed targeting: none
Advantage detailed targeting: on
Languages: English (UK), English (US)`,
  ),
  ...COPY_BLOCK(
    'Ad set 2 — Later life and movement',
    `Location: Greater Manchester (+10 mile radius)
Age: 45–65+
Gender: All
Interests: Walking, Physical fitness, Healthy diet, Yoga, Pilates, Retirement, Age UK
Advantage detailed targeting: on
Languages: English (UK), English (US)`,
  ),
  ...COPY_BLOCK(
    'Ad set 3 — People who look after someone',
    `Location: Greater Manchester (+10 mile radius)
Age: 35–60
Gender: All
Interests: Caregiver, Elderly care, Family caregivers, Parenting, Home care
Behaviours: Parents (All)
Advantage detailed targeting: on
Languages: English (UK), English (US)`,
  ),
  P(
    'Why one city rather than the whole country: £15 a day across the UK is invisible. Across Greater ' +
      'Manchester it is enough frequency for a name to start meaning something, and it is where the ' +
      'referral work is already happening — so the ads and the rooms reinforce each other instead of ' +
      'competing for the same small budget.',
    { italics: true, color: SLATE },
  ),
);

/* ---- 5. the copy ---- */
const HEAD_LIMIT = 40;
const DESC_LIMIT = 30;
const PRIM_LIMIT = 125;

body.push(
  H1('5. The copy'),
  P(
    'Four concepts. Each gives you two primary texts, headlines and descriptions — build one ad per ' +
      'concept, per ad set. Character counts below are measured, not estimated.',
  ),
  ...PANEL(
    'How to read the counts',
    [
      'Headlines are cut at about 40 characters, link descriptions at about 30.',
      'Primary text has no hard limit, but a phone hides everything past roughly 125 characters',
      'behind "See more" — so the hook has to land inside the first sentence.',
    ],
    TEAL,
  ),
);

const CONCEPTS = [
  {
    id: 'Concept A',
    name: 'Two minutes',
    tag: 'Lead with this one',
    why:
      'The product’s actual position: not a fitness app, a product about the day you already have. ' +
      'It makes no health claim, so it is the safest with Meta’s reviewers and the most distinct ' +
      'against every other wellbeing advert in the feed.',
    primaries: [
      'Most days have more room in them than they look. Jess Move finds the two-minute gaps you already have — between meetings, waiting for the kettle, before the school run — and turns them into movement that actually fits. Free to start, no card.',
      'Not a fitness app. A product about the day you already have. Two minutes at a time, for anyone from 10 to 100. Free to start, no card.',
    ],
    headlines: [
      "Two minutes. That's the whole idea.",
      'Your day already has room in it',
      'Movement that fits the day you have',
      'Start with two minutes',
    ],
    descriptions: ['Free to start. No card.', 'Two minutes at a time.', 'See how it works'],
    picture:
      'An ordinary moment with a gap in it — a kettle boiling, a kitchen chair, a hallway. Somebody ' +
      'mid-movement, unposed, in normal clothes. Not a gym, not lycra, not a yoga mat.',
  },
  {
    id: 'Concept B',
    name: 'Ten to a hundred',
    tag: 'Most differentiated',
    why:
      'No competitor serves a ten-year-old and a ninety-year-old on one account. This is the line ' +
      'nobody else can run, and it sells the Family plan without mentioning a price.',
    primaries: [
      'One account covers the whole household — a ten-year-old and a ninety-year-old, each getting something built for them, on the same plan.',
      'Six modes, one product. What a fifteen-year-old sees and what a seventy-five-year-old sees are not the same thing, and neither is a watered-down version of the other.',
    ],
    headlines: ['Built for ages 10 to 100', 'One account. The whole household.', 'Six modes, one product'],
    descriptions: ['Ages 10 to 100.', 'Free to start. No card.', 'Up to 6 people'],
    picture:
      'Two generations in one frame doing the same small thing — a grandparent and a grandchild both ' +
      'standing up from a chair. Warm, domestic, unstaged. The image nobody else in the category can use.',
  },
  {
    id: 'Concept C',
    name: 'What it refuses to do',
    tag: 'Trust play',
    why:
      'Everybody in this category over-promises, so the product that publishes its refusals stands ' +
      'out by contrast. It is also true — the hazard log and the assurance page are live — which is ' +
      'what allows it to be said in an advert at all.',
    primaries: [
      'It tells you what it will not do. No targets you can fail. No score pretending to be a diagnosis. Nothing sold to advertisers, ever.',
      'Most wellbeing apps are confident about your body. This one publishes the list of things it refuses to guess at, and keeps to it.',
    ],
    headlines: ["It tells you what it won't do", 'No targets you can fail', 'Read what it refuses to do'],
    descriptions: ['Published, not promised.', 'Free to start. No card.', 'See the full list'],
    picture:
      'Typographic, no photograph at all. Deep navy ground, the refusals set as plain text. It will ' +
      'look unlike everything around it in the feed, which is the entire point.',
  },
  {
    id: 'Concept D',
    name: 'For whoever you look after',
    tag: 'Ad set 3 only',
    why:
      'Speaks to the buyer rather than the user — the adult child, the person who took a parent to ' +
      'the class. Written so it never says anything about the reader’s health, or anybody else’s.',
    primaries: [
      'If you look after someone, you already know the hard part is the week after the class ends. This is built for that week.',
      'Two minutes of movement, on a phone that is already in the room. Built for ages 10 to 100, so it works for both of you.',
    ],
    headlines: ['For whoever you look after', 'The week after the class ends', 'Something for both of you'],
    descriptions: ['Free to start. No card.', 'Ages 10 to 100.', 'No card needed'],
    picture:
      'Two people, one phone, side by side — the caring gesture, not the care task. Faces relaxed. ' +
      'Nothing that reads as medical: no clinic, no walking frame, no uniform.',
  },
];

for (const c of CONCEPTS) {
  body.push(H2(`${c.id} — ${c.name}`), EYEBROW(c.tag, TEAL), P(c.why, { color: SLATE }));
  c.primaries.forEach((t, i) => body.push(...COPY_BLOCK(`Primary text ${i + 1}`, t, PRIM_LIMIT)));
  body.push(...COPY_BLOCK('Headlines — one per ad', c.headlines.join('\n'), HEAD_LIMIT));
  body.push(...COPY_BLOCK('Descriptions', c.descriptions.join('\n'), DESC_LIMIT));
  body.push(RICH([['Picture brief.  ', { bold: true, color: NAVY }], [c.picture, {}]], { after: 200 }));
  body.push(HR());
}

/* ---- 6. creative rules ---- */
body.push(
  H1('6. What gets a wellbeing advert rejected'),
  P(
    'Meta reviews health and wellbeing advertising harder than almost any other category. These are ' +
      'the five things that get an advert refused, and the reason every line of copy above talks ' +
      'about the day rather than about the reader.',
  ),
  BULLET('Before-and-after images. Banned outright, and so are side-by-side body comparisons.'),
  BULLET('Close-ups of a body part — a waist, a stomach, a set of scales. Banned.'),
  BULLET(
    'Implying you know something about the viewer. "Struggling with your weight?" and "Worried about ' +
      'falling?" both breach the personal attributes policy, however sympathetic the intent.',
  ),
  BULLET('Health outcome claims. No numbers about weight, mobility, risk or recovery.'),
  BULLET('Medical imagery. Clinics, uniforms, walking frames, pill boxes, hospital corridors.'),
  P(''),
  table(
    ['Asset', 'Size', 'Use'],
    [
      ['Square', '1080 × 1080', 'Feed, the workhorse — make this one first'],
      ['Portrait', '1080 × 1350', 'Taller feed placements, more screen for the same spend'],
      ['Story', '1080 × 1920', 'Optional. Only if you have a version that suits full bleed'],
    ],
    [1900, 2300, 5160],
  ),
  P(
    'Keep text on the image light. The old 20% rule is gone, but text-heavy images still lose reach, ' +
      'and the headline field already carries the words.',
    { italics: true, color: SLATE },
  ),
);

/* ---- 7. naming and links ---- */
body.push(
  H1('7. Naming and links'),
  P('Paste these as you build, so the reporting is readable in a fortnight when it matters.'),
  ...COPY_BLOCK(
    'Naming convention',
    `Campaign:  JM | AWARENESS | GM | TRAFFIC-LPV | 2026-08
Ad set 1:  GM | BROAD | 18-65
Ad set 2:  GM | LATERLIFE | 45-65
Ad set 3:  GM | CARERS | 35-60
Ad:        A1-TWOMINUTES | 1x1
           A2-TWOMINUTES | 4x5
           B1-TENTOHUNDRED | 1x1
           C1-REFUSALS | 1x1
           D1-LOOKAFTER | 1x1`,
  ),
  ...COPY_BLOCK(
    'Destination URL — change the last tag per ad',
    'https://www.jessmove.com/?utm_source=facebook&utm_medium=paid&utm_campaign=awareness-gm-2026-08&utm_content=a1-twominutes',
  ),
  P(
    'Send people to the homepage, not to a landing page that does not exist yet. The homepage already ' +
      'reaches registration in one press, and a build check fails if that ever regresses. A new landing ' +
      'page is a new thing to get wrong under time pressure — spend the effort on the pictures instead.',
    { italics: true, color: SLATE },
  ),
);

/* ---- 8. measurement ---- */
body.push(
  H1('8. What to look at, and when'),
  P('The temptation is to check hourly. This is the schedule that actually tells you something.'),
  table(
    ['When', 'Look at', 'Do'],
    [
      ['Day 1–3', 'Delivery only — is it spending?', 'Nothing. Editing during the learning phase resets it. If one ad is rejected, fix that ad and leave the rest alone.'],
      ['Day 4', 'CPM, CTR, landing page views', 'Pause any single ad below 0.5% CTR while others are above 1%. Do not touch the ad sets.'],
      ['Day 7', 'Cost per landing page view, by ad set', 'Move budget toward the best ad set. Compare Meta’s count against your own funnel — the gap is the consent decline rate.'],
      ['Day 10', 'Your funnel: landed → viewed ask → opened', 'If people land and nobody opens an account, the problem is the page, not the advert. Stop adding spend.'],
      ['Day 14', 'Everything, plus retargeting pool size', 'Decide: stop, continue, or scale. A pool of 1,000+ visitors is what makes the next campaign cheap.'],
    ],
    [1200, 2900, 5260],
  ),
  ...PANEL(
    'The numbers that mean it is working',
    [
      'CPM under £12.   CTR above 1%.   Cost per landing page view under £0.60.',
      'These are typical UK figures for a local campaign at this budget — a starting expectation,',
      'not a promise. Your first fortnight replaces them with real ones.',
      '',
      'The number that matters most is on your own funnel screen: of the people who land, how many',
      'go on to open the account page? Meta cannot tell you that. Your instrumentation can.',
    ],
    LIME,
  ),
  ...PANEL(
    'Two numbers to ignore',
    [
      'Reach and impressions. They rise whatever you do, they always look encouraging, and neither',
      'has ever told anybody whether a product is wanted. If you catch yourself quoting reach, look',
      'at cost per landing page view instead.',
    ],
    RUST,
  ),
);

/* ---- 9. audiences ---- */
body.push(
  H1('9. Build these audiences on day one'),
  P('They cost nothing, they need the pixel live, and they are what the next campaign runs on.'),
  ...COPY_BLOCK(
    'Custom audiences to create now',
    `1. Website — All visitors — 180 days
2. Website — Visited /blog — 180 days
3. Website — Visited /get-started but did not register — 90 days
4. Engagement — Everyone who engaged with the Facebook page — 365 days
5. Engagement — Everyone who engaged with the Instagram account — 365 days`,
  ),
  H3('And marketwaros.com — nothing yet, deliberately'),
  P(
    'Two new products advertised at once out of one small budget produces two campaigns nobody can ' +
      'read, and neither gets enough frequency to register. Get Jess Move to a repeatable number ' +
      'first. The audiences above transfer, so the second product launches into a warm pool instead ' +
      'of a cold one — which is worth more than a fortnight of head start.',
  ),
);

/* ---- close ---- */
body.push(
  H1('10. The first hour'),
  P('If nothing else in this document happens, these six things should.'),
  BULLET('Set NEXT_PUBLIC_META_PIXEL_ID in Vercel and confirm the pixel fires after accepting the banner.'),
  BULLET('Read section 5 end to end and put your name to it.'),
  BULLET('Create the five custom audiences, so they start filling from the first click.'),
  BULLET('Build the four square images. Concept A first — it is the one to lead with.'),
  BULLET('Set the campaign to Traffic, landing page views, £15 a day, fourteen days.'),
  BULLET('Write today’s funnel numbers down, so in two weeks you can tell whether any of this worked.'),
  P(''),
  P(
    'Prices, plan structure, the free tier and the age range in this document are read from the ' +
      'platform’s own configuration. Character counts are measured. Benchmark ranges are typical UK ' +
      'figures offered as a starting expectation, not a promise.',
    { size: 18, color: SLATE, italics: true },
  ),
);

/* ============================================================
   Document
   ============================================================ */

const doc = new Document({
  creator: 'JESS MOVE',
  title: 'Jess Move — Facebook awareness campaign bundle',
  description: 'Copy-and-paste Meta campaign pack: structure, targeting, copy, creative briefs and measurement.',
  styles: {
    default: {
      document: { run: { font: FONT, size: 21 } },
    },
  },
  sections: [
    {
      properties: {
        page: { margin: { top: 1000, bottom: 1000, left: 1080, right: 1080 } },
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({
                  text: 'JESS MOVE · Facebook campaign bundle · page ',
                  font: FONT,
                  size: 16,
                  color: SLATE,
                }),
                new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: SLATE }),
              ],
            }),
          ],
        }),
      },
      children: body,
    },
  ],
});

const OUT = path.join(__dirname, '..', 'docs', 'JESS-MOVE-Facebook-Campaign-Bundle.docx');

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUT, buf);
  console.log('written', buf.length, 'bytes ->', path.relative(process.cwd(), OUT));
});
