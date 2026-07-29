import { IsEmail, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class SendMailDto {
  @IsString() @MaxLength(120) event!: string;
  @IsEmail() to!: string;
  @IsOptional() @IsObject() values?: Record<string, string>;
  @IsOptional() @IsString() @MaxLength(4000) body?: string;
}

export class PreviewMailDto {
  @IsString() @MaxLength(120) event!: string;
  @IsOptional() @IsObject() values?: Record<string, string>;
  @IsOptional() @IsString() @MaxLength(4000) body?: string;
}
