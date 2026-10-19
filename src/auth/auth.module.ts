import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtAuthService } from './jwt.service';
import { PrismaModule } from '../prisma/prisma.module';

import { JwtAuthGuard } from './jwt-auth.guard';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthService, JwtAuthGuard],
  exports: [AuthService, JwtAuthService, JwtAuthGuard],
})
export class AuthModule {}
