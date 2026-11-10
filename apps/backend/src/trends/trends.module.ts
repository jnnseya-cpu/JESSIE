import { Module } from '@nestjs/common';
import { ActionsService } from './actions.service';
import { BriefsService } from './briefs.service';
import { TrendsController } from './trends.controller';
import { TrendsService } from './trends.service';

/**
 * Trend intelligence.
 *
 * No imports. The engine reads `trend_*` and `growth_*` tables and the
 * `posts` table through its own pool, and it deliberately does not inject
 * the blog or editorial services: it must not be able to reach
 * `publish()`, draft a new post, or touch anything the editorial pipeline
 * owns. Its whole reach over public content is two columns on an already
 * published, already human-reviewed page, through a compare-and-set that
 * a person has to approve.
 *
 * Keeping that boundary structural rather than conventional is the point.
 * A future change that needs this module to import the blog service
 * should have to argue for it.
 */
@Module({
  controllers: [TrendsController],
  providers: [TrendsService, BriefsService, ActionsService],
  exports: [BriefsService],
})
export class TrendsModule {}
