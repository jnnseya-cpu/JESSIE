import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { AdminOnly } from '../auth/auth.guard';
import { PushService } from './push.service';

export class SubscribeDto {
  @IsUrl({ require_protocol: true })
  endpoint!: string;

  @IsString() @MaxLength(256) p256dh!: string;
  @IsString() @MaxLength(64) auth!: string;

  @IsOptional() @IsString() @MaxLength(64) userId?: string;
}

export class UnsubscribeDto {
  @IsUrl({ require_protocol: true })
  endpoint!: string;
}

export class TestPushDto {
  @IsOptional() @IsString() @MaxLength(64) userId?: string;
  @IsOptional() @IsString() @MaxLength(80) title?: string;
  @IsOptional() @IsString() @MaxLength(200) body?: string;
}

@Controller('push')
export class PushController {
  constructor(private readonly push: PushService) {}

  @Get('status')
  status(): Record<string, unknown> {
    return this.push.status();
  }

  @Post('subscribe')
  subscribe(@Body() body: SubscribeDto): Promise<{ stored: true }> {
    return this.push.subscribe({
      endpoint: body.endpoint,
      p256dh: body.p256dh,
      auth: body.auth,
      userId: body.userId ?? null,
    });
  }

  @Post('unsubscribe')
  unsubscribe(@Body() body: UnsubscribeDto): Promise<{ removed: boolean }> {
    return this.push.unsubscribe(body.endpoint);
  }

  /** Admin: prove background delivery works on a real device. */
  @AdminOnly()
  @Post('test')
  test(@Body() body: TestPushDto): Promise<Record<string, unknown>> {
    return this.push.send(
      {
        title: body.title ?? 'Jess Move',
        body: body.body ?? 'Background notifications are working. Small moves, powerful change.',
        url: 'https://www.jessmove.com/account',
      },
      body.userId,
    );
  }
}
