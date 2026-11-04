import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: {
    userId?: string;
    action: string;
    entityType: string;
    entityId?: string;
    oldValues?: unknown;
    newValues?: unknown;
    ipAddress?: string;
    userAgent?: string;
  }) {
    await this.prisma.auditLog.create({
      data: {
        userId: input.userId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId || 'collection',
        oldValues: input.oldValues as any,
        newValues: input.newValues as any,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      },
    });
  }
}
