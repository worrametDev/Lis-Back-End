import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus, SpecimenStatus, ResultFlag } from '@prisma/client';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query?: {
    search?: string;
    clientSiteId?: string;
    status?: string;
    hn?: string;
  }) {
    const where: any = {};
    if (query?.clientSiteId) where.clientSiteId = query.clientSiteId;
    if (query?.hn) where.hn = { contains: query.hn, mode: 'insensitive' };
    if (query?.status) where.status = query.status as OrderStatus;
    if (query?.search) {
      where.OR = [
        { hn: { contains: query.search, mode: 'insensitive' } },
        { patientName: { contains: query.search, mode: 'insensitive' } },
        { samples: { some: { labNumber: { contains: query.search, mode: 'insensitive' } } } },
      ];
    }

    const orders = await this.prisma.order.findMany({
      where,
      include: {
        clientSite: true,
        parentSite: true,
        ward: true,
        samples: {
          include: {
            testResults: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return orders.map((o, idx) => {
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
        clientSite: o.clientSite?.siteName || 'โรงพยาบาลส่งเสริมสุขภาพตำบลทุ่งแสลงหลวง',
        clientSiteId: o.clientSiteId,
        parentSite: o.parentSite?.siteName || 'โรงพยาบาลเสนา',
        parentSiteId: o.parentSiteId,
        hn: o.hn,
        labNo: firstSample?.labNumber || `69${Date.now().toString().slice(-7)}`,
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
        entitlement: o.entitlement || 'หลักประกันสุขภาพแห่งชาติ (UC)',
        collectedDate: o.collectedDate || '',
        urgentStatus: o.urgentStatus || 'NORMAL',
        ward: o.ward?.wardName || o.patientType || 'OPD',
        idCard: o.idCard || '',
        passportNo: o.passportNo || '',
        specimenType: firstSample?.specimenType || 'EDTA Blood',
        testName: firstSample?.profileTestName || o.testProfile || o.testPanel || 'Complete Blood Count (CBC)',
        orderItems: o.orderItems || [],
        samplesCount: o.samples.length,
      };
    });
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
      clientSite = await this.prisma.clientSite.findUnique({ where: { id: data.clientSiteId } });
    }
    if (!clientSite && (data.siteCode || data.clientSiteName || data.clientSite || data.siteName)) {
      const targetCode = data.siteCode;
      const targetName = data.clientSiteName || data.clientSite || data.siteName;
      clientSite = await this.prisma.clientSite.findFirst({
        where: {
          OR: [
            targetCode ? { siteCode: targetCode } : {},
            targetName ? { siteName: { contains: targetName, mode: 'insensitive' } } : {},
          ],
        },
      });
    }
    if (!clientSite) {
      clientSite = await this.prisma.clientSite.findFirst();
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

    // Generate unique Lab Number
    const datePrefix = '69' + new Date().toISOString().slice(2, 4); // e.g. 6926
    const randomSuffix = Math.floor(10000 + Math.random() * 90000);
    const labNumber = `${datePrefix}${randomSuffix}`;

    const profileTestName =
      data.testProfile ||
      data.testPanel ||
      data.selectedTests?.[0] ||
      (Array.isArray(data.orderItems) && data.orderItems[0]?.testName) ||
      'Complete Blood Count (CBC)';

    // Create Order with Sample in transaction
    const order = await this.prisma.order.create({
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
        nationality: data.nationality || 'THAI',
        ethnicity: data.ethnicity || 'ไทย',
        address: data.address,
        subdistrict: data.subdistrict,
        district: data.district,
        province: data.province,
        zipcode: data.zipcode,
        telephone: data.telephone,
        patientType: data.patientType || 'OPD',
        entitlement: data.entitlement || 'หลักประกันสุขภาพแห่งชาติ (UC)',
        collectedDate: data.collectedDate,
        urgentStatus: data.urgentStatus || 'NORMAL',
        testPanel: data.testPanel,
        testProfile: data.testProfile,
        testItem: data.testItem,
        orderItems: data.orderItems || [],
        clientSiteId: clientSite.id,
        parentSiteId,
        wardId,
        status: OrderStatus.REGISTERED,
        samples: {
          create: {
            labNumber,
            specimenType: data.specimenType || 'EDTA Blood',
            profileTestName,
            urgentStatus: data.urgentStatus || 'NORMAL',
            barcode: labNumber,
            status: SpecimenStatus.REGISTERED,
          },
        },
      },
      include: {
        samples: true,
        clientSite: true,
        parentSite: true,
        ward: true,
      },
    });

    const createdSample = order.samples[0];

    // Create Test Results for hematology/chemistry
    const defaultDept =
      (await this.prisma.department.findFirst({
        where: { departmentCode: 'HEM' },
      })) || (await this.prisma.department.findFirst());

    if (defaultDept && createdSample) {
      if (Array.isArray(data.orderItems) && data.orderItems.length > 0) {
        for (const item of data.orderItems) {
          await this.prisma.testResult.create({
            data: {
              sampleId: createdSample.id,
              departmentId: defaultDept.id,
              testPanel: item.testCode || 'CBC',
              testName: item.testName || 'Test Item',
              unit: item.unit || '-',
              referenceRange: item.referenceRange || '-',
              testResult: item.testResult || null,
              flag: ResultFlag.NORMAL,
              lastResult: item.lastResult || null,
              repeatResult: item.repeatResult || null,
            },
          });
        }
      } else {
        const testsToCreate = [
          { testPanel: 'CBC', testName: 'WBC Count', unit: '10^3 cell/ul', referenceRange: '4.00 - 10.00', testResult: '4.52', flag: ResultFlag.NORMAL, lastResult: '4.16', repeatResult: '4.48' },
          { testPanel: 'CBC', testName: 'RBC Count', unit: '10^6 cell/ul', referenceRange: '4.00 - 10.00', testResult: '4.52', flag: ResultFlag.NORMAL, lastResult: '4.16', repeatResult: '4.48' },
          { testPanel: 'CBC', testName: 'Hemoglobin', unit: 'g/dL', referenceRange: '12.00 - 16.00', testResult: '14.2', flag: ResultFlag.NORMAL, lastResult: '13.8', repeatResult: '14.1' },
          { testPanel: 'CBC', testName: 'Hematocrit', unit: '%', referenceRange: '36.0 - 48.0', testResult: '42.5', flag: ResultFlag.NORMAL, lastResult: '41.0', repeatResult: '42.3' },
          { testPanel: 'CBC', testName: 'Platelet Count', unit: '10^3 cell/ul', referenceRange: '140 - 400', testResult: '285', flag: ResultFlag.NORMAL, lastResult: '270', repeatResult: '280' },
        ];

        for (const t of testsToCreate) {
          await this.prisma.testResult.create({
            data: {
              sampleId: createdSample.id,
              departmentId: defaultDept.id,
              testPanel: t.testPanel,
              testName: t.testName,
              unit: t.unit,
              referenceRange: t.referenceRange,
              testResult: t.testResult,
              flag: t.flag,
              lastResult: t.lastResult,
              repeatResult: t.repeatResult,
            },
          });
        }
      }
    }

    return {
      id: order.id,
      no: 1,
      status: 'Registered',
      created: order.createdAt.toLocaleDateString('th-TH'),
      received: '-',
      clientSite: order.clientSite?.siteName || 'โรงพยาบาลส่งเสริมสุขภาพตำบลทุ่งแสลงหลวง',
      clientSiteId: order.clientSiteId,
      hn: order.hn,
      labNo: labNumber,
      sampleId: createdSample?.id,
      patientName: order.patientName,
      specimenType: data.specimenType || 'EDTA Blood',
      testName: profileTestName,
      ward: order.ward?.wardName || order.patientType || 'OPD',
      urgentStatus: order.urgentStatus || 'NORMAL',
    };
  }

  async update(id: string, data: any) {
    return this.prisma.order.update({
      where: { id },
      data,
    });
  }

  async cancel(id: string) {
    return this.prisma.order.update({
      where: { id },
      data: { status: OrderStatus.CANCELLED },
    });
  }
}

