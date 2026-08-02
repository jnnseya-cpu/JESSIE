import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AdminOnly, SelfOnly } from '../auth/auth.guard';
import { MailService } from './mail.service';
import { PreviewMailDto, SendMailDto } from './mail.dto';

@Controller('mail')
export class MailController {
  constructor(private readonly mail: MailService) {}

  /** Is SMTP wired, and on which transport. No credentials are returned. */
  @Get('status')
  async status() {
    return this.mail.status();
  }

  /**
   * Live reachability test: connects and logs in on both submission
   * ports from the instance serving this request, sends nothing, and
   * says which door works. One page load answers "password or network".
   */
  @Get('probe')
  async probe() {
    return this.mail.probeConnection();
  }

  /** Render a catalogue event without sending it. */
  @AdminOnly()
  @Post('preview')
  preview(@Body() body: PreviewMailDto) {
    try {
      return this.mail.render(body.event, body.values ?? {}, body.body);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  /** Send a test. Records as sandbox when SMTP is not configured. */
  @AdminOnly()
  @Post('send')
  async send(@Body() body: SendMailDto) {
    try {
      return await this.mail.send(body.event, body.to, body.values ?? {}, body.body);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @AdminOnly()
  @Get('recent')
  async recent(@Query('limit') limit?: string) {
    return this.mail.recent(Number(limit) || 25);
  }
}
