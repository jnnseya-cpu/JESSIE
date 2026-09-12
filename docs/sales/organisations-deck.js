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
 *
 * Rule two, which is a sales rule rather than an honesty one: the order
 * matters as much as the content. An earlier cut of this deck opened on
 * "no customers yet" and held the strongest argument until slide four.
 * That is an audit, not a pitch. Honesty is not the same as leading with
 * your weakness — so the architecture nobody else can claim goes second,
 * and having no track record is repositioned where it belongs: as the
 * terms of a deal that gets worse for the buyer once there is one.
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
  /*
   * Three constraints instead of a benefit statement. Each is a property
   * the code enforces and a buyer's engineer can check, so the punchiest
   * line available is also the most defensible one. "Movement that fits
   * the working day" was true and forgettable.
   */
  const s = darkSlide();
  s.addShape(pres.ShapeType.ellipse, {
    x: M, y: 1.35, w: 0.22, h: 0.22, fill: { color: TEAL },
  });
  s.addText('JESS MOVE', {
    x: M + 0.38, y: 1.28, w: 8, h: 0.4,
    fontSize: 17, bold: true, charSpacing: 5, color: PAPER,
    fontFace: 'Arial', isTextBox: true, margin: 0,
  });
  s.addText('Can’t spy.\nCan’t nag.\nCan’t exclude.', {
    x: M, y: 1.95, w: 9.6, h: 3.1,
    fontSize: 54, bold: true, color: PAPER, lineSpacing: 60,
    fontFace: 'Cambria', isTextBox: true, margin: 0,
  });
  s.addText('Small Moves. Powerful Change.', {
    x: M, y: 5.2, w: 8, h: 0.4,
    fontSize: 18, italic: true, color: LIME,
    fontFace: 'Calibri', isTextBox: true, margin: 0,
  });
  s.addText('A movement and food-intelligence platform for your workforce. Those three are in the code, not the contract — and your engineers can check all three before you sign anything.', {
    x: M, y: 5.8, w: 10.4, h: 0.9,
    fontSize: 14, color: 'B8C6D1', lineSpacing: 22,
    fontFace: 'Calibri', isTextBox: true, margin: 0,
  });
  s.addText('Design partner programme · 2026', {
    x: M, y: 6.85, w: 8, h: 0.3,
    fontSize: 11, color: 'A7B8C6', charSpacing: 1,
    fontFace: 'Arial', isTextBox: true, margin: 0,
  });
  notes(s, 'Three constraints, not three features. Say them in order and stop — the next slide proves the first one. Do not open by explaining that we are pre-launch; that lands on slide nine as the terms of a deal, not as an apology.');
}

/* ── 2 · the hook ────────────────────────────────────────────────── */
{
  /*
   * Second, not fourth. This is the one claim no competitor in the
   * category can make, and the whole deck is more persuasive once it has
   * been made — so it goes before the problem statement rather than
   * after it.
   */
  const s = darkSlide();
  eyebrow(s, 'The question your people will ask', 0.7, true);
  title(s, 'Can my employer see\nwhat I did today?', 1.15, true);

  s.addText('No.', {
    x: M, y: 2.95, w: 3, h: 1.3,
    fontSize: 92, bold: true, color: LIME, fontFace: 'Cambria', isTextBox: true, margin: 0,
  });
  s.addText('Not restricted. Not audited. Not switchable by a super-admin. Absent.', {
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
    { text: 'The report type has no field for a person. Size, participation, active count, median, suppression flag. A client asking for a name does not compile.', options: { bullet: true, breakLine: true, paraSpaceAfter: 12 } },
    { text: 'Permissions get granted when somebody senior asks. There is no permission to grant. Adding one means a schema change, a migration and a code review.', options: { bullet: true, breakLine: true, paraSpaceAfter: 12 } },
    { text: 'A cohort figure needs 8 contributing people. Below that it is null — not rounded, not estimated, not "approximately".', options: { bullet: true } },
  ], {
    x: 6.8, y: 3.45, w: 5.2, h: 2.8,
    fontSize: 12, color: 'D6E2EA', lineSpacing: 17, valign: 'top',
    fontFace: 'Calibri', isTextBox: true, margin: 0,
  });
  notes(s, 'This slide wins or loses the room. Every competitor answers this question with a policy; we answer it with a missing field. Offer to let their engineers verify it live before you move on.');
}

/* ── 3 · the problem ─────────────────────────────────────────────── */
{
  const s = lightSlide();
  eyebrow(s, 'Why the last one failed', 0.7);
  title(s, 'You have bought this before.', 1.15);

  const cols = [
    ['Nobody opened it', 'Bought, announced, used enthusiastically for a fortnight, quietly abandoned. Renewal becomes a conversation about why.'],
    ['Nobody trusted it', 'Anything that can show an employer one person’s activity eventually will. Your people assume that, and behave accordingly.'],
    ['It paid the already-fit', 'Step challenges reward the people who needed them least. The employee who needed it most could not take part.'],
  ];
  let x = M;
  cols.forEach(([h, b]) => {
    card(s, x, 2.6, 3.83, 2.6);
    s.addText(h, {
      x: x + 0.35, y: 2.9, w: 3.15, h: 0.45,
      fontSize: 18, bold: true, color: INK, fontFace: 'Cambria', isTextBox: true, margin: 0,
    });
    s.addText(b, {
      x: x + 0.35, y: 3.5, w: 3.15, h: 1.5,
      fontSize: 12.5, color: INK2, lineSpacing: 19, valign: 'top',
      fontFace: 'Calibri', isTextBox: true, margin: 0,
    });
    x += 4.0;
  });

  card(s, M, 5.5, 11.7, 1.1, NAVY);
  s.addText('The second and third are architecture, not effort. No amount of internal comms fixes either one, and both were decided before a line of interface was written.', {
    x: M + 0.4, y: 5.78, w: 10.9, h: 0.6,
    fontSize: 14, color: PAPER, lineSpacing: 20, fontFace: 'Calibri', isTextBox: true, margin: 0,
  });
  notes(s, 'Let them recognise their own last purchase in one of these three cards, then make the architecture point. No borrowed industry statistics — every number in this deck is ours.');
}

/* ── 4 · when not to speak ───────────────────────────────────────── */
{
  const s = lightSlide();
  eyebrow(s, 'Why engagement does not decay', 0.7);
  title(s, 'It knows when to say nothing.', 1.15);

  s.addText('A prompt delivered while somebody is driving costs attention, then trust, then the notification switch. After that the programme is over however good the advice was. So a block counts here as a success, not a failed delivery.', {
    x: M, y: 2.3, w: 6.2, h: 1.5,
    fontSize: 14.5, color: INK2, lineSpacing: 23, fontFace: 'Calibri', isTextBox: true, margin: 0,
  });

  s.addText('What silences a prompt', {
    x: M, y: 4.0, w: 6, h: 0.4,
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
    { text: 'The daily cap, which differs by age band', options: { bullet: true, breakLine: true, paraSpaceAfter: 6 } },
    { text: 'Quiet hours, the sleep window, or an active cooldown', options: { bullet: true, breakLine: true, paraSpaceAfter: 6 } },
    { text: 'A clinical rest flag, a safeguarding hold or a bereavement hold', options: { bullet: true } },
  ], {
    x: M, y: 4.45, w: 6.1, h: 1.95,
    fontSize: 13, color: INK2, valign: 'top', fontFace: 'Calibri', isTextBox: true, margin: 0,
  });

  card(s, 7.3, 2.3, 5.2, 4.1, NAVY);
  s.addText('We read the calendar\nwithout reading it', {
    x: 7.7, y: 2.65, w: 4.5, h: 0.9,
    fontSize: 20, bold: true, color: PAPER, lineSpacing: 26, fontFace: 'Cambria', isTextBox: true, margin: 0,
  });
  s.addText('Start time, end time, busy or free, attendee count, whether it recurs. That is the whole list.', {
    x: 7.7, y: 3.7, w: 4.4, h: 0.8,
    fontSize: 13, color: 'D6E2EA', lineSpacing: 19, fontFace: 'Calibri', isTextBox: true, margin: 0,
  });
  s.addText('The title is never transmitted, never logged, never sent to a model. It costs us accuracy — a one-to-one and a board review look identical to us — and we take the worse recommendation.', {
    x: 7.7, y: 4.65, w: 4.4, h: 1.5,
    fontSize: 12.5, color: LIME, lineSpacing: 19, italic: true, fontFace: 'Calibri', isTextBox: true, margin: 0,
  });
  notes(s, 'Calendar titles carry client names, medical appointments and disciplinary meetings. This is the slide for the works council, the union and anybody who has been burned by a badge-and-app rollout.');
}

/* ── 5 · nobody is excluded ──────────────────────────────────────── */
{
  const s = lightSlide();
  eyebrow(s, 'Nobody is excluded by design', 0.7);
  title(s, 'Five variants, or it does not ship.', 1.15);

  s.addText('Every movement exists as five separately authored variants. Not one version with things taken out — a good seated movement uses the chair. The publishing gate refuses anything less. No force-publish flag, no admin override.', {
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

  /*
   * Reframed for a corporate cohort. The platform holds six bands; four
   * of them are working age, and 40–64 is the band most wellbeing
   * programmes quietly design past. Stated as the mechanics differing by
   * band rather than as a demographic claim about anybody's payroll.
   */
  card(s, M, 5.4, 11.7, 1.15, NAVY);
  s.addText('Four of the six age bands are working age — 18–39, 40–64 and 65–79, plus apprentices under 18. The band is derived, not chosen, and it changes the mechanics, the daily prompt cap and the clinical guardrails. It is not one programme with the age swapped.', {
    x: M + 0.4, y: 5.6, w: 10.9, h: 0.8,
    fontSize: 13, color: PAPER, lineSpacing: 19, fontFace: 'Calibri', isTextBox: true, margin: 0,
  });
  notes(s, 'For a workforce spanning apprentices to people working past 65, this is usually the differentiator that decides it. Most step-count programmes are designed for the 18-39 band; 40-64 is where sedentary risk actually bites and it is usually a large part of the payroll.');
}

/* ── 6 · what an employer gets ───────────────────────────────────── */
{
  /*
   * Two columns, and the right-hand one is the reason the slide is
   * credible. The left column is the organisation report as it exists —
   * field for field, from `OrganisationReport` in groups.logic.ts. The
   * right column is what a workforce buyer will expect and we have not
   * built. Promising the right column as though it shipped is the single
   * easiest way to lose a design partner in week three.
   */
  const s = lightSlide();
  eyebrow(s, 'What you actually receive', 0.7);
  title(s, 'Enough to run a programme.\nNot enough to manage a person.', 1.15, false, 34);

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
  s.addText('Yours to prioritise as a design partner', {
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
  notes(s, 'Never let the right-hand column be heard as shipped. Say the words: these four are not built, and a design partner decides the order. Then say the small-organisation limitation out loud — a buyer who finds it after signing feels sold to.');
}

/* ── 7 · verify, don't trust ─────────────────────────────────────── */
{
  const s = darkSlide();
  eyebrow(s, 'For your security review', 0.7, true);
  title(s, 'Don’t trust us. Call the API.', 1.15, true);

  s.addText('Checkable from a terminal — no account, no NDA, nobody from us in the room. 32 controls: 21 enforced in code, 7 implemented, 4 open. 942 automated tests behind the four responses below.', {
    x: M, y: 2.4, w: 11.7, h: 0.7,
    fontSize: 13.5, color: 'B8C6D1', lineSpacing: 20, fontFace: 'Calibri', isTextBox: true, margin: 0,
  });

  /*
   * Four endpoints that exist, are unauthenticated, and answer a
   * procurement question rather than a marketing one. Nothing here is
   * aspirational — each was called against a local instance of this
   * build before it went on the slide (the production host is the
   * owner's to confirm).
   */
  const checks = [
    ['GET  /api/assurance', 'Every control, its status, and the gaps — listed at the top, not buried.'],
    ['GET  /api/movements/gate', 'The publishing contract: five variants, a cue set per age band, no override.'],
    ['POST /api/body/assess', 'Send a twelve-year-old with consent set true. It returns metrics: null.'],
    ['GET  /api/health', 'A live check that opens a database connection, never a stored badge.'],
  ];
  let y = 3.4;
  checks.forEach(([code, what]) => {
    card(s, M, y, 11.7, 0.76, '1B3A54');
    s.addText(code, {
      x: M + 0.35, y: y + 0.2, w: 3.6, h: 0.35,
      fontSize: 12.5, bold: true, color: LIME, fontFace: 'Courier New', isTextBox: true, margin: 0,
    });
    s.addText(what, {
      x: M + 4.15, y: y + 0.2, w: 7.2, h: 0.35,
      fontSize: 12, color: 'D6E2EA', fontFace: 'Calibri', isTextBox: true, margin: 0,
    });
    y += 0.9;
  });

  notes(s, 'Offer to run these live, on their laptop, in the meeting. It turns a trust conversation into a demonstration and almost no vendor in this category can do it. GET /api/system is a fifth if they want the platform invariants in one response.');
}

/* ── 8 · what legal and HR will ask ──────────────────────────────── */
{
  /*
   * The slide a corporate deck cannot do without, and the one most
   * vendors leave out. Both columns come from `GET /api/assurance`: the
   * left from the enforced data-protection controls, the right from
   * `assuranceGaps()` verbatim. Naming the four open items is not
   * modesty — a procurement team that finds an unnamed gap in week six
   * treats every other slide as marketing.
   */
  const s = lightSlide();
  eyebrow(s, 'Your legal, HR and security teams', 0.7);
  title(s, 'Four things enforced. Four things open.', 1.15, false, 36);

  s.addText('Enforced in code and schema', {
    x: M, y: 2.35, w: 5.65, h: 0.3,
    fontSize: 12, bold: true, charSpacing: 2, color: TEAL,
    fontFace: 'Arial', isTextBox: true, margin: 0,
  });
  s.addText('Open, and named before you ask', {
    x: M + 6.05, y: 2.35, w: 5.65, h: 0.3,
    fontSize: 12, bold: true, charSpacing: 2, color: CORAL,
    fontFace: 'Arial', isTextBox: true, margin: 0,
  });

  card(s, M, 2.75, 5.65, 3.25);
  s.addText([
    { text: 'A declared condition is stored as a catalogue identifier. No severity, no dates, no medication, no free text.', options: { bullet: true, breakLine: true, paraSpaceAfter: 9 } },
    { text: 'Deleting an account cascades in the database from the user row — a guarantee, not a callback somebody has to remember.', options: { bullet: true, breakLine: true, paraSpaceAfter: 9 } },
    { text: 'Health data never reaches an organisation view at any cohort size. A test asserts that no module outside the conditions service touches that table.', options: { bullet: true, breakLine: true, paraSpaceAfter: 9 } },
    { text: 'Analytics identifiers are hashed on arrival with a salt regenerated daily, and never outlive the request.', options: { bullet: true } },
  ], {
    x: M + 0.4, y: 3.0, w: 4.85, h: 2.8,
    fontSize: 11.5, color: INK2, lineSpacing: 16, valign: 'top',
    fontFace: 'Calibri', isTextBox: true, margin: 0,
  });

  card(s, M + 6.05, 2.75, 5.65, 3.25);
  s.addText([
    { text: 'No external WCAG 2.2 AA audit and no VPAT. Accessibility is designed for and tested in places, not certified.', options: { bullet: true, breakLine: true, paraSpaceAfter: 9 } },
    { text: 'Age is self-declared. Ofcom’s position is that self-declaration is not highly effective age assurance.', options: { bullet: true, breakLine: true, paraSpaceAfter: 9 } },
    { text: 'A member can read their whole record through their own endpoints, but there is no one-click export archive yet.', options: { bullet: true, breakLine: true, paraSpaceAfter: 9 } },
    { text: 'The Clinical Safety Officer appointment record is incomplete against DCB0129, and the hazard log says so itself.', options: { bullet: true } },
  ], {
    x: M + 6.45, y: 3.0, w: 4.85, h: 2.8,
    fontSize: 11.5, color: INK2, lineSpacing: 16, valign: 'top',
    fontFace: 'Calibri', isTextBox: true, margin: 0,
  });

  s.addText('We did not assemble the right-hand column for this slide. It is what GET /api/assurance returns to anybody who calls it, gaps lifted to the top of the response rather than left to be found area by area.', {
    x: M, y: 6.25, w: 11.7, h: 0.7,
    fontSize: 12.5, italic: true, color: INK2, lineSpacing: 18, fontFace: 'Calibri', isTextBox: true, margin: 0,
  });
  notes(s, 'Hand this to their security lead early rather than defending it late. Closest gap to closing is the export archive — the data is already readable through the member endpoints and needs an archive wrapped around them. On the age gap: it bites a school far harder than an employer, and it is listed rather than argued away for exactly that reason.');
}

/* ── 9 · the deal ────────────────────────────────────────────────── */
{
  /*
   * Having no track record, sold as terms rather than confessed as a
   * weakness. Both framings are equally honest; only one of them is a
   * reason to sign this quarter. Nothing here is a discount invented for
   * the slide — floor pricing and three-to-five partners were the plan
   * before the deck existed.
   */
  const s = lightSlide();
  eyebrow(s, 'The deal', 0.7);
  title(s, 'You would be our first.', 1.15);

  s.addText('Every vendor in this category opens with logos. We have none — no customers, no case study, no measured outcome. So we are not asking you to believe a result. We are asking you to help produce the first one, and pricing it accordingly.', {
    x: M, y: 2.3, w: 6.3, h: 1.6,
    fontSize: 15, color: INK2, lineSpacing: 25,
    fontFace: 'Calibri', isTextBox: true, margin: 0,
  });

  const stats = [
    ['0', 'organisations have\nrun a cohort'],
    ['3–5', 'design partners, and\nwe want no more'],
    ['£2', 'a seat, held for the\nwhole first year'],
  ];
  let sx = M;
  stats.forEach(([n, label]) => {
    s.addText(n, {
      x: sx, y: 4.15, w: 2.0, h: 0.75,
      fontSize: 40, bold: true, color: TEAL, fontFace: 'Cambria', isTextBox: true, margin: 0,
    });
    s.addText(label, {
      x: sx, y: 4.97, w: 2.0, h: 0.7,
      fontSize: 11, color: INK2, lineSpacing: 15, fontFace: 'Calibri', isTextBox: true, margin: 0,
    });
    sx += 2.15;
  });

  card(s, 7.35, 2.3, 5.15, 3.6, NAVY);
  s.addText('What a design partner gets\nthat customer six will not', {
    x: 7.75, y: 2.6, w: 4.4, h: 0.8,
    fontSize: 17, bold: true, color: PAPER, lineSpacing: 23, fontFace: 'Cambria', isTextBox: true, margin: 0,
  });
  s.addText([
    { text: 'The floor price, held for twelve months', options: { bullet: true, breakLine: true, paraSpaceAfter: 10 } },
    { text: 'First call on the order of the four unbuilt things on slide six', options: { bullet: true, breakLine: true, paraSpaceAfter: 10 } },
    { text: 'A named sponsor on our side, not a ticket queue', options: { bullet: true, breakLine: true, paraSpaceAfter: 10 } },
    { text: 'A twelve-week pilot that ends at week twelve unless you say otherwise', options: { bullet: true } },
  ], {
    x: 7.75, y: 3.6, w: 4.35, h: 2.1,
    fontSize: 12.5, color: 'D6E2EA', lineSpacing: 17, valign: 'top',
    fontFace: 'Calibri', isTextBox: true, margin: 0,
  });

  s.addText('Once there is a case study, this conversation costs more and includes less. That is not a tactic — it is what happens to every design-partner programme that works.', {
    x: M, y: 6.15, w: 11.7, h: 0.7,
    fontSize: 13, italic: true, color: TEAL, lineSpacing: 19, fontFace: 'Calibri', isTextBox: true, margin: 0,
  });
  notes(s, 'This is the close, eight slides early. Do not promise a testimonial before there is a result to describe — the exchange is feedback now and a reference later, and only if it worked. The week-twelve exit is the line that gets this approved without a procurement cycle.');
}

/* ── 10 · pricing ────────────────────────────────────────────────── */
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
    ['Minimum 10 seats', 'Annual term once a pilot converts, not before.'],
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

  s.addText('One invoice, one contract, one line in the benefits budget. No per-feature upsell and no device to buy.', {
    x: M, y: 6.15, w: 11.7, h: 0.6,
    fontSize: 13, italic: true, color: TEAL, lineSpacing: 19, fontFace: 'Calibri', isTextBox: true, margin: 0,
  });
  notes(s, 'At ten seats this is a £20 invoice, which is why the ten-seat minimum exists rather than being a sales preference. If they push on price, push back with the twelve-week exit instead of discounting.');
}

/* ── 11 · what we are asking ─────────────────────────────────────── */
{
  const s = lightSlide();
  eyebrow(s, 'The ask', 0.7);
  title(s, 'One team. Twelve weeks.\nNo procurement epic.', 1.15, false, 34);

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
  s.addText('If it did not work, we would rather you knew at week twelve than bought a year. The annual term starts only if you choose to convert.', {
    x: M + 0.4, y: 5.82, w: 10.9, h: 0.65,
    fontSize: 13.5, italic: true, color: INK, lineSpacing: 20, fontFace: 'Calibri', isTextBox: true, margin: 0,
  });
  notes(s, 'Twelve weeks is short enough to approve without a procurement cycle and long enough to see whether behaviour changed. The exit clause is what makes it a small decision — lead with it if they hesitate.');
}

/* ── 12 · close ──────────────────────────────────────────────────── */
{
  const s = darkSlide();
  s.addShape(pres.ShapeType.ellipse, { x: M, y: 2.05, w: 0.22, h: 0.22, fill: { color: TEAL } });
  s.addText('JESS MOVE', {
    x: M + 0.38, y: 1.98, w: 8, h: 0.4,
    fontSize: 17, bold: true, charSpacing: 5, color: PAPER, fontFace: 'Arial', isTextBox: true, margin: 0,
  });
  s.addText('Give us one team\nand twelve weeks.', {
    x: M, y: 2.7, w: 8, h: 1.9,
    fontSize: 48, bold: true, color: PAPER, lineSpacing: 54, fontFace: 'Cambria', isTextBox: true, margin: 0,
  });
  s.addText('Two minutes of an employee’s day. Thirty of yours to decide.', {
    x: M, y: 4.8, w: 7.2, h: 0.9,
    fontSize: 16, color: 'B8C6D1', lineSpacing: 23, fontFace: 'Calibri', isTextBox: true, margin: 0,
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
  s.addText('Bring your security lead. We will run the endpoints live while they watch.', {
    x: 8.8, y: 3.9, w: 3.4, h: 1.0,
    fontSize: 12, color: 'D6E2EA', lineSpacing: 18, fontFace: 'Calibri', isTextBox: true, margin: 0,
  });

  s.addText('Jess Move does not diagnose any condition and never contacts emergency services. In the UK, call 999 for an emergency and 111 for urgent health advice.', {
    x: M, y: 6.5, w: 11.7, h: 0.5,
    fontSize: 10.5, color: 'A7B8C6', fontFace: 'Calibri', isTextBox: true, margin: 0,
  });
  notes(s, 'Close on the ask, not on the product. The clinical boundary stays on the slide because it signals seriousness to a health-adjacent buyer rather than reading as a disclaimer.');
}

pres.writeFile({ fileName: process.env.DECK_OUT || 'JESS-MOVE-for-organisations.pptx' })
  .then((f) => console.log('written:', f));
