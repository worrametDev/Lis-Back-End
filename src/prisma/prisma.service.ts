import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    try {
      await this.$connect();
      console.log('✅ Connected to PostgreSQL database via Prisma');
    } catch (error: any) {
      console.warn('⚠️  Could not connect to PostgreSQL database.');
      console.warn(`👉  Reason: ${error.message}`);
      console.warn('💡  Please update DATABASE_URL in backend/.env with your actual PostgreSQL credentials.');
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
