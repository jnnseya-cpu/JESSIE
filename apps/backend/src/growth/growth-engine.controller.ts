import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type { Request } from 'express';
import {
  GROWTH_TOOLS,
  GROWTH_TOOL_IDS,
  PARTNER_DISCLOSURE,
  PLATFORMS,
  PLATFORM_IDS,
  type GrowthToolId,
  type PlatformId,
} from '@jessmove/shared';
import { AuthService } from '../auth/auth.service';
import { tokenFrom } from '../auth/auth.guard';
import { GrowthEngineService } from './growth-engine.service';
import { GrowthResultsService } from './growth-results.service';

class WriteDto {
  @IsIn(GROWTH_TOOL_IDS)
  toolId!: GrowthToolId;

  @IsOptional()
  @IsIn(PLATFORM_IDS)
  platform?: PlatformId;

  @IsString()
  @MinLength(8)
  @MaxLength(2000)
  brief!: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  audience?: string;

  @IsOptional()
  @IsBoolean()
  strict?: boolean;
}

class ResultDto {
  @IsOptional()
  @IsIn(GROWTH_TOOL_IDS)
  toolId?: GrowthToolId;

  @IsOptional()
  @IsIn(PLATFORM_IDS)
  platform?: PlatformId;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  campaign?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  subject?: string;

  @IsOptional()
  @IsISO8601()
  postedAt?: string;

  @IsInt() @Min(0) reach!: number;
  @IsInt() @Min(0) clicks!: number;
  @IsInt() @Min(0) signups!: number;
  @IsInt() @Min(0) paid!: number;
}

/**
 * The AI Growth Engine, as a set of routes.
 *
 * Everything here reads the partner from the session and never from a
 * parameter. A growth engine that took a partner id in the URL would let
 * any signed-in account read another partner's campaign results, which are
 * commercially sensitive in a way most of this platform's data is not —
 * they are somebody's business performance.
 *
 * The tool catalogue is open. A partner deciding whether to join is
 * entitled to read exactly what these tools do, what they cost and what
 * they refuse to do, before signing anything.
 */
@Controller('growth/engine')
export class GrowthEngineController {
  constructor(
    private readonly auth: AuthService,
    private readonly engine: GrowthEngineService,
    private readonly results: GrowthResultsService,
  ) {}

  private me(req: Request): string {
    const token = tokenFrom(req);
    const session = token ? this.auth.verify(token) : null;
    if (!session) throw new UnauthorizedException('no valid session');
    return session.uid;
  }

  /** What the ten tools are, what they cost, and what they will not do. */
  @Get('tools')
  tools() {
    return {
      tools: GROWTH_TOOL_IDS.map((id) => GROWTH_TOOLS[id]),
      platforms: PLATFORM_IDS.map((id) => PLATFORMS[id]),
      disclosure: PARTNER_DISCLOSURE,
      neverDoes: [
        'post, send or publish anything anywhere on your behalf',
        'use the words this platform refuses — the lexicon applies to a partner exactly as it applies to us',
        'make a health claim, or let one through in the fourth bullet of a landing page',
        'state a figure about your business that nothing here can verify',
        'guess a posting time, an audience or a recommendation from anything but your own recorded results',
      ],
      howItSplits:
        'Six tools write and cost allowance. Four measure, cost nothing, and refuse rather than ' +
        'guess when your history is too thin — because a recommendation invented from nothing is ' +
        'worse than none, since you would act on it.',
    };
  }

  /** Draft something. Metered against the partner's own allowance. */
  @Post('write')
  write(@Req() req: Request, @Body() body: WriteDto) {
    return this.engine.write({ ...body, partnerId: this.me(req) });
  }

  /** One of the four reports, computed from this partner's own results. */
  @Get('measure/:toolId')
  measure(@Req() req: Request, @Param('toolId') toolId: string) {
    const id = GROWTH_TOOL_IDS.find((t) => t === toolId);
    if (!id) throw new UnauthorizedException(`no tool called "${toolId}"`);
    return this.engine.measure(this.me(req), id);
  }

  /**
   * The whole dashboard in one request.
   *
   * Four reports on one screen means four requests on every load unless
   * they arrive together, and a dashboard that paints in four stages looks
   * broken on a phone.
   */
  @Get('dashboard')
  async dashboard(@Req() req: Request) {
    const partnerId = this.me(req);
    const [analytics, performance, audience, postingTime, results, outputs] = await Promise.all([
      this.engine.measure(partnerId, 'analytics'),
      this.engine.measure(partnerId, 'performance'),
      this.engine.measure(partnerId, 'audience'),
      this.engine.measure(partnerId, 'posting_time'),
      this.results.forPartner(partnerId),
      this.results.outputs(partnerId, 10),
    ]);

    return {
      analytics,
      performance,
      audience,
      postingTime,
      recentResults: results.slice(0, 20),
      recentDrafts: outputs,
      disclosure: PARTNER_DISCLOSURE,
    };
  }

  /** Record what something you published actually did. */
  @Post('results')
  record(@Req() req: Request, @Body() body: ResultDto) {
    return this.results.record(this.me(req), body);
  }

  @Get('results')
  list(@Req() req: Request) {
    return this.results.forPartner(this.me(req));
  }

  @Delete('results/:id')
  remove(@Req() req: Request, @Param('id') id: string) {
    return this.results.remove(this.me(req), id);
  }

  /** Drafts already produced, so a partner can come back to one. */
  @Get('drafts')
  drafts(@Req() req: Request, @Query('limit') limit?: string) {
    const n = Math.min(100, Math.max(1, Number(limit) || 25));
    return this.results.outputs(this.me(req), n);
  }
}
