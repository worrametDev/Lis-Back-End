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
  }) {
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
        { order: { patientName: { contains: query.search, mode: 'insensitive' } } },
      ];
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
        testResults: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return samples.map((s, idx) => ({
      id: s.id,
      no: idx + 1,
      status: s.status,
      created: s.createdAt.toLocaleDateString('th-TH', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }),
      shipment: s.order.shipment?.shipmentNumber || '-',
      clientSite: s.order.clientSite?.siteName || 'โรงพยาบาลส่งเสริมสุขภาพตำบลทุ่งแสลงหลวง',
      hn: s.order.hn,
      labNo: s.labNumber,
      patientName: s.order.patientName,
      specimenType: s.specimenType,
      profileTestName:
        s.profileTestName ||
        s.testResults?.[0]?.testPanel ||
        s.testResults?.[0]?.testName ||
        'Complete Blood Count (CBC)',
      healthcareEntitlement: s.order.entitlement || 'หลักประกันสุขภาพแห่งชาติ (UC)',
      urgentStatus: s.urgentStatus || s.order.urgentStatus || 'NORMAL',
      ward: s.order.ward?.wardName || s.order.patientType || 'ผู้ป่วยนอก (OPD)',
      condition: s.sampleCondition?.conditionName || 'ปกติ (Normal)',
      receivedAt: s.receivedAt,
      rejectedAt: s.rejectedAt,
    }));
  }

  async receive(data: {
    sampleIds: string[];
    autoBarcode?: boolean;
    receivedById?: string;
  }) {
    const validSampleIds = (data.sampleIds || []).filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
    if (validSampleIds.length === 0) {
      throw new BadRequestException('กรุณาระบุรายการสิ่งส่งตรวจที่ต้องการตรวจรับ');
    }

    const updated = await this.prisma.sample.updateMany({
      where: { id: { in: validSampleIds } },
      data: {
        status: SpecimenStatus.RECEIVED,
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
    rejectionReason?: string;
    rejectedById?: string;
  }) {
    if (!data.sampleIds || data.sampleIds.length === 0) {
      throw new BadRequestException('กรุณาระบุรายการสิ่งส่งตรวจที่ต้องการปฏิเสธ');
    }

    let conditionId = data.sampleConditionId;
    if (!conditionId && data.conditionCode) {
      const cond = await this.prisma.sampleCondition.findUnique({
        where: { conditionCode: data.conditionCode },
      });
      if (cond) conditionId = cond.id;
    }

    const updated = await this.prisma.sample.updateMany({
      where: { id: { in: data.sampleIds } },
      data: {
        status: SpecimenStatus.REJECTED,
        sampleConditionId: conditionId,
        rejectionReason: data.rejectionReason,
        rejectedAt: new Date(),
        rejectedById: data.rejectedById,
      },
    });

    try {
      await this.cacheManager.del('dashboard_stats');
    } catch {}

    return {
      success: true,
      rejectedCount: updated.count,
      message: `ปฏิเสธสิ่งส่งตรวจเรียบร้อยแล้ว ${updated.count} รายการ`,
    };
  }
}
