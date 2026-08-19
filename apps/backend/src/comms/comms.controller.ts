import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  CHANNEL_DEFINITIONS,
  EVENT_CATEGORIES,
  EVENT_SEVERITIES,
  GUARDIAN_COPY_EVENTS,
  MANDATORY_EVENTS,
  ADULT_ONLY_EVENTS,
  COACHING_EVENTS,
  TEMPLATE_TOKENS,
  channelCoverage,
} from '@jessmove/shared';
import { CommsService } from './comms.service';
import { SendEventDto } from './comms.dto';
import { AdminOnly } from '../auth/auth.guard';

@Controller('comms')
export class CommsController {
  constructor(private readonly comms: CommsService) {}

  /** The whole catalogue, grouped. This is the architecture, as data. */
  @Get('catalogue')
  catalogue() {
    return this.comms.catalogue();
  }

  /** The contract that governs delivery. Nothing here is secret. */
  @Get('policy')
  policy() {
    return {
      categories: EVENT_CATEGORIES,
      severities: EVENT_SEVERITIES,
      channels: CHANNEL_DEFINITIONS,
      coverage: channelCoverage(),
      tokens: TEMPLATE_TOKENS,
      counts: {
        mandatory: MANDATORY_EVENTS.length,
        adultOnly: ADULT_ONLY_EVENTS.length,
        coaching: COACHING_EVENTS.length,
        guardianCopy: GUARDIAN_COPY_EVENTS.length,
      },
      resolutionOrder: [
        'age — adultOnly events do not exist below 18, and nothing overrides it',
        'coach presence — off means off for coaching events',
        'context — Law 2, a held context blocks a coaching nudge',
        'quiet hours and the daily cap',
        'channel consent — which mandatory events bypass',
      ],
      note: 'mandatory bypasses preferences. It never bypasses age.',
    };
  }

  /** Resolve without sending — the dry run behind "why did I not get this?" */
  @AdminOnly()
  @Post('preview')
  preview(@Body() body: SendEventDto) {
    return this.comms.preview(body.event, body.to, body.values ?? {});
  }

  @AdminOnly()
  @Post('send')
  send(@Body() body: SendEventDto) {
    return this.comms.send(body.event, body.to, body.values ?? {});
  }

  @AdminOnly()
  @Get('deliveries')
  deliveries(@Query('limit') limit?: string) {
    return this.comms.deliveries(Number(limit) || 40);
  }

  @AdminOnly()
  @Get('stats')
  stats() {
    return this.comms.stats();
  }
}
