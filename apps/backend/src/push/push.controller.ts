import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { AdminOnly, SelfOnly } from '../auth/auth.guard';
import { NativePushService, type PushTransport } from './native-push.service';
import { PushService } from './push.service';

export class SubscribeDto {
  @IsUrl({ require_protocol: true })
  endpoint!: string;

  @IsString() @MaxLength(256) p256dh!: string;
  @IsString() @MaxLength(64) auth!: string;

  @IsOptional() @IsString() @MaxLength(64) userId?: string;

  /* Minutes east of UTC. -720..+840 covers every real zone including the
     fourteen-hour one; anything outside it is a broken client, not a
     place. */
  @IsOptional() @IsInt() @Min(-720) @Max(840) utcOffsetMinutes?: number;
}

export class UnsubscribeDto {
  @IsUrl({ require_protocol: true })
  endpoint!: string;
}

/**
 * A device token from the installed app.
 *
 * Not a URL, so it cannot reuse `SubscribeDto`: an APNs device token is
 * 64 hex characters and an FCM registration token is a long opaque
 * string. The bounds match the CHECK constraint in migration 0031 so a
 * rejection is a readable 400 rather than a 500 from Postgres.
 */
export class RegisterDeviceDto {
  @IsString() @MinLength(16) @MaxLength(4096) token!: string;

  @IsIn(['apns', 'fcm']) transport!: PushTransport;

  /*
   * Required, unlike the browser's optional one, and that difference is
   * the point rather than an inconsistency.
   *
   * A Web Push subscription can be anonymous because the endpoint is
   * itself the capability: the browser issued it, and holding it is what
   * lets anything be sent there. A device token is not — it is bound to a
   * member by this claim alone, so an optional id would let anyone
   * register a device against somebody else's account and receive their
   * prompts. `@SelfOnly` then checks it against the session.
   *
   * Nothing is lost: a token with no member cannot be selected by the
   * scheduler, which joins on the user id, so an anonymous registration
   * would be a row that could never be sent to.
   */
  @IsString() @MaxLength(64) userId!: string;

  @IsOptional() @IsInt() @Min(-720) @Max(840) utcOffsetMinutes?: number;
}

export class UnregisterDeviceDto {
  @IsString() @MinLength(16) @MaxLength(4096) token!: string;
}

export class TestPushDto {
  @IsOptional() @IsString() @MaxLength(64) userId?: string;
  @IsOptional() @IsString() @MaxLength(80) title?: string;
  @IsOptional() @IsString() @MaxLength(200) body?: string;
}

@Controller('push')
export class PushController {
  constructor(
    private readonly push: PushService,
    private readonly native: NativePushService,
  ) {}

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
      utcOffsetMinutes: body.utcOffsetMinutes ?? null,
    });
  }

  @Post('unsubscribe')
  unsubscribe(@Body() body: UnsubscribeDto): Promise<{ removed: boolean }> {
    return this.push.unsubscribe(body.endpoint);
  }

  /**
   * The installed app's registration, which has no Web Push equivalent.
   *
   * A Capacitor webview has no `PushManager`, so the shell registers with
   * APNs or FCM natively and hands the token here. Same shape of promise
   * as `/push/subscribe` and the same time-zone reasoning: the scheduler
   * runs in UTC and the device is the only thing that knows where it is.
   */
  @SelfOnly('userId')
  @Post('device')
  registerDevice(@Body() body: RegisterDeviceDto): Promise<{ stored: true }> {
    return this.native.register({
      token: body.token,
      transport: body.transport,
      userId: body.userId,
      utcOffsetMinutes: body.utcOffsetMinutes ?? null,
    });
  }

  @Post('device/remove')
  unregisterDevice(@Body() body: UnregisterDeviceDto): Promise<{ removed: boolean }> {
    return this.native.unregister(body.token);
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
