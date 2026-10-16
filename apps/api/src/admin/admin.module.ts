import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { InstanceAdminGuard } from './admin.guard.js';
import { CategoriesAdminController } from './categories.controller.js';

/** Instance administration (design §3.2). Categories for now; the admin panel comes in step 1.8. */
@Module({
  imports: [AuthModule],
  controllers: [CategoriesAdminController],
  providers: [InstanceAdminGuard],
})
export class AdminModule {}
