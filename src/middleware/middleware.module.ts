import { Module } from '@nestjs/common';
import { MiddlewareController } from './middleware.controller';
import { MiddlewareService } from './middleware.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [MiddlewareController],
  providers: [MiddlewareService],
  exports: [MiddlewareService],
})
export class MiddlewareModule {}
