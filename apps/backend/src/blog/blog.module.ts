import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { TrendsModule } from '../trends/trends.module';
import { BlogAnalyticsService } from './analytics.service';
import { BlogController } from './blog.controller';
import { BlogService } from './blog.service';
import { SeoAgentService } from './seo-agent.service';
import { SeoAutopilotService } from './seo-autopilot.service';

@Module({
  imports: [AiModule, TrendsModule],
  controllers: [BlogController],
  providers: [BlogService, SeoAgentService, BlogAnalyticsService, SeoAutopilotService],
  exports: [BlogService, BlogAnalyticsService, SeoAutopilotService],
})
export class BlogModule {}
