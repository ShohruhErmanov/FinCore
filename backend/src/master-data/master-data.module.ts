import { Module } from '@nestjs/common';
import { MasterDataController } from './master-data.controller';
import { MasterDataService } from './master-data.service';
import { MasterWriteService } from './master-write.service';

@Module({
  controllers: [MasterDataController],
  providers: [MasterDataService, MasterWriteService],
  exports: [MasterDataService, MasterWriteService],
})
export class MasterDataModule {}
