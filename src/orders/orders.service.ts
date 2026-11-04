import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';
import { OrderCatalogService } from './order-catalog.service';
import { OrderStatus, SpecimenStatus, ResultFlag } from '@prisma/client';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: OrderCatalogService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async findAll(query?: {
    search?: string;
    clientSiteId?: string;
    status?: string;
    hn?: string;
    createdFrom?: string;
    createdTo?: string;
  }) {
    const cacheKey = `orders_list_${JSON.stringify(query || {})}`;
    const cached = await this.cacheManager.get<any[]>(cacheKey);
    if (cached) return cached;

    const where: any = {};
    if (query?.clientSiteId) where.clientSiteId = query.clientSiteId;
    if (query?.hn) where.hn = { contains: query.hn, mode: 'insensitive' };
    if (query?.status) where.status = query.status as OrderStatus;
    if (query?.search) {
      where.OR = [
        { hn: { contains: query.search, mode: 'insensitive' } },
        { patientName: { contains: query.search, mode: 'insensitive' } },
        {
          samples: {
            some: {
              labNumber: { contains: query.search, mode: 'insensitive' },
            },
          },
        },
      ];
    }
    if (query?.createdFrom || query?.createdTo) {
      where.createdAt = {};
      if (query.createdFrom) {
        where.createdAt.gte = new Date(query.createdFrom);
      }
      if (query.createdTo) {
        const toDate = new Date(query.createdTo);
        toDate.setHours(23, 59, 59, 999);
        where.createdAt.lte = toDate;
      }
    }

    const orders = await this.prisma.order.findMany({
      where,
      include: {
        clientSite: true,
        parentSite: true,
        ward: true,
        samples: {
          where: { OR: [{rejectionReason: null}, {rejectionReason: {not: 'Order items updated'}}] },
          select: {
            id: true,
            labNumber: true,
            specimenType: true,
            profileTestName: true,
            receivedAt: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const result = orders.map((o, idx) => {
      const firstSample = o.samples[0];
      return {
        id: o.id,
        no: idx + 1,
        status: o.status,
        created: o.createdAt.toLocaleDateString('th-TH', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        }),
        received: firstSample?.receivedAt
          ? firstSample.receivedAt.toLocaleDateString('th-TH', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
            })
          : '-',
        clientSite:
          o.clientSite?.siteName || '',
        clientSiteId: o.clientSiteId,
        siteCode: o.clientSite?.siteCode || '',
        siteName: o.clientSite?.siteName || '',
        parentSiteCode: o.parentSite?.siteCode || '',
        parentSiteName: o.parentSite?.siteName || '',
        parentSite: o.parentSite?.siteName || '',
        parentSiteId: o.parentSiteId,
        hn: o.hn,
        labNo: firstSample?.labNumber || '',
        sampleId: firstSample?.id,
        patientName: o.patientName,
        title: o.title || '',
        firstName: o.firstName || '',
        lastName: o.lastName || '',
        gender: o.gender || '',
        dob: o.dob || '',
        age: o.age || '',
        nationality: o.nationality || '',
        ethnicity: o.ethnicity || '',
        address: o.address || '',
        subdistrict: o.subdistrict || '',
        district: o.district || '',
        province: o.province || '',
        zipcode: o.zipcode || '',
        telephone: o.telephone || '',
        patientType: o.patientType || 'OPD',
        entitlement: o.entitlement || '',
        collectedDate: o.collectedDate || '',
        urgentStatus: o.urgentStatus || 'NORMAL',
        ward: o.ward?.wardName || o.patientType || 'OPD',
        idCard: o.idCard || '',
        passportNo: o.passportNo || '',
        passport: o.passportNo || '',
        specimenType: firstSample?.specimenType || '',
        testName:
          firstSample?.profileTestName ||
          o.testProfile ||
          o.testPanel ||
          '',
        orderItems: o.orderItems || [],
        samples: o.samples,
        samplesCount: o.samples.length,
      };
    });

    await this.cacheManager.set(cacheKey, result, 15000);
    return result;
  }

  async invalidateCache() {
    try {
      await this.cacheManager.del('orders_list_{}');
      const store: any = (this.cacheManager as any).store;
      if (store && typeof store.keys === 'function') {
        const keys = await store.keys('orders_list_*');
        for (const k of keys) {
          await this.cacheManager.del(k);
        }
      }
    } catch {}
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        clientSite: true,
        parentSite: true,
        ward: true,
        samples: {
          include: {
            sampleCondition: true,
            testResults: {
              include: { department: true },
            },
          },
        },
      },
    });
    if (!order) throw new NotFoundException(`Order with ID ${id} not found`);
    return order;
  }

  async create(data: {
    hn: string;
    patientName: string;
    idCard?: string;
    passport?: string;
    passportNo?: string;
    clientSiteId?: string;
    clientSiteName?: string;
    clientSite?: string;
    siteCode?: string;
    siteName?: string;
    parentSiteId?: string;
    parentSiteCode?: string;
    parentSiteName?: string;
    wardId?: string;
    ward?: string;
    specimenType?: string;
    testPanels?: string[];
    selectedTests?: string[];
    title?: string;
    firstName?: string;
    lastName?: string;
    gender?: string;
    dob?: string;
    age?: string;
    nationality?: string;
    ethnicity?: string;
    address?: string;
    subdistrict?: string;
    district?: string;
    province?: string;
    zipcode?: string;
    telephone?: string;
    patientType?: string;
    entitlement?: string;
    collectedDate?: string;
    urgentStatus?: string;
    testPanel?: string;
    testProfile?: string;
    testItem?: string;
    orderItems?: any[];
  }) {
    if (!data.hn || !data.patientName) {
      throw new BadRequestException('กรุณาระบุ HN และชื่อผู้ป่วย');
    }

    // Resolve client site & parent site
    let clientSite = null;
    if (data.clientSiteId) {
      clientSite = await this.prisma.clientSite.findUnique({
        where: { id: data.clientSiteId },
      });
    }
    if (
      !clientSite &&
      (data.siteCode || data.clientSiteName || data.clientSite || data.siteName)
    ) {
      const targetCode = data.siteCode;
      const targetName =
        data.clientSiteName || data.clientSite || data.siteName;
      clientSite = await this.prisma.clientSite.findFirst({
        where: {
          OR: [
            targetCode ? { siteCode: targetCode } : {},
            targetName
              ? { siteName: { contains: targetName, mode: 'insensitive' } }
              : {},
          ],
        },
      });
    }
    if (!clientSite) throw new BadRequestException('ไม่พบ Client Site ในระบบ');

    const parentSiteId = clientSite.parentSiteId;

    // Resolve ward if provided
    let wardId = data.wardId;
    if (!wardId && data.ward) {
      const matchedWard = await this.prisma.ward.findFirst({
        where: {
          OR: [
            { wardCode: { equals: data.ward, mode: 'insensitive' } },
            { wardName: { contains: data.ward, mode: 'insensitive' } },
          ],
        },
      });
      if (matchedWard) wardId = matchedWard.id;
    }

    const rawOrderItems = Array.isArray(data.orderItems) ? data.orderItems : [];
    const resolved = await this.catalog.resolve(rawOrderItems);
    const profileTestName = rawOrderItems[0]?.testName || '';
    return this.prisma.$transaction(async (tx) => {
    // Create Order in transaction
    const order = await tx.order.create({
      data: {
        hn: data.hn,
        patientName: data.patientName,
        idCard: data.idCard || '',
        passportNo: data.passportNo || data.passport || '',
        title: data.title,
        firstName: data.firstName,
        lastName: data.lastName,
        gender: data.gender,
        dob: data.dob,
        age: data.age,
        nationality: data.nationality || '',
        ethnicity: data.ethnicity || '',
        address: data.address,
        subdistrict: data.subdistrict,
        district: data.district,
        province: data.province,
        zipcode: data.zipcode,
        telephone: data.telephone,
        patientType: data.patientType || 'OPD',
        entitlement: data.entitlement || '',
        collectedDate: data.collectedDate,
        urgentStatus: data.urgentStatus || 'NORMAL',
        testPanel: data.testPanel,
        testProfile: data.testProfile,
        testItem: data.testItem,
        orderItems: rawOrderItems,
        clientSiteId: clientSite.id,
        parentSiteId,
        wardId,
        status: OrderStatus.REGISTERED,
      },
      include: {
        clientSite: true,
        parentSite: true,
        ward: true,
      },
    });

    const createdSamples = await this.catalog.createSamples(tx, order.id, resolved, data.urgentStatus);

    try {
      await this.cacheManager.del('dashboard_stats');
      await this.cacheManager.del('samples_list_{}');
      await this.cacheManager.del('workstation_queue');
      await this.invalidateCache();
    } catch {}

    const firstSample = createdSamples[0];
    return {
      ...order,
      id: order.id,
      no: 1,
      status: 'Registered',
      created: order.createdAt.toLocaleDateString('th-TH'),
      received: '-',
      clientSite:
        order.clientSite?.siteName || '',
      clientSiteId: order.clientSiteId,
      siteCode: order.clientSite?.siteCode || '',
      siteName: order.clientSite?.siteName || '',
      parentSite: order.parentSite?.siteName || '',
      parentSiteCode: order.parentSite?.siteCode || '',
      parentSiteName: order.parentSite?.siteName || '',
      hn: order.hn,
      labNo: firstSample?.labNumber || '',
      sampleId: firstSample?.id,
      patientName: order.patientName,
      specimenType:
        firstSample?.specimenType || data.specimenType || '',
      testName: firstSample?.profileTestName || profileTestName,
      ward: order.ward?.wardName || order.patientType || 'OPD',
      urgentStatus: order.urgentStatus || 'NORMAL',
      orderItems: rawOrderItems,
      samples: createdSamples,
    };
    }, {timeout: 30000});
  }

  async update(id: string, data: any) {
    const existing = await this.prisma.order.findUnique({where: {id}, include: {samples: {where: {OR: [{rejectionReason: null}, {rejectionReason: {not: 'Order items updated'}}]}}}});
    if (!existing) throw new NotFoundException('ไม่พบ Order');
    if (existing.samples.some((sample) => sample.status !== 'REGISTERED')) throw new BadRequestException('แก้ไขได้เฉพาะ Order ที่ยังไม่ตรวจรับ');
    const resolved = await this.catalog.resolve(data.orderItems);
    const fields = ['hn','patientName','title','firstName','lastName','gender','dob','age','nationality','ethnicity','address','subdistrict','district','province','zipcode','telephone','patientType','entitlement','collectedDate','urgentStatus','testPanel','testProfile','testItem','idCard','orderItems'];
    const payload: any = {};
    for (const field of fields) if (data[field] !== undefined) payload[field] = data[field];
    if (data.passportNo !== undefined || data.passport !== undefined) payload.passportNo = data.passportNo ?? data.passport;
    if (data.siteCode) {
      const client = await this.prisma.clientSite.findUnique({where: {siteCode: data.siteCode}});
      if (!client) throw new BadRequestException('ไม่พบหน่วยงานส่งตรวจ');
      payload.clientSiteId = client.id; payload.parentSiteId = client.parentSiteId;
    }
    if (data.ward !== undefined) {
      const ward = data.ward ? await this.prisma.ward.findFirst({where: {OR: [{wardCode: data.ward}, {wardName: data.ward}]}}) : null;
      payload.wardId = ward?.id || null;
    }
    const changed = JSON.stringify(existing.orderItems) !== JSON.stringify(data.orderItems);
    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({where: {id}, data: payload});
      if (changed) {
        const ids = existing.samples.map((sample) => sample.id);
        await tx.testResult.updateMany({where: {sampleId: {in: ids}}, data: {isVoided: true, voidReason: 'Order items updated', voidedAt: new Date()}});
        await tx.sample.updateMany({where: {id: {in: ids}}, data: {status: 'REJECTED', rejectionReason: 'Order items updated'}});
        await this.catalog.createSamples(tx, id, resolved, data.urgentStatus);
        await tx.auditLog.create({data: {action: 'UPDATE_ORDER_ITEMS', entityType: 'Order', entityId: id, oldValues: existing.orderItems ?? [], newValues: data.orderItems}});
      }
    });
    await this.invalidateCache();
    for (const key of ['dashboard_stats','samples_list_{}','workstation_queue']) await this.cacheManager.del(key);
    const list = await this.findAll();
    return list.find((order) => order.id === id);
  }

  async cancel(id: string) {
    try {
      await this.cacheManager.del('dashboard_stats');
    } catch {}
    const cancelled = await this.prisma.order.update({
      where: { id },
      data: { status: OrderStatus.CANCELLED },
    });
    try {
      await this.cacheManager.del('dashboard_stats');
      await this.cacheManager.del('workstation_queue');
      const store: any = (this.cacheManager as any).store;
      if (store && typeof store.keys === 'function') {
        const keys = await store.keys('samples_list_*');
        for (const key of keys) await this.cacheManager.del(key);
      }
    } catch {}
    return cancelled;
  }
}
