import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Request } from 'express';
import { isValidUnsubscribeToken, NEWSLETTER } from '@jessmove/shared';
import { AdminOnly, SelfOnly } from '../auth/auth.guard';
import { assertScheduler } from '../blog/cron.guard';
import { NewsletterService } from './newsletter.service';
import { ComposeDto, ConsentDto, IssueStatusDto } from './newsletter.dto';

/**
 * The newsletter's surface.
 *
 * Three audiences, three levels of access, and the split matters:
 *
 * - **Staff** compose, review, approve and send. `@AdminOnly()`.
 * - **A member** reads and changes their own consent. `@SelfOnly('userId')`.
 * - **Anybody holding an unsubscribe token** may stop the emails, with no
 *   session at all — because an unsubscribe that requires a login is an
 *   unsubscribe that gets replaced by a spam report.
 *
 * The scheduler's entry point is guarded by the shared secret rather than
 * a session, since a cron has no session, and it is the one route that can
 * cause mail to leave the building without a person pressing anything.
 */
@Controller('newsletter')
export class NewsletterController {
  constructor(private readonly newsletter: NewsletterService) {}

  private guard(): void {
    if (!this.newsletter.available) {
      throw new ServiceUnavailableException('the newsletter needs a database');
    }
  }

  /* ---------------------------------------------------------------- *
   * Staff
   * ---------------------------------------------------------------- */

  /**
   * This week's composed copy, the stored issues and the audience.
   *
   * The audience count is here rather than on its own endpoint because a
   * reviewer needs it in the same glance as the copy: approving a mailout
   * without knowing whether it reaches nine people or nine hundred is not
   * reviewing.
   */
  @Get('console')
  @AdminOnly()
  async console(@Query('week') week?: string) {
    this.guard();
    const issueKey = week?.trim() || this.newsletter.currentIssueKey();
    const [issues, audience] = await Promise.all([
      this.newsletter.recent(),
      this.newsletter.audience(),
    ]);
    const approver = standingApprover();
    return {
      issueKey,
      preview: this.newsletter.preview(issueKey),
      issues,
      audience,
      autoApproveBy: approver,
      cadence: NEWSLETTER.cadence,
      says: approver
        ? `Automatic weekly sending is on, under the standing approval of ${approver}.`
        : 'Automatic sending is off. The scheduler will compose and queue an issue for review, and it will wait there until somebody approves it.',
    };
  }

  /** Create this week's issue if it does not exist. Idempotent. */
  @Post('issues')
  @AdminOnly()
  async compose(@Body() body: ComposeDto) {
    this.guard();
    const issueKey = body.issueKey ?? this.newsletter.currentIssueKey();
    const issue = await this.newsletter.ensureIssue(issueKey);
    return { ...issue, says: `Issue ${issueKey} is ${issue.status}.` };
  }

  @Post('issues/:issueKey/status')
  @AdminOnly()
  async status(@Param('issueKey') issueKey: string, @Body() body: IssueStatusDto) {
    this.guard();
    try {
      const issue = await this.newsletter.transition(issueKey, body.to, body.reviewer);
      return {
        ...issue,
        says:
          body.to === 'approved'
            ? `Approved by ${issue.reviewedBy}. It will go out on the next scheduled run, or now if you send it.`
            : `Issue ${issueKey} is ${issue.status}.`,
      };
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @Post('issues/:issueKey/send')
  @AdminOnly()
  async send(@Param('issueKey') issueKey: string) {
    this.guard();
    try {
      return await this.newsletter.sendIssue(issueKey);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @Get('issues/:issueKey/sends')
  @AdminOnly()
  async sends(@Param('issueKey') issueKey: string) {
    this.guard();
    return { issueKey, outcomes: await this.newsletter.sendsFor(issueKey) };
  }

  /* ---------------------------------------------------------------- *
   * The scheduler
   * ---------------------------------------------------------------- */

  /**
   * The weekly run.
   *
   * What it does depends on one variable, and the default is the cautious
   * one. With `NEWSLETTER_AUTO_APPROVE_BY` unset it composes the issue and
   * leaves it in review — automatic preparation, manual sending. With that
   * variable set to a person's name, that person has given standing
   * approval for copy which is composed deterministically from the site's
   * own published summaries, and the run sends.
   *
   * Standing approval is not the same as no approval, and the difference
   * is the whole reason it is expressed as a name rather than a boolean:
   * every issue sent this way records that person in `reviewed_by`, so the
   * accountability the editorial control exists to create is still
   * created. What makes it defensible here — and not on the blog, where
   * an agent writes original health prose — is that nothing in a
   * newsletter issue is new copy. Every sentence is assembled from
   * `LINK_TARGETS`, which is human-written and already published on the
   * site, so approving the mechanism once is approving the output.
   */
  @Post('cron')
  async cron(@Req() req: Request) {
    assertScheduler(req);
    this.guard();

    const issueKey = this.newsletter.currentIssueKey();
    const issue = await this.newsletter.ensureIssue(issueKey);

    if (issue.status === 'sent') {
      return {
        issueKey,
        action: 'none',
        status: issue.status,
        says: `Issue ${issueKey} has already gone out. Nothing to do.`,
      };
    }

    /*
     * An issue a person already approved gets sent, standing approval or
     * not. Approval is the control; once a named human has given it, making
     * them come back and press a second button is not extra safety, it just
     * means the weekly send silently never happens.
     */
    if (issue.status === 'approved') {
      const outcome = await this.newsletter.sendIssue(issueKey);
      return {
        ...outcome,
        action: 'sent',
        says: `${outcome.says} Approved by ${issue.reviewedBy}.`,
      };
    }

    if (issue.status === 'draft') {
      await this.newsletter.transition(issueKey, 'in_review');
    }

    const approver = standingApprover();
    if (!approver) {
      // Read the status back rather than asserting it. An earlier version
      // returned a hard-coded 'in_review' here, which reported the wrong
      // state for any issue that was already further along — a status field
      // that is decoration rather than fact is worse than no status field.
      const waiting = await this.newsletter.byKey(issueKey);
      return {
        issueKey,
        action: 'queued',
        status: waiting?.status ?? 'in_review',
        says: `Issue ${issueKey} is composed and waiting for a reviewer. Set NEWSLETTER_AUTO_APPROVE_BY to a real name to have the scheduler approve and send it as well.`,
      };
    }

    const current = await this.newsletter.byKey(issueKey);
    if (current?.status === 'in_review') {
      await this.newsletter.transition(issueKey, 'approved', approver);
    }

    const outcome = await this.newsletter.sendIssue(issueKey);
    return {
      ...outcome,
      action: 'sent',
      says: `${outcome.says} Approved under the standing approval of ${approver}.`,
    };
  }

  /* ---------------------------------------------------------------- *
   * A member's own consent
   * ---------------------------------------------------------------- */

  @Get('consent/:userId')
  @SelfOnly('userId')
  async readConsent(@Param('userId') userId: string) {
    this.guard();
    try {
      const state = await this.newsletter.consentFor(userId);
      return {
        ...state,
        says: state.on
          ? 'Product email is on. One email a week, and you can stop it from any of them.'
          : 'Product email is off. Nothing marketing-related is sent.',
      };
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @Post('consent/:userId')
  @SelfOnly('userId')
  async writeConsent(@Param('userId') userId: string, @Body() body: ConsentDto) {
    this.guard();
    try {
      const state = await this.newsletter.setConsent(userId, body.set === 'on');
      return {
        ...state,
        says: state.on ? 'Thank you — you are on the list.' : 'Stopped. No more product email.',
      };
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  /* ---------------------------------------------------------------- *
   * Unsubscribing, with no session
   * ---------------------------------------------------------------- */

  /**
   * One click, from inside an email, on a phone, months later.
   *
   * No session, no password, no confirmation step. The response is the
   * same whether the token matched anybody, because a route that says
   * "unknown token" is a way to test tokens and the person clicking
   * cannot use the distinction anyway.
   */
  @Get('unsubscribe')
  async unsubscribe(@Query('t') token?: string) {
    this.guard();
    const clean = (token ?? '').trim();

    /*
     * One reply, word for word, whatever happened.
     *
     * A malformed token, a well-formed token belonging to nobody, and a real
     * opt-out all return the same sentence. Any difference between them is a
     * way to probe which tokens exist, and it buys the person clicking
     * nothing — they want the emails to stop, and after this they have.
     */
    const same = { stopped: true, says: 'Stopped. You will not receive further product email.' };
    if (!isValidUnsubscribeToken(clean)) return same;
    await this.newsletter.unsubscribeByToken(clean);
    return same;
  }
}

/**
 * The name standing behind automatically-sent issues, if anybody is.
 *
 * Read from the environment rather than a database row because it is a
 * deployment decision made once by the person accountable for the
 * platform's outbound copy, and because a value that grants standing
 * approval to send mail to every customer should not be editable through
 * the application's own admin surface.
 */
function standingApprover(): string | null {
  const name = (process.env.NEWSLETTER_AUTO_APPROVE_BY ?? '').trim();
  return name.length >= 2 ? name : null;
}
