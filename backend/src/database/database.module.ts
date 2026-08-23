import { Global, Module } from '@nestjs/common';
import { ActorContextService } from './actor-context.service';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService, ActorContextService],
  exports: [PrismaService, ActorContextService],
})
export class DatabaseModule {}
