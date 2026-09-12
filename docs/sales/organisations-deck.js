/*
 * The corporate deck.
 *
 * Rule one, and it governs everything else: no invented proof. There are
 * no customers yet, no measured outcomes and no case studies, so there
 * are no logos, no testimonials, no "trusted by" and no ROI figure
 * presented as a result. Every number here comes from the codebase and is
 * a property of the product rather than a claim about the market.
 *
 * What replaces proof is verifiability — architecture a buyer's own
 * security and legal people can check, and public endpoints they can call
 * during the meeting.
 */
const pptxgen = require('pptxgenjs');

const NAVY = '102A43';
const TEAL = '00A99D';
const LIME = 'B7E436';
const CORAL = 'FF6B5E';
const INK = '102A43';
const INK2 = '475663';
const PAPER = 'FFFFFF';
const MIST = 'F4F7F9';

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE'; // 13.3 x 7.5
pres.author = 'JESS MOVE';
pres.company = 'JESS MOVE';
pres.title = 'JESS MOVE — for organisations';

const W = 13.3;
const M = 0.8; // margin

/* ── helpers ─────────────────────────────────────────────────────── */

const darkSlide = () => {
  const s = pres.addSlide();
  s.background = { color: NAVY };
  return s;
};
const lightSlide = () => {
  const s = pres.addSlide();
  s.background = { color: PAPER };
  return s;
};

/** The repeated motif: a small teal dot before every eyebrow. */
function eyebrow(slide, text, y, onDark) {
  slide.addShape(pres.ShapeType.ellipse, {
    x: M, y: y + 0.055, w: 0.13, h: 0.13,
    fill: { color: onDark ? LIME : TEAL },
  });
  slide.addText(text.toUpperCase(), {
    x: M + 0.26, y, w: 8, h: 0.3,
    fontSize: 12, bold: true, charSpacing: 2,
    color: onDark ? LIME : TEAL,
    fontFace: 'Arial', isTextBox: true, margin: 0,
  });
}

function title(slide, text, y, onDark, size) {
  slide.addText(text, {
    x: M, y, w: W - M * 2, h: 1.1,
    fontSize: size || 38, bold: true,
    color: onDark ? PAPER : INK,
    fontFace: 'Cambria', isTextBox: true, margin: 0,
  });
}

/** A content card. Tint + shadow, never an edge stripe. */
function card(slide, x, y, w, h, fill) {
  slide.addShape(pres.ShapeType.roundRect, {
    x, y, w, h, rectRadius: 0.08,
    fill: { color: fill || MIST },
    line: { color: fill || MIST, width: 0 },
    shadow: { type: 'outer', angle: 90, blur: 10, offset: 0.04, color: '9AA8B4', opacity: 0.25 },
  });
}

function notes(slide, text) {
  slide.addNotes(text);
}

/* ── 1 · title ───────────────────────────────────────────────────── */
{
  const s = darkSlide();
  s.addShape(pres.ShapeType.ellipse, {
    x: M, y: 1.85, w: 0.22, h: 0.22, fill: { color: TEAL },
  });
  s.addText('JESS MOVE', {
    x: M + 0.38, y: 1.78, w: 8, h: 0.4,
    fontSize: 17, bold: true, charSpacing: 5, color: PAPER,
    fontFace: 'Arial', isTextBox: true, margin: 0,
  });
  s.addText('Movement that fits\nthe working day.', {
    x: M, y: 2.4, w: 9.6, h: 2.2,
    fontSize: 52, bold: true, color: PAPER, lineSpacing: 56,
    fontFace: 'Cambria', isTextBox: true, margin: 0,
  });
  s.addText('Small Moves. Powerful Change.', {
    x: M, y: 4.7, w: 8, h: 0.4,
    fontSize: 18, italic: true, color: LIME,
    fontFace: 'Calibri', isTextBox: true, margin: 0,
  });
  s.addText('A workplace movement and food-intelligence platform for ages 10 to 100 — built so an employer can run a programme without ever seeing one employee.', {
    x: M, y: 5.35, w: 10.2, h: 0.9,
    fontSize: 14, color: 'B8C6D1', lineSpacing: 22,
    fontFace: 'Calibri', isTextBox: true, margin: 0,
  });
  s.addText('Design partner programme · 2026', {
    x: M, y: 6.55, w: 8, h: 0.3,
    fontSize: 11, color: 'A7B8C6', charSpacing: 1,
    fontFace: 'Arial', isTextBox: true, margin: 0,
  });
  notes(s, 'Open by naming the status honestly: we are pre-launch and choosing a small number of design partners. That is the offer, not a weakness to hide.');
}

/* ── 2 · where we are ────────────────────────────────────────────── */
{
  const s = lightSlide();
  eyebrow(s, 'Where we actually are', 0.7);
  title(s, 'No customers yet. That is the offer.', 1.15);

  s.addText('Most vendors you meet will show you logos and a case study. We have neither, and saying so is the point — you are not buying a finished programme, you are shaping one. What exists is the platform, built and tested; what does not exist is a track record.', {
    x: M, y: 2.3, w: 6.3, h: 1.5,
    fontSize: 15, color: INK2, lineSpacing: 25,
    fontFace: 'Calibri', isTextBox: true, margin: 0,
  });

  /*
   * The counted facts, rather than a market statistic. 942 is the actual
   * total reported by `pnpm test` across the monorepo, and 8 is
   * `K_ANONYMITY_THRESHOLD` — the reporting floor, enforced in SQL.
   */
  const stats = [
    ['942', 'automated tests in\nthe repository today'],
    ['8', 'people needed before\na figure is reported'],
    ['0', 'organisations that have\nrun a cohort so far'],
  ];
  let sx = M;
  stats.forEach(([n, label]) => {
    s.addText(n, {
      x: sx, y: 4.1, w: 2.0, h: 0.75,
      fontSize: 40, bold: true, color: TEAL, fontFace: 'Cambria', isTextBox: true, margin: 0,
    });
    s.addText(label, {
      x: sx, y: 4.92, w: 2.0, h: 0.7,
      fontSize: 11, color: INK2, lineSpacing: 15, fontFace: 'Calibri', isTextBox: true, margin: 0,
    });
    sx += 2.15;
  });

  const rows = [
    ['Built and tested', 'Safeguarding and privacy rules enforced in the database, not the interface.', TEAL],
    ['Not yet proven in production', 'No organisation has run a cohort. Any figure we showed you would be invented.', CORAL],
    ['What we want', 'Three to five design partners. Real employees, real calendars, real feedback.', LIME],
  ];
  let y = 2.3;
  rows.forEach(([h, b, c]) => {
    card(s, 7.35, y, 5.15, 1.32);
    s.addShape(pres.ShapeType.ellipse, { x: 7.6, y: y + 0.28, w: 0.3, h: 0.3, fill: { color: c } });
    s.addText(h, {
      x: 8.05, y: y + 0.22, w: 4.3, h: 0.35,
      fontSize: 14, bold: true, color: INK, fontFace: 'Arial', isTextBox: true, margin: 0,
    });
    s.addText(b, {
      x: 8.05, y: y + 0.6, w: 4.25, h: 0.62,
      fontSize: 11.5, color: INK2, lineSpacing: 16, fontFace: 'Calibri', isTextBox: true, margin: 0,
    });
    y += 1.5;
  });
  notes(s, 'Lead with this. A buyer who discovers later that you have no customers stops trusting everything else you said.');
}

/* ── 3 · the problem ─────────────────────────────────────────────── */
{
  const s = lightSlide();
  eyebrow(s, 'The problem you already have', 0.7);
  title(s, 'Your people sit down at nine\nand stand up at five.', 1.15);

  const cols = [
    ['The programme nobody opens', 'A wellbeing app is bought, announced, used enthusiastically for two weeks, and then quietly abandoned. Renewal becomes a conversation about why.'],
    ['The programme nobody trusts', 'Anything that can show an individual’s activity to their employer will eventually be asked to. Your people know that, and behave accordingly.'],
    ['The programme that excludes', 'Step challenges reward the people who were already fit. The employee who most needs it is the one who cannot take part.'],
  ];
  let x = M;
  cols.forEach(([h, b]) => {
    card(s, x, 2.9, 3.83, 2.75);
    s.addText(h, {
      x: x + 0.35, y: 3.2, w: 3.15, h: 0.8,
      fontSize: 16, bold: true, color: INK, fontFace: 'Cambria', isTextBox: true, margin: 0,
    });
    s.addText(b, {
      x: x + 0.35, y: 4.05, w: 3.15, h: 1.4,
      fontSize: 12.5, color: INK2, lineSpacing: 19, valign: 'top',
      fontFace: 'Calibri', isTextBox: true, margin: 0,
    });
    x += 4.0;
  });
  s.addText('We have built for the second and third of these deliberately, because they are the ones a platform can actually decide.', {
    x: M, y: 6.05, w: 11.7, h: 0.5,
    fontSize: 13, italic: true, color: INK2, fontFace: 'Calibri', isTextBox: true, margin: 0,
  });
  notes(s, 'No borrowed statistics. Every number in this deck is from our own system; the problem is stated as something the buyer already recognises.');
}

/* ── 4 · the individual view ─────────────────────────────────────── */
{
  const s = darkSlide();
  eyebrow(s, 'The procurement question', 0.7, true);
  title(s, 'Can an employer see one\nnamed person’s activity?', 1.15, true);

  s.addText('No.', {
    x: M, y: 2.95, w: 3, h: 1.3,
    fontSize: 92, bold: true, color: LIME, fontFace: 'Cambria', isTextBox: true, margin: 0,
  });
  s.addText('Not restricted. Not audited. Not available to a super-admin.', {
    x: M, y: 4.25, w: 5.2, h: 0.8,
    fontSize: 15, color: PAPER, lineSpacing: 22, fontFace: 'Calibri', isTextBox: true, margin: 0,
  });

  s.addText('OrganisationReport', {
    x: M, y: 5.35, w: 4.6, h: 0.3,
    fontSize: 13, bold: true, color: LIME, fontFace: 'Courier New', isTextBox: true, margin: 0,
  });
  s.addText('apps/backend/src/groups/groups.logic.ts — the type your\nengineers can read in five minutes.', {
    x: M, y: 5.72, w: 5.2, h: 0.6,
    fontSize: 12, color: 'B8C6D1', lineSpacing: 18, fontFace: 'Calibri', isTextBox: true, margin: 0,
  });

  card(s, 6.3, 2.6, 6.2, 3.9, '1B3A54');
  s.addText('Why that answer holds', {
    x: 6.75, y: 2.9, w: 5.3, h: 0.35,
    fontSize: 15, bold: true, color: LIME, fontFace: 'Arial', isTextBox: true, margin: 0,
  });
  s.addText([
    { text: 'The organisation report type has no field for a person. It carries a size, a participation percentage, an active count, a median and a suppression flag — so a client asking for a name does not compile.', options: { bullet: true, breakLine: true, paraSpaceAfter: 12 } },
    { text: 'A permission is a setting, and settings change when somebody senior asks. Because the capability was never built, adding one takes a schema change, a migration and a code review.', options: { bullet: true, breakLine: true, paraSpaceAfter: 12 } },
    { text: 'A cohort figure needs at least 8 contributing people. Below that the field is null, not a rounded stand-in.', options: { bullet: true } },
  ], {
    x: 6.8, y: 3.45, w: 5.2, h: 2.8,
    fontSize: 12, color: 'D6E2EA', lineSpacing: 17, valign: 'top',
    fontFace: 'Calibri', isTextBox: true, margin: 0,
  });
  notes(s, 'This is the slide that wins or loses the security review. Offer to let their engineers verify it against the public API in the meeting.');
}

/* ── 5 · every body qualifies ────────────────────────────────────── */
{
  const s = lightSlide();
  eyebrow(s, 'Nobody is excluded by design', 0.7);
  title(s, 'Five variants, or it does not ship.', 1.15);

  s.addText('Every movement in the library exists as five independently authored variants. Not one version with things removed — a good seated movement uses the chair. The publishing gate refuses anything with fewer. There is no force-publish flag and no admin bypass.', {
    x: M, y: 2.3, w: 11.7, h: 1.0,
    fontSize: 14.5, color: INK2, lineSpacing: 23, fontFace: 'Calibri', isTextBox: true, margin: 0,
  });

  const variants = ['Standing', 'Seated', 'Chair-supported', 'Bed / Recliner', 'Single-limb /\nAdaptive'];
  let x = M;
  variants.forEach((v, i) => {
    card(s, x, 3.6, 2.16, 1.5);
    s.addText(String(i + 1), {
      x: x + 0.3, y: 3.8, w: 0.5, h: 0.45,
      fontSize: 26, bold: true, color: TEAL, fontFace: 'Cambria', isTextBox: true, margin: 0,
    });
    s.addText(v, {
      x: x + 0.3, y: 4.32, w: 1.56, h: 0.65,
      fontSize: 12, bold: true, color: INK, lineSpacing: 15, fontFace: 'Arial', isTextBox: true, margin: 0,
    });
    x += 2.33;
  });

  card(s, M, 5.4, 11.7, 1.15, NAVY);
  s.addText('Six age modes, ten to a hundred. Mode is derived from a verified age band, not chosen — it governs which mechanics are legal, what data may be collected, and which clinical guardrails apply.', {
    x: M + 0.4, y: 5.62, w: 10.9, h: 0.75,
    fontSize: 13.5, color: PAPER, lineSpacing: 20, fontFace: 'Calibri', isTextBox: true, margin: 0,
  });
  notes(s, 'For employers with an older or mixed workforce, and for care and local-government buyers, this is usually the differentiator that matters most.');
}

/* ── 6 · when not to speak ───────────────────────────────────────── */
{
  const s = lightSlide();
  eyebrow(s, 'Why engagement does not decay', 0.7);
  title(s, 'It decides when to say nothing.', 1.15);

  s.addText('A reminder delivered while somebody is driving is not a neutral event. It costs attention, then trust, and eventually the notification is switched off — at which point the programme is finished however good the recommendation was. So a block is recorded as a successful decision, not a failed delivery.', {
    x: M, y: 2.3, w: 6.2, h: 1.7,
    fontSize: 14.5, color: INK2, lineSpacing: 23, fontFace: 'Calibri', isTextBox: true, margin: 0,
  });

  s.addText('What silences a prompt', {
    x: M, y: 4.15, w: 6, h: 0.4,
    fontSize: 15, bold: true, color: INK, fontFace: 'Arial', isTextBox: true, margin: 0,
  });
  /*
   * These are the `HARD_BLOCKS` in `packages/shared/src/context.ts`,
   * named as the code names them rather than paraphrased upward. A buyer
   * can read the list and then read the file.
   */
  s.addText([
    { text: 'Driving, from motion state rather than location', options: { bullet: true, breakLine: true, paraSpaceAfter: 6 } },
    { text: 'On a call, in a lesson, or notifications turned off', options: { bullet: true, breakLine: true, paraSpaceAfter: 6 } },
    { text: 'The daily cap, which differs by age mode', options: { bullet: true, breakLine: true, paraSpaceAfter: 6 } },
    { text: 'Quiet hours, the sleep window, or an active cooldown', options: { bullet: true, breakLine: true, paraSpaceAfter: 6 } },
    { text: 'A clinical rest flag, a safeguarding hold or a bereavement hold', options: { bullet: true } },
  ], {
    x: M, y: 4.6, w: 6.1, h: 1.95,
    fontSize: 13, color: INK2, valign: 'top', fontFace: 'Calibri', isTextBox: true, margin: 0,
  });

  card(s, 7.3, 2.3, 5.2, 4.0, NAVY);
  s.addText('The calendar, read\nwithout being read', {
    x: 7.7, y: 2.65, w: 4.5, h: 0.9,
    fontSize: 20, bold: true, color: PAPER, lineSpacing: 26, fontFace: 'Cambria', isTextBox: true, margin: 0,
  });
  s.addText('Start time, end time, busy or free, attendee count, whether it recurs.', {
    x: 7.7, y: 3.7, w: 4.4, h: 0.8,
    fontSize: 13, color: 'D6E2EA', lineSpacing: 19, fontFace: 'Calibri', isTextBox: true, margin: 0,
  });
  s.addText('The title is never transmitted, never logged and never sent to a model. It costs us accuracy — a one-to-one and a board review look identical to us — and we accept the worse recommendation.', {
    x: 7.7, y: 4.55, w: 4.4, h: 1.5,
    fontSize: 12.5, color: LIME, lineSpacing: 19, italic: true, fontFace: 'Calibri', isTextBox: true, margin: 0,
  });
  notes(s, 'Titles contain client names, medical appointments and disciplinary meetings. This is the slide for the works council or the union.');
}

/* ── 7 · what an employer gets ───────────────────────────────────── */
{
  const s = lightSlide();
  eyebrow(s, 'What you actually receive', 0.7);
  title(s, 'Enough to run a programme.\nNot enough to manage a person.', 1.15, false, 34);

  /*
   * Two columns, and the right-hand one is the reason the slide is
   * credible. The left column is the organisation report as it exists —
   * field for field, from `OrganisationReport` in groups.logic.ts. The
   * right column is what a workforce buyer will expect and we have not
   * built. Promising the right column as though it shipped is the single
   * easiest way to lose a design partner in week three.
   */
  s.addText('Today', {
    x: M, y: 2.7, w: 5.65, h: 0.3,
    fontSize: 12, bold: true, charSpacing: 2, color: TEAL,
    fontFace: 'Arial', isTextBox: true, margin: 0,
  });
  s.addText('Not built yet', {
    x: M + 6.05, y: 2.7, w: 5.65, h: 0.3,
    fontSize: 12, bold: true, charSpacing: 2, color: CORAL,
    fontFace: 'Arial', isTextBox: true, margin: 0,
  });

  card(s, M, 3.1, 5.65, 2.15);
  s.addText('The cohort report returns', {
    x: M + 0.4, y: 3.35, w: 4.9, h: 0.3,
    fontSize: 13.5, bold: true, color: INK, fontFace: 'Arial', isTextBox: true, margin: 0,
  });
  s.addText([
    { text: 'Participation rate across the cohort', options: { bullet: true, breakLine: true, paraSpaceAfter: 7 } },
    { text: 'How many people were active', options: { bullet: true, breakLine: true, paraSpaceAfter: 7 } },
    { text: 'Median days moved in the period', options: { bullet: true, breakLine: true, paraSpaceAfter: 7 } },
    { text: 'Whether the answer was suppressed, and the floor', options: { bullet: true } },
  ], {
    x: M + 0.4, y: 3.8, w: 4.85, h: 1.9,
    fontSize: 12, color: INK2, lineSpacing: 17, valign: 'top',
    fontFace: 'Calibri', isTextBox: true, margin: 0,
  });

  card(s, M + 6.05, 3.1, 5.65, 2.15);
  s.addText('Built with a design partner', {
    x: M + 6.45, y: 3.35, w: 4.9, h: 0.3,
    fontSize: 13.5, bold: true, color: INK, fontFace: 'Arial', isTextBox: true, margin: 0,
  });
  s.addText([
    { text: 'A trend series against a baseline', options: { bullet: true, breakLine: true, paraSpaceAfter: 7 } },
    { text: 'Sedentary-risk distribution by cohort', options: { bullet: true, breakLine: true, paraSpaceAfter: 7 } },
    { text: 'A return-on-investment model, assumptions shown', options: { bullet: true, breakLine: true, paraSpaceAfter: 7 } },
    { text: 'Single sign-on and directory sync', options: { bullet: true } },
  ], {
    x: M + 6.45, y: 3.8, w: 4.85, h: 1.9,
    fontSize: 12, color: INK2, lineSpacing: 17, valign: 'top',
    fontFace: 'Calibri', isTextBox: true, margin: 0,
  });

  s.addText('Below eight contributing people every figure is null, not rounded — for you as well as for everyone else. An eleven-person company cannot have anonymous reporting however it is sold.', {
    x: M, y: 6.15, w: 11.7, h: 0.7,
    fontSize: 12.5, italic: true, color: INK2, lineSpacing: 18, fontFace: 'Calibri', isTextBox: true, margin: 0,
  });
  notes(s, 'Do not let the right-hand column be read as shipped. Say the words: these four are not built, and a design partner decides which comes first. Also say the small-organisation limitation out loud — a buyer who finds it after signing feels sold to.');
}

/* ── 8 · verify, don't trust ─────────────────────────────────────── */
{
  const s = darkSlide();
  eyebrow(s, 'For your security review', 0.7, true);
  title(s, 'A claim you can call is worth\nmore than a claim you can read.', 1.15, true, 34);

  s.addText('Checkable from a terminal, without an account and without us in the room. The assurance endpoint lists 32 controls — 21 enforced in code, 7 implemented, 4 still open.', {
    x: M, y: 2.5, w: 11.7, h: 0.7,
    fontSize: 13.5, color: 'B8C6D1', lineSpacing: 20, fontFace: 'Calibri', isTextBox: true, margin: 0,
  });

  /*
   * Four endpoints that exist, are unauthenticated, and answer a
   * procurement question rather than a marketing one. Nothing here is
   * aspirational — each was called against the running service before
   * it went on the slide (against a local instance of the same build; the production host is the owner's to confirm).
   */
  const checks = [
    ['GET  /api/assurance', 'Every control, its status, and the gaps — listed at the top, not buried.'],
    ['GET  /api/movements/gate', 'The publishing contract: five variants, a cue set per age mode, no override.'],
    ['POST /api/body/assess', 'Send a twelve-year-old with consent set true. It returns metrics: null.'],
    ['GET  /api/health', 'A live check that opens a database connection, never a stored badge.'],
  ];
  let y = 3.4;
  checks.forEach(([code, what]) => {
    card(s, M, y, 11.7, 0.76, '1B3A54');
    s.addText(code, {
      x: M + 0.35, y: y + 0.22, w: 3.6, h: 0.35,
      fontSize: 12.5, bold: true, color: LIME, fontFace: 'Courier New', isTextBox: true, margin: 0,
    });
    s.addText(what, {
      x: M + 4.15, y: y + 0.22, w: 7.2, h: 0.35,
      fontSize: 12, color: 'D6E2EA', fontFace: 'Calibri', isTextBox: true, margin: 0,
    });
    y += 0.9;
  });
  notes(s, 'Offer to run these live. It converts a trust conversation into a demonstration, and very few vendors can do it. GET /api/system is a fifth if they want the platform invariants — age modes, delivery tiers, required variants — in one response.');
}

/* ── 9 · pricing ─────────────────────────────────────────────────── */
{
  const s = lightSlide();
  eyebrow(s, 'Commercials', 0.7);
  title(s, 'From £2 per employee per month.', 1.15);

  card(s, M, 2.4, 5.65, 3.5, NAVY);
  s.addText('from £2', {
    x: M + 0.45, y: 2.8, w: 4.5, h: 1.0,
    fontSize: 54, bold: true, color: LIME, fontFace: 'Cambria', isTextBox: true, margin: 0,
  });
  s.addText('per seat, per month', {
    x: M + 0.45, y: 3.85, w: 4.5, h: 0.35,
    fontSize: 14, color: PAPER, fontFace: 'Calibri', isTextBox: true, margin: 0,
  });
  s.addText('The floor, not a teaser. Up to £5 depending on sector, seat count and support level. Organisation deals are contracts, so the figure is agreed rather than picked at a checkout.', {
    x: M + 0.45, y: 4.4, w: 4.75, h: 1.2,
    fontSize: 12.5, color: 'B8C6D1', lineSpacing: 19, fontFace: 'Calibri', isTextBox: true, margin: 0,
  });

  /*
   * "Included in the contract" is not the same as "shipped", and the
   * distinction is stated on the slide. Single sign-on is a contracted
   * inclusion that does not exist in the code yet; presenting it as a
   * live feature is the fastest way to be found out in a technical
   * review.
   */
  const terms = [
    ['Minimum 10 seats', 'And a minimum annual contract.'],
    ['Challenge builder and campaigns', 'Branded to your organisation.'],
    ['Setup and integration support', 'Included in every contract.'],
    ['Single sign-on and directory sync', 'Contracted, not yet built. Delivered inside the pilot.'],
  ];
  let y = 2.4;
  terms.forEach(([h, b]) => {
    card(s, 6.85, y, 5.65, 0.68);
    s.addText(h, {
      x: 7.2, y: y + 0.12, w: 5, h: 0.3,
      fontSize: 13, bold: true, color: INK, fontFace: 'Arial', isTextBox: true, margin: 0,
    });
    s.addText(b, {
      x: 7.2, y: y + 0.42, w: 5, h: 0.3,
      fontSize: 11.5, color: INK2, fontFace: 'Calibri', isTextBox: true, margin: 0,
    });
    y += 0.95;
  });

  s.addText('Design partners are priced at the floor for the first year, in exchange for feedback and a reference once there is something real to reference.', {
    x: M, y: 6.15, w: 11.7, h: 0.6,
    fontSize: 13, italic: true, color: TEAL, lineSpacing: 19, fontFace: 'Calibri', isTextBox: true, margin: 0,
  });
  notes(s, 'The design-partner discount buys feedback and a future reference. Do not promise a testimonial before there is a result to describe.');
}

/* ── 10 · what we are asking ─────────────────────────────────────── */
{
  const s = lightSlide();
  eyebrow(s, 'The ask', 0.7);
  title(s, 'A twelve-week pilot,\none team, no procurement epic.', 1.15, false, 34);

  const steps = [
    ['1', 'Week 0', 'One team, 10–100 people. Invited by email, and a named sponsor on your side and ours.'],
    ['2', 'Weeks 1–8', 'People use it. We watch the held rate and completion, not the vanity numbers.'],
    ['3', 'Weeks 9–12', 'Cohort report against baseline. Honest review — including whether it did nothing.'],
  ];
  let x = M;
  steps.forEach(([n, when, what]) => {
    card(s, x, 2.75, 3.83, 2.6);
    s.addShape(pres.ShapeType.ellipse, { x: x + 0.35, y: 3.0, w: 0.6, h: 0.6, fill: { color: TEAL } });
    s.addText(n, {
      x: x + 0.35, y: 3.08, w: 0.6, h: 0.45,
      fontSize: 22, bold: true, color: PAPER, align: 'center', fontFace: 'Cambria', isTextBox: true, margin: 0,
    });
    s.addText(when, {
      x: x + 0.35, y: 3.78, w: 3.1, h: 0.35,
      fontSize: 15, bold: true, color: INK, fontFace: 'Arial', isTextBox: true, margin: 0,
    });
    s.addText(what, {
      x: x + 0.35, y: 4.2, w: 3.1, h: 1.0,
      fontSize: 12.5, color: INK2, lineSpacing: 18, fontFace: 'Calibri', isTextBox: true, margin: 0,
    });
    x += 4.0;
  });

  card(s, M, 5.6, 11.7, 1.05, MIST);
  s.addText('If the pilot shows it did not work, we would rather know at week twelve than sell you a second year. That is the whole basis of the programme.', {
    x: M + 0.4, y: 5.82, w: 10.9, h: 0.65,
    fontSize: 13.5, italic: true, color: INK, lineSpacing: 20, fontFace: 'Calibri', isTextBox: true, margin: 0,
  });
  notes(s, 'Twelve weeks is short enough to approve without a procurement cycle and long enough to see whether behaviour changed.');
}

/* ── 11 · close ──────────────────────────────────────────────────── */
{
  const s = darkSlide();
  s.addShape(pres.ShapeType.ellipse, { x: M, y: 2.05, w: 0.22, h: 0.22, fill: { color: TEAL } });
  s.addText('JESS MOVE', {
    x: M + 0.38, y: 1.98, w: 8, h: 0.4,
    fontSize: 17, bold: true, charSpacing: 5, color: PAPER, fontFace: 'Arial', isTextBox: true, margin: 0,
  });
  s.addText('Two minutes is\nthe whole ask.', {
    x: M, y: 2.7, w: 9, h: 1.9,
    fontSize: 50, bold: true, color: PAPER, lineSpacing: 54, fontFace: 'Cambria', isTextBox: true, margin: 0,
  });
  s.addText('Of an employee’s day, and of yours to decide whether a twelve-week pilot is worth running.', {
    x: M, y: 4.8, w: 7.2, h: 0.9,
    fontSize: 15, color: 'B8C6D1', lineSpacing: 23, fontFace: 'Calibri', isTextBox: true, margin: 0,
  });

  card(s, 8.4, 2.6, 4.1, 2.5, '1B3A54');
  s.addText('Next step', {
    x: 8.8, y: 2.9, w: 3.3, h: 0.35,
    fontSize: 14, bold: true, color: LIME, fontFace: 'Arial', isTextBox: true, margin: 0,
  });
  s.addText('jessmove.com/industries', {
    x: 8.8, y: 3.4, w: 3.4, h: 0.35,
    fontSize: 14, bold: true, color: PAPER, fontFace: 'Calibri', isTextBox: true, margin: 0,
  });
  s.addText('A thirty-minute call, and we will run the verification endpoints live if your security team wants to watch.', {
    x: 8.8, y: 3.9, w: 3.4, h: 1.0,
    fontSize: 12, color: 'D6E2EA', lineSpacing: 18, fontFace: 'Calibri', isTextBox: true, margin: 0,
  });

  s.addText('Jess Move does not diagnose any condition and never contacts emergency services. In the UK, call 999 for an emergency and 111 for urgent health advice.', {
    x: M, y: 6.5, w: 11.7, h: 0.5,
    fontSize: 10.5, color: 'A7B8C6', fontFace: 'Calibri', isTextBox: true, margin: 0,
  });
  notes(s, 'Close on the clinical boundary. It signals seriousness to a health-adjacent buyer rather than reading as a disclaimer.');
}

pres.writeFile({ fileName: process.env.DECK_OUT || 'JESS-MOVE-for-organisations.pptx' })
  .then((f) => console.log('written:', f));
