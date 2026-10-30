import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';
import { SpecimenStatus, OrderStatus } from '@prisma/client';

@Injectable()
export class SamplesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async findAll(query?: {
    status?: string;
    clientSiteId?: string;
    search?: string;
    createdFrom?: string;
    createdTo?: string;
    receivedFrom?: string;
    receivedTo?: string;
  }) {
    const cacheKey = `samples_list_${JSON.stringify(query || {})}`;
    const cached = await this.cacheManager.get<any[]>(cacheKey);
    if (cached) return cached;

    const where: any = {};
    if (query?.status) {
      where.status = query.status as SpecimenStatus;
    }
    if (query?.clientSiteId) {
      where.order = { clientSiteId: query.clientSiteId };
    }
    if (query?.search) {
      where.OR = [
        { labNumber: { contains: query.search, mode: 'insensitive' } },
        { barcode: { contains: query.search, mode: 'insensitive' } },
        { order: { hn: { contains: query.search, mode: 'insensitive' } } },
        {
          order: {
            patientName: { contains: query.search, mode: 'insensitive' },
          },
        },
      ];
    }
    if (query?.createdFrom || query?.createdTo) {
      where.createdAt = {};
      if (query.createdFrom) where.createdAt.gte = new Date(query.createdFrom);
      if (query.createdTo) {
        const toDate = new Date(query.createdTo);
        toDate.setHours(23, 59, 59, 999);
        where.createdAt.lte = toDate;
      }
    }
    if (query?.receivedFrom || query?.receivedTo) {
      where.receivedAt = {};
      if (query.receivedFrom)
        where.receivedAt.gte = new Date(query.receivedFrom);
      if (query.receivedTo) {
        const toDate = new Date(query.receivedTo);
        toDate.setHours(23, 59, 59, 999);
        where.receivedAt.lte = toDate;
      }
    }

    const samples = await this.prisma.sample.findMany({
      where,
      include: {
        order: {
          include: {
            clientSite: true,
            shipment: true,
            ward: true,
          },
        },
        sampleCondition: true,
        testResults: {
          take: 1,
          select: {
            testPanel: true,
            testName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const result = samples.map((s, idx) => ({
      id: s.id,
      no: idx + 1,
      status: s.status,
      created: s.createdAt.toLocaleDateString('th-TH', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }),
      shipment: s.order.shipment?.shipmentNumber || '-',
      clientSite:
        s.order.clientSite?.siteName ||
        'โรงพยาบาลส่งเสริมสุขภาพตำบลทุ่งแสลงหลวง',
      hn: s.order.hn,
      labNo: s.labNumber,
      patientName: s.order.patientName,
      specimenType: s.specimenType,
      profileTestName:
        s.profileTestName ||
        s.testResults?.[0]?.testPanel ||
        s.testResults?.[0]?.testName ||
        'Complete Blood Count (CBC)',
      healthcareEntitlement:
        s.order.entitlement || 'หลักประกันสุขภาพแห่งชาติ (UC)',
      urgentStatus: s.urgentStatus || s.order.urgentStatus || 'NORMAL',
      ward: s.order.ward?.wardName || s.order.patientType || 'ผู้ป่วยนอก (OPD)',
      condition: s.sampleCondition?.conditionName || 'ปกติ (Normal)',
      specimenCondition: s.sampleCondition?.conditionName || 'ปกติ (Normal)',
      conditionOther: s.conditionOther,
      receivedAt: s.receivedAt,
      rejectedAt: s.rejectedAt,
    }));

    await this.cacheManager.set(cacheKey, result, 15000);
    return result;
  }

  async invalidateCache() {
    try {
      await this.cacheManager.del('samples_list_{}');
      const store: any = (this.cacheManager as any).store;
      if (store && typeof store.keys === 'function') {
        const keys = await store.keys('samples_list_*');
        for (const k of keys) {
          await this.cacheManager.del(k);
        }
      }
    } catch {}
  }

  async receive(data: {
    sampleIds: string[];
    autoBarcode?: boolean;
    sampleConditionId?: string;
    conditionCode?: string;
    condition?: string;
    conditionOther?: string;
    receivedById?: string;
  }) {
    const validSampleIds = (data.sampleIds || []).filter(
      (id): id is string => typeof id === 'string' && id.trim().length > 0,
    );
    if (validSampleIds.length === 0) {
      throw new BadRequestException(
        'กรุณาระบุรายการสิ่งส่งตรวจที่ต้องการตรวจรับ',
      );
    }

    let conditionId = data.sampleConditionId;
    if (!conditionId && (data.conditionCode || data.condition)) {
      const target = data.conditionCode || data.condition;
      const cond = await this.prisma.sampleCondition.findFirst({
        where: {
          OR: [
            { id: target },
            { conditionCode: target },
            { conditionName: target },
            { conditionName: { contains: target } },
          ],
        },
      });
      if (cond) conditionId = cond.id;
    }

    const updated = await this.prisma.sample.updateMany({
      where: { id: { in: validSampleIds } },
      data: {
        status: SpecimenStatus.RECEIVED,
        sampleConditionId: conditionId,
        conditionOther: data.conditionOther,
        receivedAt: new Date(),
        receivedById: data.receivedById,
      },
    });

    // Update orders status to RECEIVED
    const samples = await this.prisma.sample.findMany({
      where: { id: { in: data.sampleIds } },
      select: { orderId: true },
    });
    const orderIds = [...new Set(samples.map((s) => s.orderId))];

    await this.prisma.order.updateMany({
      where: { id: { in: orderIds } },
      data: { status: OrderStatus.RECEIVED },
    });

    try {
      await this.cacheManager.del('dashboard_stats');
      await this.invalidateCache();
    } catch {}

    return {
      success: true,
      receivedCount: updated.count,
      autoBarcode: Boolean(data.autoBarcode),
      message: `ตรวจรับสิ่งส่งตรวจสำเร็จ ${updated.count} รายการ ${
        data.autoBarcode ? '(พร้อมส่งพิมพ์บาร์โค้ด)' : ''
      }`,
    };
  }

  async reject(data: {
    sampleIds: string[];
    sampleConditionId?: string;
    conditionCode?: string;
    condition?: string;
    conditionOther?: string;
    rejectionReason?: string;
    rejectedById?: string;
  }) {
    if (!data.sampleIds || data.sampleIds.length === 0) {
      throw new BadRequestException(
        'กรุณาระบุรายการสิ่งส่งตรวจที่ต้องการปฏิเสธ',
      );
    }

    let conditionId = data.sampleConditionId;
    if (!conditionId && (data.conditionCode || data.condition)) {
      const target = data.conditionCode || data.condition;
      const cond = await this.prisma.sampleCondition.findFirst({
        where: {
          OR: [
            { id: target },
            { conditionCode: target },
            { conditionName: target },
            { conditionName: { contains: target } },
          ],
        },
      });
      if (cond) conditionId = cond.id;
    }

    const updated = await this.prisma.sample.updateMany({
      where: { id: { in: data.sampleIds } },
      data: {
        status: SpecimenStatus.REJECTED,
        sampleConditionId: conditionId,
        conditionOther: data.conditionOther,
        rejectionReason: data.rejectionReason || data.condition,
        rejectedAt: new Date(),
        rejectedById: data.rejectedById,
      },
    });

    try {
      await this.cacheManager.del('dashboard_stats');
      await this.invalidateCache();
    } catch {}

    return {
      success: true,
      rejectedCount: updated.count,
      message: `ปฏิเสธสิ่งส่งตรวจเรียบร้อยแล้ว ${updated.count} รายการ`,
    };
  }

  async reset(sampleIds: string[]) {
    const validSampleIds = (sampleIds || []).filter(
      (id): id is string => typeof id === 'string' && id.trim().length > 0,
    );
    if (validSampleIds.length === 0) {
      throw new BadRequestException(
        'กรุณาระบุรายการสิ่งส่งตรวจที่ต้องการรีเซ็ต',
      );
    }

    const updated = await this.prisma.sample.updateMany({
      where: { id: { in: validSampleIds } },
      data: {
        status: SpecimenStatus.REGISTERED,
        sampleConditionId: null,
        conditionOther: null,
        receivedAt: null,
        receivedById: null,
        rejectedAt: null,
        rejectedById: null,
        rejectionReason: null,
      },
    });

    try {
      await this.cacheManager.del('dashboard_stats');
      await this.invalidateCache();
    } catch {}

    return {
      success: true,
      resetCount: updated.count,
      message: `รีเซ็ตสถานะสิ่งส่งตรวจเป็น Registered แล้ว ${updated.count} รายการ`,
    };
  }
}
