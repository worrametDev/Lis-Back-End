import { Module } from '@nestjs/common';
import { WorkstationService } from './workstation.service';
import { WorkstationController } from './workstation.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [WorkstationController],
  providers: [WorkstationService],
  exports: [WorkstationService],
})
export class WorkstationModule {}
