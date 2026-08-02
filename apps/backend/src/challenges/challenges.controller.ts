import { Body, Controller, Get, Param, Post, Req, UnauthorizedException } from '@nestjs/common';
import { IsIn, IsString, Length, MaxLength } from 'class-validator';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { tokenFrom } from '../auth/auth.guard';
import { ChallengesService } from './challenges.service';

class CreateChallengeDto {
  @IsString()
  @MaxLength(40)
  template!: string;
}

class JoinChallengeDto {
  @IsString()
  @Length(4, 12)
  code!: string;
}

class ActDto {
  @IsIn(['moved', 'support'])
  kind!: 'moved' | 'support';
}

@Controller('challenges')
export class ChallengesController {
  constructor(
    private readonly challenges: ChallengesService,
    private readonly auth: AuthService,
  ) {}

  /** The published formats. Readable without an account. */
  @Get('templates')
  templates() {
    return this.challenges.templates();
  }

  @Get('mine')
  async mine(@Req() req: Request) {
    const session = this.session(req);
    return { challenges: await this.challenges.mine(session.uid) };
  }

  @Post()
  async create(@Req() req: Request, @Body() body: CreateChallengeDto) {
    const { uid, name } = await this.who(req);
    return this.challenges.create(body.template, uid, name);
  }

  @Post('join')
  async join(@Req() req: Request, @Body() body: JoinChallengeDto) {
    const { uid, name } = await this.who(req);
    return this.challenges.join(body.code, uid, name);
  }

  @Get(':id')
  async progress(@Req() req: Request, @Param('id') id: string) {
    this.session(req);
    return this.challenges.progress(id);
  }

  @Post(':id/act')
  async act(@Req() req: Request, @Param('id') id: string, @Body() body: ActDto) {
    const session = this.session(req);
    return this.challenges.record(id, session.uid, body.kind);
  }

  private session(req: Request) {
    const token = tokenFrom(req);
    const session = token ? this.auth.verify(token) : null;
    if (!session) throw new UnauthorizedException('no valid session');
    return session;
  }

  /** The member's display name, so a teammate sees a person, not an id. */
  private async who(req: Request): Promise<{ uid: string; name: string }> {
    const session = this.session(req);
    const me = await this.auth.me(session);
    return { uid: session.uid, name: me.displayName };
  }
}
