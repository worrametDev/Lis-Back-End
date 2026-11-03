import { MasterDefaultsService } from './master-defaults.service';
import { Module } from '@nestjs/common';
import { MasterDataService } from './master-data.service';
import { MasterDataController } from './master-data.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [MasterDataController],
  providers: [MasterDataService, MasterDefaultsService],
  exports: [MasterDataService],
})
export class MasterDataModule {}
