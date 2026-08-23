import { Module } from '@nestjs/common';
import { AuthModule } from '@/auth';
import { AdminController } from './admin.controller';
import { AdminRolesService } from './roles.service';
import { AdminUsersService } from './users.service';

@Module({
  imports: [AuthModule],
  controllers: [AdminController],
  providers: [AdminUsersService, AdminRolesService],
})
export class AdminModule {}
