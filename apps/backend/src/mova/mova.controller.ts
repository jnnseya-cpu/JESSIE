import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { MOVA_REFUSES, PRESENCE_DEFINITIONS } from '@jessmove/shared';
import { MovaService } from './mova.service';

class AskDto {
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  question!: string;

  @IsInt()
  @Min(10)
  @Max(120)
  age!: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  displayName?: string;
}

@Controller('mova')
export class MovaController {
  constructor(private readonly mova: MovaService) {}

  /** What the coach will and will not do — published, not implied. */
  @Get('policy')
  policy() {
    return {
      refuses: MOVA_REFUSES,
      presence: PRESENCE_DEFINITIONS,
      note: 'These refusals are rules, not confidence thresholds. A better model does not unlock them.',
    };
  }

  @Post('ask')
  ask(@Body() body: AskDto) {
    return this.mova.ask(body.question, body.age, body.displayName);
  }
}
