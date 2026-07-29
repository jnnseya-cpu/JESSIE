import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import { Observable, map } from 'rxjs';
import {
  SIGNATURE_HEADER,
  SIGNATURE_LINE,
  SIGNATURE_LINE_ASCII,
  type ApiEnvelope,
} from '@jessmove/shared';

/**
 * §2 — the signature line is required on every screen, invoice, export
 * and API response header. This interceptor guarantees the API half of
 * that contract and wraps every payload in the standard envelope.
 */
@Injectable()
export class SignatureInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiEnvelope<unknown>> {
    const response = context.switchToHttp().getResponse<Response>();
    const requestId = randomUUID();

    // Header values must be latin1 — the full line (with ™ and an em dash)
    // travels in the body instead.
    response.setHeader(SIGNATURE_HEADER, SIGNATURE_LINE_ASCII);
    response.setHeader('x-request-id', requestId);

    return next.handle().pipe(
      map((data: unknown) => ({
        data,
        meta: {
          requestId,
          timestamp: new Date().toISOString(),
          poweredBy: SIGNATURE_LINE,
        },
      })),
    );
  }
}
