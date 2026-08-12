import { Global, Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { SecurityController } from './security.controller';
import { SecurityService } from './security.service';
import { SentryAgentService } from './sentry-agent.service';

/**
 * Global, because the record of what was refused has to be reachable from
 * wherever a refusal happens — the auth doors, the AI gateway, the abuse
 * limiter — and threading it through five module graphs would guarantee
 * that the sixth refusal, added later, quietly goes unrecorded.
 */
@Global()
@Module({
  imports: [AiModule],
  controllers: [SecurityController],
  providers: [SecurityService, SentryAgentService],
  exports: [SecurityService, SentryAgentService],
})
export class SecurityModule {}
