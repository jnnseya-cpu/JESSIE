import { Controller, Get } from '@nestjs/common';
import {
  ASSURANCE_CONTROLS,
  ASSURANCE_PREAMBLE,
  HAZARDS,
  HAZARD_LOG_PREAMBLE,
  LIKELIHOOD_MEANING,
  SEVERITY_MEANING,
  hazardLog,
  CONDITIONS,
  CONDITION_IDS,
  FREE_TIER,
  K_ANONYMITY_THRESHOLD,
  METERING_RULE,
  assuranceByArea,
  assuranceGaps,
} from '@jessmove/shared';
import { BUILD_COMMIT } from '../build-info';

/**
 * The assurance summary, served openly.
 *
 * Three different buyers ask versions of one question. A school wants to
 * know whether a twelve-year-old can be shown a weight. An NHS team is
 * working through the Digital Technology Assessment Criteria. A regulator
 * wants to know how AI involvement is disclosed. Answering each separately
 * produces three documents that drift apart; answering once, from the
 * code, produces one that cannot.
 *
 * Open rather than behind the admin guard, because the entire value of it
 * is that somebody can check it without asking us. It contains no member
 * data — it is a description of what the software refuses to do.
 */
@Controller('assurance')
export class AssuranceController {
  @Get()
  summary() {
    const gaps = assuranceGaps();
    return {
      preamble: ASSURANCE_PREAMBLE,
      build: BUILD_COMMIT?.slice(0, 7) ?? 'unknown',
      areas: assuranceByArea(),
      /*
       * The gaps are lifted to the top level rather than left to be found
       * area by area. A buyer who has to hunt for what a supplier does not
       * do will assume there is more of it, and they will usually be right.
       */
      gaps,
      counts: {
        total: ASSURANCE_CONTROLS.length,
        enforced: ASSURANCE_CONTROLS.filter((c) => c.status === 'enforced').length,
        implemented: ASSURANCE_CONTROLS.filter((c) => c.status === 'implemented').length,
        gaps: gaps.length,
      },
      keyFigures: {
        ageRange: '10 to 100, across six modes',
        groupReportingFloor: K_ANONYMITY_THRESHOLD,
        conditionsHeld: CONDITION_IDS.length,
        freeAllowance: `${FREE_TIER.acusPerMonth} ACU a month for ${FREE_TIER.months} months, then none`,
        meteringRule: METERING_RULE,
      },
    };
  }

  /**
   * The safeguarding answer on its own, for the buyer who only needs that.
   *
   * A school or a club is not going to read a procurement document. What
   * they want is one page saying what a child can and cannot be shown, and
   * how they would know it is true.
   */
  @Get('safeguarding')
  safeguarding() {
    const controls = ASSURANCE_CONTROLS.filter((c) => c.area === 'safeguarding');
    return {
      inOneSentence:
        'No weight, no body-mass index and no energy figure can be rendered for an account under 18 — not hidden by a setting, not available behind a toggle, but absent from what the platform will produce for that account at all.',
      controls,
      howYouWouldKnow:
        'The rule is charter rule C6 and it is asserted in the test suite rather than described in a policy. A build where a minor could be shown a weight does not pass.',
      whatAChildDoesGet:
        'Movement, growth in their own terms, and a coach that is calibrated to their age. No calorie figure, no target, no comparison to anybody else, and no condition guidance of any kind.',
      // Said plainly, because a buyer will find out anyway and it is
      // better they find out from us.
      whatWeDoNotDo:
        'Age is self-declared at registration. Ofcom’s 2026 position is that self-declaration is not highly effective age assurance. Our protections are strongest exactly where a wrong age would matter most, but the declaration itself is unverified and you should weigh that.',
      guardian:
        'An account under 18 cannot be created without a guardian email, and it activates only when that guardian confirms.',
      strictLexicon: {
        what: 'Copy that may reach a minor uses a stricter word list than the general one, and it applies to partner marketing exactly as it applies to ours.',
        adds: ['body', 'shape', 'size', 'compete', 'beat', 'rank'],
      },
    };
  }

  /**
   * The DCB0129 hazard log, open.
   *
   * Open for the same reason as the rest of this controller: a clinical
   * risk assessment nobody outside the company can read is an assertion
   * rather than an assurance. It also means the officer, a reviewer and a
   * buyer are all looking at the same document — which is not true of any
   * hazard log kept in a spreadsheet.
   */
  @Get('hazards')
  hazards() {
    const log = hazardLog();
    return {
      preamble: HAZARD_LOG_PREAMBLE,
      standard: 'DCB0129 — Clinical Risk Management: its Application in the Manufacture of Health IT Systems',
      ...log,
      matrix: {
        severity: SEVERITY_MEANING,
        likelihood: LIKELIHOOD_MEANING,
        acceptability: {
          '1-2': 'Acceptable.',
          '3': 'Undesirable — acceptable only where further risk reduction is impractical.',
          '4-5': 'Unacceptable. The system must not be deployed carrying this.',
        },
      },
      whatThisIsNot:
        'A hazard log is not a safety case. The safety case is the argument that these residual ' +
        'risks are acceptable, made and signed by the Clinical Safety Officer. This is the ' +
        'evidence that argument would be built from.',
    };
  }

  /** The condition catalogue as a clinician would want to audit it. */
  @Get('conditions')
  conditions() {
    return {
      note:
        'Published so that anybody with the relevant expertise can check what is said before a member reads it. Every entry is dietary and lifestyle guidance restated against a member’s own record; none of it diagnoses and none of it touches medication.',
      conditions: CONDITION_IDS.map((id) => {
        const card = CONDITIONS[id];
        return {
          id: card.id,
          label: card.label,
          group: card.group,
          clinicianOnly: card.clinicianOnly,
          effects: card.effects,
        };
      }),
      medicationRule:
        'No card comments on a dose, a timing, an escalation or whether to continue. Where a condition has a prescribed treatment, the card names it as the prescriber’s and stops.',
      conflictRule:
        'Where two declared conditions disagree, the platform takes the cautious side, says that they disagree, and names who settles it. It does not silently pick one.',
    };
  }
}
