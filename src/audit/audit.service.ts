import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '@prisma/client';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  private toJson(value: unknown): Prisma.InputJsonValue | undefined {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  async snapshot(entityType: string, id?: string): Promise<unknown> {
    if (!id) return undefined;
    switch (entityType) {
      case 'users': {
        const user = await this.prisma.user.findUnique({ where: { id } });
        if (!user) return undefined;
        const { passwordHash: _passwordHash, ...safeUser } = user;
        return safeUser;
      }
      case 'parent-sites':
        return this.prisma.parentSite.findUnique({ where: { id } });
      case 'client-sites':
        return this.prisma.clientSite.findUnique({ where: { id } });
      case 'wards':
        return this.prisma.ward.findUnique({ where: { id } });
      case 'departments':
        return this.prisma.department.findUnique({ where: { id } });
      case 'sample-conditions':
        return this.prisma.sampleCondition.findUnique({ where: { id } });
      case 'titles':
        return this.prisma.title.findUnique({ where: { id } });
      case 'ethnicities':
        return this.prisma.ethnicity.findUnique({ where: { id } });
      case 'test-panels':
        return this.prisma.testPanel.findUnique({ where: { id } });
      case 'value-lists':
        return this.prisma.valueList.findUnique({ where: { id } });
      case 'tests':
        return this.prisma.labTest.findUnique({ where: { id } });
      case 'test-profiles':
        return this.prisma.testProfile.findUnique({ where: { id } });
      case 'analyzers':
        return this.prisma.analyzer.findUnique({ where: { id } });
      case 'orders':
        return this.prisma.order.findUnique({ where: { id } });
      default:
        return undefined;
    }
  }

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
        oldValues: this.toJson(input.oldValues),
        newValues: this.toJson(input.newValues),
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      },
    });
  }
}
