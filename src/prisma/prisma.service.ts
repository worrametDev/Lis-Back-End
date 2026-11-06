import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Connected to PostgreSQL database via Prisma');
    } catch (error: unknown) {
      this.logger.warn('Could not connect to PostgreSQL database.');
      this.logger.warn(
        `Reason: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.logger.warn(
        '💡  Please update DATABASE_URL in backend/.env with your actual PostgreSQL credentials.',
      );
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
