import { Module } from '@nestjs/common';
import { MasterDataController } from './master-data.controller';
import { MasterDataService } from './master-data.service';
import { CategoryBaselinesService } from './category-baselines.service';
import { MasterWriteService } from './master-write.service';

@Module({
  controllers: [MasterDataController],
  providers: [MasterDataService, MasterWriteService, CategoryBaselinesService],
  exports: [MasterDataService, MasterWriteService, CategoryBaselinesService],
})
export class MasterDataModule {}
