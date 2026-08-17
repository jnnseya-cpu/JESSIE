import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { AuthModule } from '../auth/auth.module';
import { NewsletterController } from './newsletter.controller';
import { NewsletterService } from './newsletter.service';

/**
 * The newsletter reuses the existing mail service rather than opening a
 * second path to SMTP. That keeps one place where credentials are read,
 * one place where a delivery is logged to `mail_log`, and one branded
 * wrapper — so a newsletter and a password reset cannot drift into looking
 * like two different companies.
 */
@Module({
  imports: [MailModule, AuthModule],
  controllers: [NewsletterController],
  providers: [NewsletterService],
  exports: [NewsletterService],
})
export class NewsletterModule {}
