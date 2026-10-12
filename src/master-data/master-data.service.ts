import { Injectable, BadRequestException, NotFoundException, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MasterDataService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  // ==========================================
  // 1. PARENT SITES
  // ==========================================
  async findAllParentSites() {
    const cached = await this.cacheManager.get<any[]>('master_parent_sites');
    if (cached) return cached;

    const sites = await this.prisma.parentSite.findMany({
      orderBy: { createdAt: 'desc' },
      include: { clientSites: true },
    });

    await this.cacheManager.set('master_parent_sites', sites, 600000); // 10 minutes
    return sites;
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

    const created = await this.prisma.parentSite.create({
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

    await this.cacheManager.del('master_parent_sites');
    await this.cacheManager.del('user_options');
    return created;
  }

  async updateParentSite(id: string, data: any) {
    const updated = await this.prisma.parentSite.update({
      where: { id },
      data,
    });
    await this.cacheManager.del('master_parent_sites');
    await this.cacheManager.del('user_options');
    return updated;
  }

  async deleteParentSite(id: string) {
    const deleted = await this.prisma.parentSite.delete({ where: { id } });
    await this.cacheManager.del('master_parent_sites');
    await this.cacheManager.del('user_options');
    return deleted;
  }

  // ==========================================
  // 2. CLIENT SITES
  // ==========================================
  async findAllClientSites(parentSiteId?: string) {
    const cacheKey = `master_client_sites_${parentSiteId || 'all'}`;
    const cached = await this.cacheManager.get<any[]>(cacheKey);
    if (cached) return cached;

    const where: any = {};
    if (parentSiteId) where.parentSiteId = parentSiteId;

    const sites = await this.prisma.clientSite.findMany({
      where,
      include: { parentSite: true },
      orderBy: { createdAt: 'desc' },
    });

    const mapped = sites.map((s) => ({
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

    await this.cacheManager.set(cacheKey, mapped, 600000);
    return mapped;
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

    const created = await this.prisma.clientSite.create({
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

    await this.cacheManager.del('master_client_sites_all');
    await this.cacheManager.del('user_options');
    return created;
  }

  async updateClientSite(id: string, data: any) {
    const updated = await this.prisma.clientSite.update({
      where: { id },
      data,
    });
    await this.cacheManager.del('master_client_sites_all');
    await this.cacheManager.del('user_options');
    return updated;
  }

  async deleteClientSite(id: string) {
    const deleted = await this.prisma.clientSite.delete({ where: { id } });
    await this.cacheManager.del('master_client_sites_all');
    await this.cacheManager.del('user_options');
    return deleted;
  }

  // ==========================================
  // 3. WARDS
  // ==========================================
  async findAllWards() {
    const cached = await this.cacheManager.get<any[]>('master_wards');
    if (cached) return cached;

    const wards = await this.prisma.ward.findMany({
      include: { parentSite: true },
      orderBy: { createdAt: 'desc' },
    });
    const mapped = wards.map((w) => ({
      id: w.id,
      wardCode: w.wardCode,
      wardName: w.wardName,
      hospitalName: w.parentSite?.siteName || 'โรงพยาบาลเสนา',
      wardStatus: w.wardStatus || 'Active',
      parentSiteId: w.parentSiteId,
    }));

    await this.cacheManager.set('master_wards', mapped, 600000);
    return mapped;
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

    const created = await this.prisma.ward.create({
      data: {
        wardCode: data.wardCode,
        wardName: data.wardName,
        wardStatus: data.wardStatus || 'Active',
        parentSiteId,
      },
      include: { parentSite: true },
    });

    await this.cacheManager.del('master_wards');
    return created;
  }

  async updateWard(id: string, data: any) {
    const updated = await this.prisma.ward.update({ where: { id }, data });
    await this.cacheManager.del('master_wards');
    return updated;
  }

  async deleteWard(id: string) {
    const deleted = await this.prisma.ward.delete({ where: { id } });
    await this.cacheManager.del('master_wards');
    return deleted;
  }

  // ==========================================
  // 4. DEPARTMENTS
  // ==========================================
  async findAllDepartments() {
    const cached = await this.cacheManager.get<any[]>('master_departments');
    if (cached) return cached;

    const depts = await this.prisma.department.findMany({
      orderBy: { departmentCode: 'asc' },
    });

    await this.cacheManager.set('master_departments', depts, 600000);
    return depts;
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

    const created = await this.prisma.department.create({
      data: {
        departmentCode: data.departmentCode,
        departmentName: data.departmentName,
        deptStatus: data.deptStatus || 'Active',
      },
    });

    await this.cacheManager.del('master_departments');
    return created;
  }

  async updateDepartment(id: string, data: any) {
    const updated = await this.prisma.department.update({ where: { id }, data });
    await this.cacheManager.del('master_departments');
    return updated;
  }

  async deleteDepartment(id: string) {
    const deleted = await this.prisma.department.delete({ where: { id } });
    await this.cacheManager.del('master_departments');
    return deleted;
  }

  // ==========================================
  // 5. SAMPLE CONDITIONS
  // ==========================================
  async findAllSampleConditions() {
    const cached = await this.cacheManager.get<any[]>('master_sample_conditions');
    if (cached) return cached;

    const conditions = await this.prisma.sampleCondition.findMany({
      orderBy: { createdAt: 'asc' },
    });

    await this.cacheManager.set('master_sample_conditions', conditions, 600000);
    return conditions;
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

    const created = await this.prisma.sampleCondition.create({
      data: {
        conditionCode: data.conditionCode,
        conditionName: data.conditionName,
        sampleStatus: data.sampleStatus || 'Active',
        isDefault: Boolean(data.isDefault),
      },
    });

    await this.cacheManager.del('master_sample_conditions');
    return created;
  }

  async updateSampleCondition(id: string, data: any) {
    const updated = await this.prisma.sampleCondition.update({ where: { id }, data });
    await this.cacheManager.del('master_sample_conditions');
    return updated;
  }

  async deleteSampleCondition(id: string) {
    const deleted = await this.prisma.sampleCondition.delete({ where: { id } });
    await this.cacheManager.del('master_sample_conditions');
    return deleted;
  }

  // ==========================================
  // 6. CACHE DIAGNOSTICS & STATS
  // ==========================================
  async getCacheStats() {
    const keys = [
      'master_parent_sites',
      'master_client_sites_all',
      'master_wards',
      'master_departments',
      'master_sample_conditions',
      'user_options',
    ];

    const entries: Record<string, any> = {};
    for (const key of keys) {
      const data: any = await this.cacheManager.get(key);
      const isCached = data !== undefined && data !== null;
      entries[key] = {
        isCached,
        itemCount: Array.isArray(data) ? data.length : isCached ? 1 : 0,
        sample: Array.isArray(data) ? data.slice(0, 1) : data,
      };
    }

    return {
      status: 'active',
      cachedKeysCount: Object.values(entries).filter((e) => e.isCached).length,
      keys: entries,
    };
  }
}
