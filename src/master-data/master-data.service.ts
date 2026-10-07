import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MasterDataService {
  constructor(private readonly prisma: PrismaService) {}

  // ==========================================
  // 1. PARENT SITES
  // ==========================================
  async findAllParentSites() {
    return this.prisma.parentSite.findMany({
      orderBy: { createdAt: 'desc' },
      include: { clientSites: true },
    });
  }

  async createParentSite(data: {
    siteCode: string;
    siteName: string;
    siteType?: string;
    siteStatus?: string;
    lnPattern?: string;
    address?: string;
    subdistrict?: string;
    district?: string;
    province?: string;
    zipcode?: string;
    hospitalFile?: string;
    isoFile?: string;
  }) {
    if (!data.siteCode || !data.siteName) {
      throw new BadRequestException('กรุณาระบุ SITE CODE และ SITE NAME');
    }
    const existing = await this.prisma.parentSite.findUnique({
      where: { siteCode: data.siteCode },
    });
    if (existing) {
      throw new BadRequestException(`Parent Site Code "${data.siteCode}" มีอยู่แล้วในระบบ`);
    }

    return this.prisma.parentSite.create({
      data: {
        siteCode: data.siteCode,
        siteName: data.siteName,
        siteType: data.siteType || 'Parent Site',
        siteStatus: data.siteStatus || 'Active',
        lnPattern: data.lnPattern,
        address: data.address,
        subdistrict: data.subdistrict,
        district: data.district,
        province: data.province,
        zipcode: data.zipcode,
        hospitalFile: data.hospitalFile,
        isoFile: data.isoFile,
      },
    });
  }

  async updateParentSite(id: string, data: any) {
    return this.prisma.parentSite.update({
      where: { id },
      data,
    });
  }

  async deleteParentSite(id: string) {
    return this.prisma.parentSite.delete({ where: { id } });
  }

  // ==========================================
  // 2. CLIENT SITES
  // ==========================================
  async findAllClientSites(parentSiteId?: string) {
    const where: any = {};
    if (parentSiteId) where.parentSiteId = parentSiteId;

    const sites = await this.prisma.clientSite.findMany({
      where,
      include: { parentSite: true },
      orderBy: { createdAt: 'desc' },
    });

    return sites.map((s) => ({
      id: s.id,
      siteCode: s.siteCode,
      siteName: s.siteName,
      parentSiteName: s.parentSite?.siteName || 'โรงพยาบาลเสนา',
      parentSiteId: s.parentSiteId,
      siteType: s.siteType || 'Client Site',
      siteStatus: s.siteStatus || 'Active',
      lnPattern: s.lnPattern || '',
      address: [s.address, s.subdistrict, s.district, s.province, s.zipcode].filter(Boolean).join(' ') || s.address || '',
      subdistrict: s.subdistrict,
      district: s.district,
      province: s.province,
      zipcode: s.zipcode,
      hospitalFile: s.hospitalFile,
      isoFile: s.isoFile,
      createdAt: s.createdAt,
    }));
  }

  async createClientSite(data: {
    siteCode: string;
    siteName: string;
    parentSiteId?: string;
    parentSiteCode?: string;
    siteType?: string;
    siteStatus?: string;
    lnPattern?: string;
    address?: string;
    subdistrict?: string;
    district?: string;
    province?: string;
    zipcode?: string;
    hospitalFile?: string;
    isoFile?: string;
  }) {
    if (!data.siteCode || !data.siteName) {
      throw new BadRequestException('กรุณาระบุ SITE CODE และ SITE NAME');
    }

    const existing = await this.prisma.clientSite.findUnique({
      where: { siteCode: data.siteCode },
    });
    if (existing) {
      throw new BadRequestException(`Client Site Code "${data.siteCode}" มีอยู่แล้วในระบบ`);
    }

    // Resolve parent site
    let parentSiteId = data.parentSiteId;
    if (!parentSiteId) {
      const parent = await this.prisma.parentSite.findFirst();
      if (!parent) throw new BadRequestException('ไม่พบข้อมูล Parent Site ในระบบ');
      parentSiteId = parent.id;
    }

    return this.prisma.clientSite.create({
      data: {
        siteCode: data.siteCode,
        siteName: data.siteName,
        parentSiteId,
        siteType: data.siteType || 'Client Site',
        siteStatus: data.siteStatus || 'Active',
        lnPattern: data.lnPattern,
        address: data.address,
        subdistrict: data.subdistrict,
        district: data.district,
        province: data.province,
        zipcode: data.zipcode,
        hospitalFile: data.hospitalFile,
        isoFile: data.isoFile,
      },
      include: { parentSite: true },
    });
  }

  async updateClientSite(id: string, data: any) {
    return this.prisma.clientSite.update({
      where: { id },
      data,
    });
  }

  async deleteClientSite(id: string) {
    return this.prisma.clientSite.delete({ where: { id } });
  }

  // ==========================================
  // 3. WARDS
  // ==========================================
  async findAllWards() {
    const wards = await this.prisma.ward.findMany({
      include: { parentSite: true },
      orderBy: { createdAt: 'desc' },
    });
    return wards.map((w) => ({
      id: w.id,
      wardCode: w.wardCode,
      wardName: w.wardName,
      hospitalName: w.parentSite?.siteName || 'โรงพยาบาลเสนา',
      wardStatus: w.wardStatus || 'Active',
      parentSiteId: w.parentSiteId,
    }));
  }

  async createWard(data: {
    wardCode: string;
    wardName: string;
    siteCode?: string;
    wardStatus?: string;
    parentSiteId?: string;
  }) {
    if (!data.wardCode || !data.wardName) {
      throw new BadRequestException('กรุณาระบุ WARD CODE และ WARD NAME');
    }

    let parentSiteId = data.parentSiteId;
    if (!parentSiteId) {
      const parent = await this.prisma.parentSite.findFirst();
      if (!parent) throw new BadRequestException('ไม่พบ Parent Site');
      parentSiteId = parent.id;
    }

    return this.prisma.ward.create({
      data: {
        wardCode: data.wardCode,
        wardName: data.wardName,
        wardStatus: data.wardStatus || 'Active',
        parentSiteId,
      },
      include: { parentSite: true },
    });
  }

  async updateWard(id: string, data: any) {
    return this.prisma.ward.update({ where: { id }, data });
  }

  async deleteWard(id: string) {
    return this.prisma.ward.delete({ where: { id } });
  }

  // ==========================================
  // 4. DEPARTMENTS
  // ==========================================
  async findAllDepartments() {
    return this.prisma.department.findMany({
      orderBy: { departmentCode: 'asc' },
    });
  }

  async createDepartment(data: {
    departmentCode: string;
    departmentName: string;
    deptStatus?: string;
  }) {
    if (!data.departmentCode || !data.departmentName) {
      throw new BadRequestException('กรุณาระบุ DEPARTMENT CODE และ DEPARTMENT NAME');
    }
    const existing = await this.prisma.department.findUnique({
      where: { departmentCode: data.departmentCode },
    });
    if (existing) {
      throw new BadRequestException(`Department Code "${data.departmentCode}" มีอยู่แล้ว`);
    }

    return this.prisma.department.create({
      data: {
        departmentCode: data.departmentCode,
        departmentName: data.departmentName,
        deptStatus: data.deptStatus || 'Active',
      },
    });
  }

  async updateDepartment(id: string, data: any) {
    return this.prisma.department.update({ where: { id }, data });
  }

  async deleteDepartment(id: string) {
    return this.prisma.department.delete({ where: { id } });
  }

  // ==========================================
  // 5. SAMPLE CONDITIONS
  // ==========================================
  async findAllSampleConditions() {
    return this.prisma.sampleCondition.findMany({
      orderBy: { createdAt: 'asc' },
    });
  }

  async createSampleCondition(data: {
    conditionCode: string;
    conditionName: string;
    sampleStatus?: string;
    isDefault?: boolean;
  }) {
    if (!data.conditionCode || !data.conditionName) {
      throw new BadRequestException('กรุณาระบุ CONDITION CODE และ CONDITION NAME');
    }
    const existing = await this.prisma.sampleCondition.findUnique({
      where: { conditionCode: data.conditionCode },
    });
    if (existing) {
      throw new BadRequestException(`Condition Code "${data.conditionCode}" มีอยู่แล้ว`);
    }

    return this.prisma.sampleCondition.create({
      data: {
        conditionCode: data.conditionCode,
        conditionName: data.conditionName,
        sampleStatus: data.sampleStatus || 'Active',
        isDefault: Boolean(data.isDefault),
      },
    });
  }

  async updateSampleCondition(id: string, data: any) {
    return this.prisma.sampleCondition.update({ where: { id }, data });
  }

  async deleteSampleCondition(id: string) {
    return this.prisma.sampleCondition.delete({ where: { id } });
  }
}
