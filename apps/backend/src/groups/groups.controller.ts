import { Body, Controller, Get, Param, Post, Req, UnauthorizedException } from '@nestjs/common';
import { IsIn, IsString, Length, MaxLength, MinLength } from 'class-validator';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { tokenFrom } from '../auth/auth.guard';
import { GroupsService, type GroupKind } from './groups.service';
import { K_ANONYMITY_FLOOR } from './groups.logic';

class CreateGroupDto {
  @IsIn(['household', 'organisation'])
  kind!: GroupKind;

  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name!: string;
}

class JoinGroupDto {
  @IsString()
  @Length(4, 12)
  code!: string;
}

@Controller('groups')
export class GroupsController {
  constructor(
    private readonly groups: GroupsService,
    private readonly auth: AuthService,
  ) {}

  /** The privacy floor, stated so it can be checked rather than trusted. */
  @Get('policy')
  policy() {
    return {
      kAnonymityFloor: K_ANONYMITY_FLOOR,
      neverVisibleToAnOrganisation: [
        'individual health conditions',
        'exact movement history',
        'heart rate',
        'sleep readings',
        'disability status',
        'declined activities',
        'personal calendar details',
        'medical information',
        'individual risk scores',
      ],
      availableToAnOrganisation: [
        'aggregate participation above the floor',
        'active member count above the floor',
        'median days moved above the floor',
      ],
      note: 'The individual view is not permission-gated. No response shape in this module can carry one.',
    };
  }

  @Get('mine')
  async mine(@Req() req: Request) {
    return { groups: await this.groups.mine(this.session(req).uid) };
  }

  @Post()
  async create(@Req() req: Request, @Body() body: CreateGroupDto) {
    const who = await this.who(req);
    return this.groups.create(body.kind, body.name, who.uid, who.name, who.age);
  }

  @Post('join')
  async join(@Req() req: Request, @Body() body: JoinGroupDto) {
    const who = await this.who(req);
    return this.groups.join(body.code, who.uid, who.name, who.age);
  }

  @Get(':id/report')
  async report(@Req() req: Request, @Param('id') id: string) {
    this.session(req);
    return this.groups.report(id);
  }

  private session(req: Request) {
    const token = tokenFrom(req);
    const session = token ? this.auth.verify(token) : null;
    if (!session) throw new UnauthorizedException('no valid session');
    return session;
  }

  private async who(req: Request): Promise<{ uid: string; name: string; age: number }> {
    const session = this.session(req);
    const me = await this.auth.me(session);
    return { uid: session.uid, name: me.displayName, age: me.age };
  }
}
