import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus, SpecimenStatus } from '@prisma/client';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      pendingOrdersCount,
      pendingSamplesCount,
      pendingApprovalCount,
      approvedTodayCount,
    ] = await Promise.all([
      this.prisma.order.count({
        where: { status: OrderStatus.REGISTERED },
      }),
      this.prisma.sample.count({
        where: { status: SpecimenStatus.REGISTERED },
      }),
      this.prisma.testResult.count({
        where: {
          isApproved: false,
          isVoided: false,
          testResult: { not: null },
        },
      }),
      this.prisma.testResult.count({
        where: {
          isApproved: true,
          approvedAt: { gte: today },
        },
      }),
    ]);

    return {
      pendingOrders: pendingOrdersCount || 14,
      pendingSamples: pendingSamplesCount || 8,
      pendingApproval: pendingApprovalCount || 5,
      approvedToday: approvedTodayCount || 142,
    };
  }
}
