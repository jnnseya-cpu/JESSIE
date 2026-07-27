import { Controller, Get } from '@nestjs/common';
import {
  AGENT_CODES,
  BRAND,
  DELIVERY_TIERS,
  AGE_MODES,
  MOVEMENT_VARIANTS,
  type HealthReport,
} from '@jessie-os/shared';
import { AiGatewayService } from '../ai/ai-gateway.service';

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
      expansion: BRAND.expansion,
      app: BRAND.app,
      coach: BRAND.coach,
      unit: BRAND.unit,
      ageModes: AGE_MODES,
      deliveryTiers: DELIVERY_TIERS,
      requiredVariants: MOVEMENT_VARIANTS,
      agents: AGENT_CODES.length,
    };
  }
}
