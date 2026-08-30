import { Controller, Get } from '@nestjs/common';
import {
  AGENT_CODES,
  AGE_MODES,
  BRAND,
  CONTENT_GOVERNANCE,
  DELIVERY_TIERS,
  KPI_GROUPS,
  MISFIRE_ERROR_BUDGET,
  MOVEMENT_VARIANTS,
  NUDGE_EVENT,
  RECLAIMED_MOMENTS,
  REQUIRED_VARIANTS,
  TAGLINES_SUPPORTING,
  TRACKING_EVENT_KEYS,
  type HealthReport,
} from '@jessmove/shared';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { BUILD_BRANCH, BUILD_COMMIT, BUILT_AT } from '../build-info';

/**
 * Which commit is live, from the platform's own environment.
 *
 * Vercel injects these; a deployment elsewhere can set them by hand. All
 * null means "nobody told this build what it was", which is itself worth
 * knowing.
 */
function buildInfo(): HealthReport['build'] {
  // Stamped into the artefact at build time rather than read from the
  // environment, because whether a platform exposes its git metadata to a
  // running function is a platform decision that changes.
  const commit = BUILD_COMMIT ?? process.env.VERCEL_GIT_COMMIT_SHA ?? null;
  return {
    commit,
    shortCommit: commit ? commit.slice(0, 7) : null,
    branch: BUILD_BRANCH ?? process.env.VERCEL_GIT_COMMIT_REF ?? null,
    deployedAt: BUILT_AT,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? null,
  };
}

@Controller()
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(private readonly gateway: AiGatewayService) {}

  @Get('health')
  health(): HealthReport {
    const providers = this.gateway.health();
    const anyConfigured = providers.some((p) => p.configured);

    return {
      status: anyConfigured ? 'ok' : 'degraded',
      version: '1.0.0',
      uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000),
      build: buildInfo(),
      checks: {
        ai_gateway: {
          status: anyConfigured ? 'ok' : 'degraded',
          detail: anyConfigured
            ? `${providers.filter((p) => p.configured).length}/${providers.length} providers configured`
            : 'No provider configured — serving cached prescriptions only',
        },
      },
    };
  }

  /** Machine-readable summary of the operating system's invariants. */
  @Get('system')
  system() {
    return {
      platform: BRAND.platform,
      descriptor: BRAND.descriptor,
      app: BRAND.app,
      coach: BRAND.coach,
      unit: BRAND.unit,
      ageModes: AGE_MODES,
      deliveryTiers: DELIVERY_TIERS,
      requiredVariants: MOVEMENT_VARIANTS,
      agents: AGENT_CODES.length,
      /*
       * The invariants this endpoint says it publishes, actually
       * published. All of these were specified in `packages/shared` and
       * read by nothing, so "machine-readable summary of the operating
       * system's invariants" described a smaller set than the system had.
       */
      taglines: TAGLINES_SUPPORTING,
      reclaimedMoments: RECLAIMED_MOMENTS,
      kpiGroups: KPI_GROUPS,
      contentGovernance: CONTENT_GOVERNANCE,
      variantsEveryMovementNeeds: REQUIRED_VARIANTS,
      nudge: {
        events: NUDGE_EVENT,
        /*
         * Law 2 has a number. A nudge fired when somebody cannot move is
         * a defect against the context engine, and this is the share of
         * delivered Snaps that may be misfires over 28 days before that
         * counts as the engine being wrong rather than unlucky.
         */
        misfireErrorBudget: MISFIRE_ERROR_BUDGET,
      },
      tracking: {
        events: TRACKING_EVENT_KEYS,
        note: 'The whole vocabulary. Nothing outside this list is ever sent to a measurement vendor.',
      },
    };
  }
}
