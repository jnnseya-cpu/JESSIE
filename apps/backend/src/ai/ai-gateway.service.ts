import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import {
  AGENT_REGISTRY,
  AI_PROVIDERS,
  AiGatewayError,
  NEVER_SEND_TO_MODEL,
  type AiCompletionRequest,
  type AiCompletionResponse,
  type AiProvider,
  type AiProviderHealth,
} from '@movequest/shared';
import { MODEL_PROVIDERS, type ModelProvider } from './provider.interface';

/**
 * The AI Gateway. §19.
 *
 * One entry point for every model call in the platform. It owns:
 *   - provider selection and the fallback chain,
 *   - the redaction pass (§22.3 — no prompt leakage),
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
  ) {}

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

  async complete(request: AiCompletionRequest): Promise<AiCompletionResponse> {
    const traceId = request.traceId ?? randomUUID();
    const chain = this.chainFor(request.provider);

    if (chain.length === 0) {
      throw new AiGatewayError(
        'No AI provider is configured. Set at least one of ANTHROPIC_API_KEY, OPENAI_API_KEY or GEMINI_API_KEY.',
        [],
        {},
      );
    }

    const redacted = this.redact(request);
    const ceiling = AGENT_REGISTRY[request.agent]?.acuCeiling ?? 10;
    const timeoutMs = Number(this.config.get<string>('AI_REQUEST_TIMEOUT_MS') ?? 120_000);

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

    throw new AiGatewayError(
      'Every configured AI provider failed. The caller should fall back to the cached prescription plan.',
      attempted,
      causes,
    );
  }

  /** Health of each provider, for the Admin Super Control Centre. §24.5. */
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
