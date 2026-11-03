import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ensureDefaultMasterData } from './default-master-data';

@Injectable()
export class MasterDefaultsService implements OnModuleInit {
  private readonly logger = new Logger(MasterDefaultsService.name);
  constructor(private readonly prisma: PrismaService) {}
  async onModuleInit() {
    await ensureDefaultMasterData(this.prisma);
    this.logger.log(
      'Shared master data is ready (existing settings preserved)',
    );
  }
}
