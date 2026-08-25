import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  AGENT_REGISTRY,
  AI_PROVIDERS,
  AiGatewayError,
  FREE_TIER,
  NEVER_SEND_TO_MODEL,
  NO_ACCOUNT_NO_AI,
  fenceAsData,
  findInjections,
  freeGrantReference,
  freeGrantsDue,
  injectionVerdict,
  isPlatformPayer,
  platformDailyAcu,
  type AiCompletionRequest,
  type AiCompletionResponse,
  type AiProvider,
  type AiProviderHealth,
  type InjectionFinding,
} from '@jessmove/shared';
import { ACU_PER_GBP, COST_PROTECTION_MULTIPLE } from '@jessmove/body-command';
import { WalletService, type SpendResult } from '../acu/wallet.service';
import { SecurityService } from '../security/security.service';
import { MODEL_PROVIDERS, type ModelProvider } from './provider.interface';

/**
 * What went wrong with a provider, said in a way that is safe to show.
 *
 * Provider errors quote request bodies, and some of them include the
 * first characters of the key. This output is read in a browser and
 * pasted into messages, so it is classified rather than echoed — and the
 * classes are chosen to map onto what somebody would actually do next.
 */
function classifyProviderError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const status = /\b(4\d\d|5\d\d)\b/.exec(raw)?.[1];

  if (/abort|timeout/i.test(raw)) {
    return 'Timed out after fifteen seconds. The key may be fine and the provider slow.';
  }
  if (status === '401' || status === '403' || /unauthor|invalid.?api.?key|permission/i.test(raw)) {
    return 'The provider rejected the key. It is wrong, revoked, or for a different project.';
  }
  if (status === '429' || /rate.?limit|quota/i.test(raw)) {
    return 'Rate limited or out of quota. The key is valid; the account has nothing left to spend.';
  }
  if (status === '402' || /billing|credit|payment/i.test(raw)) {
    return 'The key is valid and the account has no credit on it.';
  }
  if (status === '404' || /model.*not.*found|unknown model/i.test(raw)) {
    return 'The key works but the configured model name is not available to this account.';
  }
  if (status?.startsWith('5')) {
    return 'The provider returned a server error. Nothing to fix at this end — try again later.';
  }
  return `The call did not succeed${status ? ` (HTTP ${status})` : ''}. Check the deployment logs for the detail.`;
}

/** An ACU hold taken before a provider call, to be settled or released. */
interface Hold {
  readonly held: boolean;
  readonly walletId: string | null;
  readonly acus: number;
  readonly grants: readonly { grantId: string; amount: number }[];
}

/**
 * Thrown when there is no allowance to run an action on.
 *
 * A distinct type rather than a generic gateway error, because this is not
 * a failure — the platform worked exactly as designed. The caller should
 * tell the member what is paused and what still works, which is what the
 * wallet's own message says, and offer a top-up rather than a retry.
 */
export class AllowanceExhaustedError extends Error {
  readonly statusCode = 402;
  constructor(
    readonly reason: string,
    readonly memberMessage: string,
    readonly detail: { required: number; balance: number; agent: string; payer: string },
  ) {
    super(memberMessage);
    this.name = 'AllowanceExhaustedError';
  }
}

/**
 * Thrown when text arriving from outside is shaped like an instruction to
 * the system rather than content for it.
 *
 * A 400 rather than a 403, and the message says what to do rather than
 * what was detected. Naming the pattern that fired would turn every
 * refusal into a free lesson in which phrasings get through, and the
 * person most likely to read it carefully is the one probing.
 */
export class InstructionRefusedError extends Error {
  readonly statusCode = 400;
  constructor(readonly findings: readonly InjectionFinding[]) {
    super(
      'That message is written as an instruction to the system rather than as something to ' +
        'read, so it has not been sent anywhere. Rephrase it as what you actually want to know.',
    );
    this.name = 'InstructionRefusedError';
  }
}

/**
 * The AI Gateway. §19.
 *
 * One entry point for every model call in the platform. It owns:
 *   - provider selection and the fallback chain,
 *   - the redaction pass (§22.3 — no prompt leakage),
 *   - the instruction check on anything that came from outside,
 *   - the per-agent ACU cost ceiling (§25.2),
 *   - the request timeout,
 *   - the decision log.
 *
 * Agents never talk to a vendor SDK directly.
 */
@Injectable()
export class AiGatewayService {
  private readonly logger = new Logger(AiGatewayService.name);

  constructor(
    @Inject(MODEL_PROVIDERS) private readonly providers: ModelProvider[],
    private readonly config: ConfigService,
    private readonly wallets: WalletService,
    /*
     * Optional on purpose. A gateway that cannot start because the
     * security log is unavailable is a worse outcome than one that runs
     * with the log missing — and the security module is global, so in a
     * real deployment this is always present.
     */
    @Optional() private readonly security?: SecurityService,
  ) {}

  /**
   * ACUs back to the pounds of provider cost they represent.
   *
   * This is a conversion, not a measurement, and that distinction was
   * where the margin went. It used to be handed a figure the adapters had
   * invented from token counts with no reference to any real price, and
   * `spend()` then checked that figure against itself in
   * `breachesProtectionRule` — a guard comparing a number to a number
   * derived from it cannot fail, and for the life of the platform it
   * never did.
   *
   * The ACU figure now comes from `acusForTokens`, which prices real
   * tokens at real published rates and applies the 4× once. Dividing it
   * back down here recovers the cost that produced it, so the guard is
   * checking an independent quantity again.
   */
  private costOf(acu: number): { providerCostGbp: number } {
    return { providerCostGbp: acu / ACU_PER_GBP / COST_PROTECTION_MULTIPLE };
  }

  /**
   * The wallet behind a payer.
   *
   * A member's own wallet, topped up with the free tier if any of it is
   * still owed. The one exception is the editorial agent, which writes the
   * blog: it has no member to charge and the easy answer would be to let
   * it through unbilled. It is not unbilled — it is billed to us, and a
   * model call nothing counts is a cost nobody can see and nobody can cap.
   * It draws a daily budget an operator sets, so an agent looping on a bad
   * prompt runs out of allowance rather than out of our card.
   *
   * That budget is topped up on read rather than on a schedule, because a
   * serverless deployment has no scheduler and a cron nobody runs is a
   * promise nobody keeps. It is idempotent within a day: the grant carries
   * the date in its reference, so concurrent requests on the same morning
   * still produce one day's budget.
   */
  private async walletFor(billTo: string): Promise<{ id: string }> {
    if (!isPlatformPayer(billTo)) {
      const wallet = await this.wallets.forSubject('user', billTo);
      await this.grantFreeTier(wallet.id, billTo);
      // An annual plan is paid once and delivered monthly; this is where
      // the months after the first are handed over.
      await this.wallets.releaseDueAnnualDeposits(billTo, wallet.id);
      return wallet;
    }

    const wallet = await this.wallets.forSubject('organisation', billTo);
    const today = new Date().toISOString().slice(0, 10);
    const reference = `${billTo}:${today}`;

    const alreadyToday = wallet.grants.some((g) => g.sourceRef === reference);
    if (!alreadyToday) {
      const daily = platformDailyAcu(billTo, process.env);
      if (daily > 0) {
        await this.wallets.depositAllowance(wallet.id, daily, reference);
        this.logger.log(`${billTo}: granted ${daily} ACU for ${today}`);
      }
    }
    return wallet;
  }

  /**
   * The free tier: fifty ACUs a month, for two months, and then never.
   *
   * Issued here rather than at registration for two reasons. An account
   * that never touches an AI feature never needs the grant, so the second
   * month is not spent on somebody who is not using it. And a grant made
   * at signup would sit there expiring while a member who came back in
   * week five found an empty wallet and no explanation.
   *
   * Idempotent by construction: each month's grant carries the account's
   * own reference, so a hundred concurrent calls on the same morning
   * produce one grant. When both months are used, nothing happens here
   * ever again and the hold below refuses.
   */
  private async grantFreeTier(walletId: string, userId: string): Promise<void> {
    const wallet = await this.wallets.get(walletId);
    if (!wallet) return;

    const created = wallet.grants
      .map((g) => g.grantedAt.getTime())
      .reduce((earliest, at) => Math.min(earliest, at), Date.now());
    const issued = wallet.grants.map((g) => g.sourceRef ?? '');

    const due = freeGrantsDue(new Date(created), new Date(), issued, userId);
    for (const month of due) {
      await this.wallets.depositAllowance(
        walletId,
        FREE_TIER.acusPerMonth,
        freeGrantReference(userId, month),
      );
      this.logger.log(
        `[${userId}] free tier month ${month + 1} of ${FREE_TIER.months}: ` +
          `${FREE_TIER.acusPerMonth} ACU`,
      );
    }
  }

  /**
   * The hold, taken before a single token is sent to a provider.
   *
   * This replaces a meter that ran *after* the call and only logged when
   * it was refused — which meant a member with an empty wallet still got
   * unlimited AI, and every call that forgot to name a payer got it free.
   * Charging after the fact is not metering; it is bookkeeping about money
   * already spent.
   *
   * The agent's registry ceiling is held rather than an estimate, because
   * the ceiling is the most that agent is permitted to consume and it is
   * the only number knowable before the call. What actually gets used is
   * settled afterwards and the rest goes back to the grants it came from.
   *
   * Two refusals, and both stop the call:
   *
   *  * **No payer.** There is no anonymous AI at all. The only free
   *    allowance on the platform is the free tier on an account — fifty
   *    ACUs a month for two months — so a call with nobody to charge is
   *    somebody who has not signed up, and they are told so.
   *  * **No balance.** A hard stop, not a warning. Non-AI features are
   *    untouched; only new model work pauses.
   *
   * A wallet that cannot be reached also stops the call. The older code
   * let an unreachable wallet through on the grounds that a member should
   * not lose an answer to an infrastructure fault, and that is a defensible
   * instinct — but it is also an unbounded free tap that opens exactly when
   * the database is unhealthy, which is the worst moment to be spending
   * money nobody is counting.
   */
  private async hold(request: AiCompletionRequest, ceiling: number): Promise<Hold> {
    if (ceiling <= 0) {
      // A deterministic-rules agent with a zero ceiling calls no provider
      // and costs nothing. Nothing to hold, nothing to refuse.
      return { held: true, walletId: null, acus: 0, grants: [] };
    }

    const billTo = request.billTo;
    if (!billTo) {
      /*
       * There is no anonymous AI. The only free allowance on the platform
       * is fifty ACUs a month for two months on an account, so a call with
       * nobody to charge is somebody who has not signed up — and the right
       * answer is the sentence explaining that, not an internal error.
       */
      throw new AllowanceExhaustedError('no_account', NO_ACCOUNT_NO_AI, {
        required: ceiling,
        balance: 0,
        agent: request.agent,
        payer: 'anonymous',
      });
    }

    const wallet = await this.walletFor(billTo);
    const result = await this.wallets.spend({
      walletId: wallet.id,
      agentCode: request.agent,
      reason: `${request.agent} — hold`,
      cost: this.costOf(ceiling),
    });

    if (!result.allowed) {
      const refused = result as Extract<SpendResult, { allowed: false }>;
      this.logger.log(
        `[${billTo}] ${request.agent} refused before the call: ${refused.reason} ` +
          `(needed ${refused.acusRequired}, had ${refused.balance})`,
      );
      throw new AllowanceExhaustedError(refused.reason, refused.message, {
        required: refused.acusRequired,
        balance: refused.balance,
        agent: request.agent,
        // Who was being charged decides what the refusal should say. A
        // visitor has no ACUs, so telling them theirs have run out is
        // nonsense they cannot act on.
        payer: billTo,
      });
    }

    return {
      held: true,
      walletId: wallet.id,
      acus: result.acusCharged,
      grants: result.grants,
    };
  }

  /**
   * Settles the hold against what the call actually used.
   *
   * The provider's own figure is authoritative and is usually below the
   * ceiling, so most calls end with something to hand back. A call that
   * somehow exceeded its ceiling is charged the difference rather than
   * being quietly written off — an agent consistently over its ceiling is
   * a pricing problem, and absorbing it hides the signal.
   */
  private async settle(hold: Hold, actual: number, agent: string, model: string): Promise<void> {
    if (!hold.walletId || hold.acus === 0) return;
    try {
      if (actual < hold.acus) {
        const unused = hold.acus - actual;
        // Proportional across the grants it came from, so purchased
        // allowance is returned as purchased allowance.
        let left = unused;
        const lines = hold.grants.map((g) => {
          const give = Math.min(g.amount, left);
          left -= give;
          return { grantId: g.grantId, amount: give };
        });
        await this.wallets.refund(hold.walletId, lines);
      } else if (actual > hold.acus) {
        const overage = actual - hold.acus;
        const charged = await this.wallets.spend({
          walletId: hold.walletId,
          agentCode: agent,
          reason: `${agent} via ${model} — over ceiling`,
          cost: this.costOf(overage),
        });

        /*
         * An overage the wallet cannot cover is compute already delivered
         * and not paid for. It used to be discarded — the refusal came
         * back, nothing read it, and the call was simply free above the
         * ceiling.
         *
         * It is not turned into a debt, because a wallet does not go
         * negative on this platform. It is written down as the loss it is,
         * next to the refund shortfalls, so the total is countable and an
         * agent that does it repeatedly is visible rather than merely
         * expensive. It should now be rare: the hold is priced at the
         * dearest rate the platform knows and almost every call is served
         * by something cheaper.
         */
        if (!charged.allowed) {
          this.logger.error(
            `[${agent}] ${overage} ACU over ceiling on ${model} could not be charged ` +
              `(${charged.reason}) — recorded as an unrecovered cost`,
          );
          await this.wallets.recordUnbilled(hold.walletId, {
            reference: `overage:${agent}:${hold.grants[0]?.grantId ?? model}:${actual}`,
            acus: overage,
            note: `${agent} via ${model} exceeded its ceiling and the balance could not cover it`,
          });
        }
      }
    } catch (error) {
      // The work is done and the hold already covers it. A settlement that
      // fails leaves the member charged the ceiling, which errs towards the
      // platform being paid rather than towards a free call.
      this.logger.warn(`settlement failed for ${agent}: ${(error as Error).message}`);
    }
  }

  /** Releases the whole hold. Nobody pays for an answer they did not get. */
  private async release(hold: Hold, agent: string): Promise<void> {
    if (!hold.walletId || hold.acus === 0) return;
    try {
      await this.wallets.refund(hold.walletId, hold.grants);
    } catch (error) {
      this.logger.error(`could not release the hold for ${agent}: ${(error as Error).message}`);
    }
  }

  /** Ordered chain, honouring AI_DEFAULT_PROVIDER and AI_FALLBACK_ORDER. */
  private chainFor(requested?: AiProvider): ModelProvider[] {
    const configuredOrder = (
      this.config.get<string>('AI_FALLBACK_ORDER') ?? AI_PROVIDERS.join(',')
    )
      .split(',')
      .map((p) => p.trim())
      .filter((p): p is AiProvider => (AI_PROVIDERS as readonly string[]).includes(p));

    const preferred =
      requested ?? this.config.get<AiProvider>('AI_DEFAULT_PROVIDER') ?? 'anthropic';

    const ordered: AiProvider[] = [
      preferred,
      ...configuredOrder.filter((p) => p !== preferred),
    ];

    return ordered
      .map((name) => this.providers.find((p) => p.name === name))
      .filter((p): p is ModelProvider => p !== undefined && p.isConfigured());
  }

  /**
   * §22.3 — user identifiers, names, calendar titles, clinical notes and
   * free-text responses are redacted before any external model call.
   * Model calls are logged with input hashes, not inputs.
   */
  private redact(request: AiCompletionRequest): AiCompletionRequest {
    const pattern = new RegExp(
      `\\b(${NEVER_SEND_TO_MODEL.join('|')})\\s*[:=]\\s*\\S+`,
      'gi',
    );
    return {
      ...request,
      messages: request.messages.map((m) => ({
        ...m,
        content: m.content.replace(pattern, (match) => {
          const [key] = match.split(/[:=]/);
          return `${key?.trim() ?? 'field'}:[REDACTED]`;
        }),
      })),
    };
  }

  /**
   * Nothing outside this platform gets to give it an instruction.
   *
   * Runs before the allowance is touched and before any provider is
   * reached, so a refusal costs the member nothing and costs us nothing.
   * That ordering is the point: an injection attempt that burned ACU would
   * be a way to drain somebody's allowance by writing to them.
   *
   * Two passes, and they are not the same defence:
   *
   *   **Detection** reads every message whatever its role, because member
   *   text does not only arrive in messages somebody remembered to mark —
   *   it arrives interpolated into a prompt the platform wrote. Scanning
   *   the finished text catches it either way.
   *
   *   **Fencing** applies to messages explicitly marked as coming from
   *   outside. It is the half that does not depend on a matcher, and it is
   *   the half that still works against a payload nobody has thought of:
   *   the content arrives inside a boundary the surrounding prompt has
   *   already described as data, with a marker the text cannot contain
   *   because it is generated per call.
   */
  private guardInstructions(request: AiCompletionRequest): AiCompletionRequest {
    const found: InjectionFinding[] = [];
    for (const message of request.messages) {
      found.push(...findInjections(message.content));
    }

    const verdict = injectionVerdict(found);
    if (verdict !== 'clean') {
      this.security?.record({
        kind: verdict === 'blocked' ? 'injection_blocked' : 'injection_noted',
        source: request.billTo ?? 'unknown',
        at: new Date().toISOString(),
        surface: request.agent,
        detail: found.map((f) => `${f.id}: ${f.matched}`).join(' | '),
      });
    }
    if (verdict === 'blocked') throw new InstructionRefusedError(found);

    // A marker the incoming text cannot have contained, because it did not
    // exist when the text was written.
    const marker = `MEMBER-CONTENT-${randomBytes(6).toString('hex')}`;
    return {
      ...request,
      messages: request.messages.map((m) =>
        m.untrusted ? { ...m, content: fenceAsData(m.content, marker) } : m,
      ),
    };
  }

  async complete(request: AiCompletionRequest): Promise<AiCompletionResponse> {
    const traceId = request.traceId ?? randomUUID();

    /*
     * Instructions first — before the provider chain, before redaction and
     * before the allowance.
     *
     * Two reasons, and the second is the one that was originally got
     * wrong. A refused message must cost nothing, or anybody who can put
     * text in front of an agent has a way to spend somebody else's ACU.
     * And a refusal is a judgement about the input, not about our capacity
     * to serve it: with this below the "no provider configured" check, a
     * deployment missing an API key accepted every injection attempt
     * without examining it, which is the wrong answer given by accident.
     */
    const guarded = this.guardInstructions(request);

    const chain = this.chainFor(request.provider);
    if (chain.length === 0) {
      throw new AiGatewayError(
        'No AI provider is configured. Set at least one of ANTHROPIC_API_KEY, OPENAI_API_KEY or GEMINI_API_KEY.',
        [],
        {},
      );
    }

    const redacted = this.redact(guarded);
    const ceiling = AGENT_REGISTRY[request.agent]?.acuCeiling ?? 10;
    const timeoutMs = Number(this.config.get<string>('AI_REQUEST_TIMEOUT_MS') ?? 120_000);

    /*
     * The gate, before the chain rather than after it.
     *
     * This throws when there is nobody to bill or nothing to bill them,
     * and it throws before a single token reaches a provider. Everything
     * below runs having already been paid for; the fallback chain trying
     * three providers is one paid action, not three.
     */
    const hold = await this.hold(request, ceiling);

    const attempted: AiProvider[] = [];
    const causes: Record<string, string> = {};

    for (const provider of chain) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const startedAt = Date.now();

      try {
        const result = await provider.complete(redacted, controller.signal);
        const latencyMs = Date.now() - startedAt;

        // A refusal is not an error, but it is a reason to try the next
        // provider rather than return an empty answer to the caller.
        if (result.refused && chain.indexOf(provider) < chain.length - 1) {
          attempted.push(provider.name);
          causes[provider.name] = 'declined the request';
          continue;
        }

        if (result.usage.acu > ceiling) {
          this.logger.warn(
            `Agent ${request.agent} consumed ${result.usage.acu} ACU against a ceiling of ${ceiling}.`,
          );
        }

        this.logger.log(
          `[${traceId}] ${request.agent} -> ${provider.name}/${result.model} ` +
            `${result.usage.acu} ACU in ${latencyMs}ms`,
        );

        // Settle the hold against what was really used, and give the rest
        // back to the grants it came from.
        await this.settle(hold, result.usage.acu, request.agent, result.model);

        return {
          ...result,
          latencyMs,
          traceId,
          ...(attempted.length ? { fellBackFrom: attempted } : {}),
        };
      } catch (error) {
        attempted.push(provider.name);
        causes[provider.name] = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `[${traceId}] provider ${provider.name} failed: ${causes[provider.name]}`,
        );
      } finally {
        clearTimeout(timer);
      }
    }

    // Every provider failed, so nothing was delivered and nothing is owed.
    await this.release(hold, request.agent);

    throw new AiGatewayError(
      'Every configured AI provider failed. The caller should fall back to the cached prescription plan.',
      attempted,
      causes,
    );
  }

  /** Health of each provider, for the Admin Super Control Centre. §24.5. */
  /**
   * Does each key actually work?
   *
   * `health()` below reports whether a key is *present*, which is not the
   * question anybody is asking when they check. A revoked key, a key with
   * the wrong prefix, a key for an account with no credit and a key for
   * the wrong project all read as `configured: true` and then fail on the
   * first real call — at 07:00, inside a scheduled job, where the only
   * symptom is that nothing appeared.
   *
   * So this makes the smallest real call each provider will accept and
   * reports what came back. Three things make it safe to have:
   *
   *  * **Each provider is called directly, not through the chain.** The
   *    fallback chain exists so a member's request survives one provider
   *    being down; here it would mask exactly what is being asked, by
   *    reporting success from the second provider when the first is the
   *    broken one.
   *  * **It is metered like everything else.** A handful of tokens each,
   *    billed to the administrator who asked, because an unmetered path
   *    is an unmetered path however small.
   *  * **The error is classified, never echoed.** Provider errors quote
   *    request bodies and sometimes the key prefix, and this output is
   *    read in a browser and pasted into messages.
   */
  async probe(billTo: string): Promise<
    { provider: AiProvider; configured: boolean; model: string; ok: boolean; says: string }[]
  > {
    const results: {
      provider: AiProvider;
      configured: boolean;
      model: string;
      ok: boolean;
      says: string;
    }[] = [];

    for (const name of AI_PROVIDERS) {
      const provider = this.providers.find((p) => p.name === name);
      if (!provider?.isConfigured()) {
        results.push({
          provider: name,
          configured: false,
          model: 'not configured',
          ok: false,
          says: 'No key set for this provider. That is not a fault unless you expected one.',
        });
        continue;
      }

      const request: AiCompletionRequest = {
        agent: 'JESS',
        billTo,
        maxTokens: 8,
        messages: [{ role: 'user', content: 'Reply with the single word: ready' }],
      };
      const model = provider.resolveModel(request);

      // Metered, like every other call on this platform.
      const hold = await this.hold(request, 1);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      try {
        const result = await provider.complete(request, controller.signal);
        await this.settle(hold, result.usage.acu, 'JESS', result.model);
        results.push({
          provider: name,
          configured: true,
          model: result.model,
          ok: true,
          says: `Answered in ${result.usage.acu} ACU. The key works.`,
        });
      } catch (error) {
        await this.release(hold, 'JESS');
        results.push({
          provider: name,
          configured: true,
          model,
          ok: false,
          says: classifyProviderError(error),
        });
      } finally {
        clearTimeout(timer);
      }
    }

    return results;
  }

  health(): AiProviderHealth[] {
    return AI_PROVIDERS.map((name) => {
      const provider = this.providers.find((p) => p.name === name);
      return {
        provider: name,
        configured: provider?.isConfigured() ?? false,
        reachable: null,
        model:
          provider?.resolveModel({ agent: 'JESS', messages: [] }) ?? 'not configured',
      };
    });
  }
}
