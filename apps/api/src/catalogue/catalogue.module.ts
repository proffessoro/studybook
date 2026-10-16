import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { GroupsModule } from '../groups/groups.module.js';
import { RateLimitModule } from '../rate-limit/rate-limit.module.js';
import { CatalogueController, CatalogueRequestController } from './catalogue.controller.js';
import { CatalogueService } from './catalogue.service.js';

/** The public group catalogue and its categories (GRP-04). */
@Module({
  imports: [AuthModule, GroupsModule, RateLimitModule],
  controllers: [CatalogueController, CatalogueRequestController],
  providers: [CatalogueService],
  exports: [CatalogueService],
})
export class CatalogueModule {}
