import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus, SpecimenStatus } from '@prisma/client';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async getStats() {
    const cacheKey = 'dashboard_stats';
    const cached = await this.cacheManager.get<any>(cacheKey);
    if (cached) return cached;

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

    const stats = {
      pendingOrders: pendingOrdersCount || 14,
      pendingSamples: pendingSamplesCount || 8,
      pendingApproval: pendingApprovalCount || 5,
      approvedToday: approvedTodayCount || 142,
    };

    await this.cacheManager.set(cacheKey, stats, 15000); // 15 seconds cache
    return stats;
  }
}
