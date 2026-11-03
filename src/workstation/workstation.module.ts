import { WorkstationWorkflowService } from './workstation-workflow.service';
import { Module } from '@nestjs/common';
import { WorkstationService } from './workstation.service';
import { WorkstationController } from './workstation.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [WorkstationController],
  providers: [WorkstationService, WorkstationWorkflowService],
  exports: [WorkstationService],
})
export class WorkstationModule {}
