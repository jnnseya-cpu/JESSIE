import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { BlogAnalyticsService } from './analytics.service';
import { BlogController } from './blog.controller';
import { BlogService } from './blog.service';
import { SeoAgentService } from './seo-agent.service';
import { SeoAutopilotService } from './seo-autopilot.service';

@Module({
  imports: [AiModule],
  controllers: [BlogController],
  providers: [BlogService, SeoAgentService, BlogAnalyticsService, SeoAutopilotService],
  exports: [BlogService, BlogAnalyticsService, SeoAutopilotService],
})
export class BlogModule {}
