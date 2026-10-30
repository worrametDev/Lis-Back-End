import { Injectable, BadRequestException, NotFoundException, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MasterDataService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) { }

  // ==========================================
  // 0. HEALTH CHECK
  // ==========================================
  async checkHealth() {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const latencyMs = Date.now() - start;
      return {
        status: 'CONNECTED',
        database: 'PostgreSQL',
        latencyMs,
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
      return {
        status: 'DISCONNECTED',
        database: 'PostgreSQL',
        latencyMs: Date.now() - start,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

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

  async getSiteInfo() {
    const cached = await this.cacheManager.get<any>('master_site_info');
    if (cached && cached.siteName && !cached.siteName.includes('?')) return cached;

    const primarySite = await this.prisma.parentSite.findFirst({
      where: { siteStatus: 'Active' },
      orderBy: { createdAt: 'asc' },
    });

    const envHospitalName = process.env.HOSPITAL_NAME;
    const envHospitalNameEn = process.env.HOSPITAL_NAME_EN;

    const cleanStr = (val: string | null | undefined, fallback: string) => {
      if (!val || val.includes('?')) return fallback;
      return val;
    };

    const siteName = cleanStr(primarySite?.siteName, envHospitalName || 'โรงพยาบาลเสนา');
    const siteCode = primarySite?.siteCode || '00940';
    const province = cleanStr(primarySite?.province, 'พระนครศรีอยุธยา');
    const district = cleanStr(primarySite?.district, 'อำเภอเสนา');
    const subdistrict = cleanStr(primarySite?.subdistrict, 'ตำบลสามกอ');
    const address = cleanStr(primarySite?.address, '111 หมู่ 2');

    let hospitalNameEn = envHospitalNameEn || '';
    if (!hospitalNameEn && siteName.includes('(') && siteName.includes(')')) {
      const match = siteName.match(/\(([^)]+)\)/);
      if (match) hospitalNameEn = match[1];
    } else if (!hospitalNameEn && (siteName.includes('เสนา') || siteName.includes('Sena'))) {
      hospitalNameEn = 'Sena Hospital';
    }

    let displayName = siteName;
    if (hospitalNameEn && !siteName.includes('(')) {
      displayName = `${siteName} (${hospitalNameEn})`;
    }

    const result = {
      id: primarySite?.id || '',
      siteCode,
      siteName,
      hospitalNameEn,
      displayName,
      province,
      district,
      subdistrict,
      address,
      zipcode: primarySite?.zipcode || '13110',
      lnPattern: primarySite?.lnPattern || 'LN-69{YY}{MM}{DD}{SEQ}',
      siteType: primarySite?.siteType || 'Parent Site',
    };

    await this.cacheManager.set('master_site_info', result, 600000); // 10 minutes
    return result;
  }

  async updateSiteInfo(data: {
    siteCode?: string;
    siteName?: string;
    hospitalNameEn?: string;
    displayName?: string;
    address?: string;
    subdistrict?: string;
    district?: string;
    province?: string;
    zipcode?: string;
    lnPattern?: string;
  }) {
    let primarySite = await this.prisma.parentSite.findFirst({
      where: { siteStatus: 'Active' },
      orderBy: { createdAt: 'asc' },
    });

    const cleanInput = (val: string | undefined, current: string | null | undefined, fallback: string) => {
      if (val === undefined) return current || fallback;
      if (val.includes('?')) return current && !current.includes('?') ? current : fallback;
      return val;
    };

    const siteName = cleanInput(data.siteName, primarySite?.siteName, 'โรงพยาบาลเสนา');
    const hospitalNameEn = data.hospitalNameEn || 'Sena Hospital';

    let displayName = data.displayName;
    if (!displayName || displayName.includes('?')) {
      if (hospitalNameEn && !siteName.includes('(')) {
        displayName = `${siteName} (${hospitalNameEn})`;
      } else {
        displayName = siteName;
      }
    }

    if (primarySite) {
      primarySite = await this.prisma.parentSite.update({
        where: { id: primarySite.id },
        data: {
          siteCode: data.siteCode || primarySite.siteCode,
          siteName: siteName,
          address: cleanInput(data.address, primarySite.address, '111 หมู่ 2'),
          subdistrict: cleanInput(data.subdistrict, primarySite.subdistrict, 'ตำบลสามกอ'),
          district: cleanInput(data.district, primarySite.district, 'อำเภอเสนา'),
          province: cleanInput(data.province, primarySite.province, 'พระนครศรีอยุธยา'),
          zipcode: data.zipcode !== undefined ? data.zipcode : primarySite.zipcode,
          lnPattern: data.lnPattern !== undefined ? data.lnPattern : primarySite.lnPattern,
        },
      });
    } else {
      primarySite = await this.prisma.parentSite.create({
        data: {
          siteCode: data.siteCode || '00940',
          siteName: siteName,
          siteType: 'Parent Site',
          siteStatus: 'Active',
          address: data.address || '',
          subdistrict: data.subdistrict || '',
          district: data.district || '',
          province: data.province || '',
          zipcode: data.zipcode || '',
          lnPattern: data.lnPattern || 'LN-69{YY}{MM}{DD}{SEQ}',
        },
      });
    }

    await this.cacheManager.del('master_site_info');
    await this.cacheManager.del('master_parent_sites');
    await this.cacheManager.del('user_options');

    const result = {
      id: primarySite.id,
      siteCode: primarySite.siteCode,
      siteName: primarySite.siteName,
      hospitalNameEn,
      displayName,
      province: primarySite.province || '',
      district: primarySite.district || '',
      subdistrict: primarySite.subdistrict || '',
      address: primarySite.address || '',
      zipcode: primarySite.zipcode || '',
      lnPattern: primarySite.lnPattern || '',
      siteType: primarySite.siteType || 'Parent Site',
    };

    await this.cacheManager.set('master_site_info', result, 600000);
    return result;
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
    await this.cacheManager.del('master_client_sites_all');
    await this.cacheManager.del('master_wards');
    await this.cacheManager.del('master_site_info');
    await this.cacheManager.del('user_options');
    return created;
  }

  async updateParentSite(id: string, data: any) {
    const allowed = [
      'siteCode', 'siteName', 'siteType', 'siteStatus', 'lnPattern',
      'address', 'subdistrict', 'district', 'province', 'zipcode',
      'hospitalFile', 'isoFile'
    ];
    const updateData: any = {};
    for (const key of allowed) {
      if (data[key] !== undefined) updateData[key] = data[key];
    }
    if (data.status !== undefined && updateData.siteStatus === undefined) {
      updateData.siteStatus = data.status;
    }
    const updated = await this.prisma.parentSite.update({
      where: { id },
      data: updateData,
    });

    // Two-way Cascade: เมื่อแม่ข่ายเปลี่ยนสถานะ ให้ปรับสถานะลูกข่าย (Client Site) และวอร์ด (Ward) ในสังกัดทั้งหมดตามอัตโนมัติ
    if (updateData.siteStatus === 'Inactive') {
      await this.prisma.clientSite.updateMany({
        where: { parentSiteId: id },
        data: { siteStatus: 'Inactive' },
      });
      await this.prisma.ward.updateMany({
        where: { parentSiteId: id },
        data: { wardStatus: 'Inactive' },
      });
    } else if (updateData.siteStatus === 'Active') {
      await this.prisma.clientSite.updateMany({
        where: { parentSiteId: id },
        data: { siteStatus: 'Active' },
      });
      await this.prisma.ward.updateMany({
        where: { parentSiteId: id },
        data: { wardStatus: 'Active' },
      });
    }

    // ล้าง Cache ที่เกี่ยวข้องทั้งหมดเสมอ (ทั้ง Client Sites, Wards, Parent Sites) ไม่ว่าจะเปลี่ยนสถานะเป็น Active/Inactive หรือแก้ไขชื่อ/รหัส
    await this.cacheManager.del('master_client_sites_all');
    await this.cacheManager.del(`master_client_sites_${id}`);
    await this.cacheManager.del('master_wards');
    await this.cacheManager.del('master_parent_sites');
    await this.cacheManager.del('master_site_info');
    await this.cacheManager.del('user_options');
    return updated;
  }

  async deleteParentSite(id: string) {
    const parent = await this.prisma.parentSite.findUnique({ where: { id } });
    if (!parent) throw new NotFoundException('ไม่พบข้อมูล Parent Site ในระบบ');

    const [clientCount, userCount, orderCount, wardCount] = await Promise.all([
      this.prisma.clientSite.count({ where: { parentSiteId: id } }),
      this.prisma.user.count({ where: { parentSiteId: id } }),
      this.prisma.order.count({ where: { parentSiteId: id } }),
      this.prisma.ward.count({ where: { parentSiteId: id } }),
    ]);

    const reasons: string[] = [];
    if (clientCount > 0) reasons.push(`Client Site (${clientCount} แห่ง)`);
    if (userCount > 0) reasons.push(`ผู้ใช้งาน (${userCount} บัญชี)`);
    if (orderCount > 0) reasons.push(`ใบสั่งตรวจ (${orderCount} รายการ)`);
    if (wardCount > 0) reasons.push(`หอผู้ป่วย (${wardCount} แผนก)`);

    if (reasons.length > 0) {
      throw new BadRequestException(
        `ไม่สามารถลบ "${parent.siteName}" ได้ เนื่องจากมีข้อมูลเชื่อมโยงอยู่ในระบบ: ${reasons.join(', ')} กรุณาเปลี่ยนสถานะเป็น Inactive แทน หรือลบข้อมูลที่เกี่ยวข้องออกก่อน`
      );
    }

    const deleted = await this.prisma.parentSite.delete({ where: { id } });
    await this.cacheManager.del('master_parent_sites');
    await this.cacheManager.del('master_client_sites_all');
    await this.cacheManager.del(`master_client_sites_${id}`);
    await this.cacheManager.del('master_wards');
    await this.cacheManager.del('master_site_info');
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
      parentSiteCode: s.parentSite?.siteCode || '',
      parentSiteStatus: s.parentSite?.siteStatus || 'Active',
      siteType: s.siteType || 'Client Site',
      siteStatus: s.siteStatus || 'Active',
      lnPattern: s.lnPattern || '',
      address: s.address || '',
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
    if (!parentSiteId || parentSiteId === 'default') {
      let parent: any = null;
      if (data.parentSiteCode) {
        parent = await this.prisma.parentSite.findFirst({ where: { siteCode: data.parentSiteCode } });
      }
      if (!parent && (data as any).parentSiteName) {
        parent = await this.prisma.parentSite.findFirst({ where: { siteName: (data as any).parentSiteName } });
      }
      if (!parent) {
        parent = await this.prisma.parentSite.findFirst({ where: { siteStatus: 'Active' } });
      }
      if (!parent) {
        parent = await this.prisma.parentSite.findFirst();
      }
      if (!parent) throw new BadRequestException('ไม่พบข้อมูล Parent Site ในระบบ');
      parentSiteId = parent.id;
    }

    // ตรวจสอบสถานะของแม่ข่าย: หากแม่ข่ายถูกระงับการใช้งาน ห้ามสร้างลูกข่ายในสถานะ Active
    const parentSite = await this.prisma.parentSite.findUnique({ where: { id: parentSiteId } });
    if (data.siteStatus !== 'Inactive' && (!parentSite || parentSite.siteStatus !== 'Active')) {
      throw new BadRequestException(
        `ไม่สามารถสร้างลูกข่ายในสถานะ Active ได้ เนื่องจากโรงพยาบาลแม่ข่าย "${parentSite?.siteName || 'ไม่ระบุ'}" อยู่ในสถานะระงับการใช้งาน (Inactive) กรุณาเลือกแม่ข่ายที่เปิดใช้งานอยู่`
      );
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
    const currentClient = await this.prisma.clientSite.findUnique({
      where: { id },
      include: { parentSite: true },
    });
    if (!currentClient) throw new NotFoundException('ไม่พบข้อมูล Client Site ในระบบ');

    const allowed = [
      'siteCode', 'siteName', 'siteType', 'siteStatus', 'lnPattern',
      'parentSiteId', 'address', 'subdistrict', 'district', 'province',
      'zipcode', 'hospitalFile', 'isoFile'
    ];
    const updateData: any = {};
    for (const key of allowed) {
      if (data[key] !== undefined) updateData[key] = data[key];
    }
    if (data.status !== undefined && updateData.siteStatus === undefined) {
      updateData.siteStatus = data.status;
    }

    // 1. จัดการการย้ายสังกัด (Relocation): หากมีการส่ง parentSiteId หรือ parentSiteName/Code ใหม่
    let targetParentId = updateData.parentSiteId;
    if (!targetParentId && (data.parentSiteName || data.parentSiteCode)) {
      const foundParent = await this.prisma.parentSite.findFirst({
        where: {
          OR: [
            data.parentSiteCode ? { siteCode: data.parentSiteCode } : undefined,
            data.parentSiteName ? { siteName: data.parentSiteName } : undefined,
          ].filter(Boolean) as any,
        },
      });
      if (foundParent) {
        targetParentId = foundParent.id;
        updateData.parentSiteId = targetParentId;
      }
    }

    // 2. Activation Guard: ตรวจสอบสถานะของแม่ข่าย หากจะเปิดใช้งาน (Active) แม่ข่ายต้อง Active ด้วย
    const effectiveParentId = targetParentId || currentClient.parentSiteId;
    const effectiveParent = await this.prisma.parentSite.findUnique({
      where: { id: effectiveParentId },
    });

    const isTargetActive = updateData.siteStatus === 'Active' || (updateData.siteStatus === undefined && currentClient.siteStatus === 'Active');
    if (updateData.siteStatus === 'Active' || (targetParentId && targetParentId !== currentClient.parentSiteId && isTargetActive)) {
      if (!effectiveParent || effectiveParent.siteStatus !== 'Active') {
        throw new BadRequestException(
          `ไม่สามารถเปิดใช้งานลูกข่าย "${currentClient.siteName}" ได้ เนื่องจากโรงพยาบาลแม่ข่าย "${effectiveParent?.siteName || 'ไม่ระบุ'}" อยู่ในสถานะระงับการใช้งาน (Inactive) กรุณาเปิดใช้งานแม่ข่ายก่อน หรือย้ายสังกัดไปยังแม่ข่ายที่เปิดใช้งาน`
        );
      }
    }

    const updated = await this.prisma.clientSite.update({
      where: { id },
      data: updateData,
      include: { parentSite: true },
    });
    await this.cacheManager.del('master_client_sites_all');
    await this.cacheManager.del('user_options');
    return {
      ...updated,
      parentSiteName: updated.parentSite?.siteName || 'โรงพยาบาลเสนา',
      parentSiteCode: updated.parentSite?.siteCode || '',
      parentSiteStatus: updated.parentSite?.siteStatus || 'Active',
    };
  }

  async deleteClientSite(id: string) {
    const client = await this.prisma.clientSite.findUnique({ where: { id } });
    if (!client) throw new NotFoundException('ไม่พบข้อมูล Client Site ในระบบ');

    const [orderCount, userCount, shipmentCount] = await Promise.all([
      this.prisma.order.count({ where: { clientSiteId: id } }),
      this.prisma.user.count({ where: { clientSiteId: id } }),
      this.prisma.shipment.count({ where: { clientSiteId: id } }),
    ]);

    const reasons: string[] = [];
    if (orderCount > 0) reasons.push(`ใบสั่งตรวจ (${orderCount} รายการ)`);
    if (userCount > 0) reasons.push(`ผู้ใช้งาน (${userCount} บัญชี)`);
    if (shipmentCount > 0) reasons.push(`การจัดส่ง (${shipmentCount} รายการ)`);

    if (reasons.length > 0) {
      throw new BadRequestException(
        `ไม่สามารถลบ "${client.siteName}" ได้ เนื่องจากมีข้อมูลเชื่อมโยงอยู่ในระบบ: ${reasons.join(', ')} กรุณาเปลี่ยนสถานะเป็น Inactive แทน`
      );
    }

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
      selectedSites: w.selectedSites,
      hospitalFile: w.hospitalFile,
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
    selectedSites?: any;
    hospitalFile?: string;
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
        selectedSites: data.selectedSites || (data.siteCode ? [data.siteCode] : ['ALL']),
        hospitalFile: data.hospitalFile,
      },
      include: { parentSite: true },
    });

    await this.cacheManager.del('master_wards');
    return created;
  }

  async updateWard(id: string, data: any) {
    const allowed = [
      'wardCode', 'wardName', 'wardStatus', 'hospitalFile',
      'selectedSites', 'parentSiteId'
    ];
    const updateData: any = {};
    for (const key of allowed) {
      if (data[key] !== undefined) updateData[key] = data[key];
    }
    if (data.status !== undefined && updateData.wardStatus === undefined) {
      updateData.wardStatus = data.status;
    }
    const updated = await this.prisma.ward.update({ where: { id }, data: updateData });
    await this.cacheManager.del('master_wards');
    return updated;
  }

  async deleteWard(id: string) {
    const ward = await this.prisma.ward.findUnique({ where: { id } });
    if (!ward) throw new NotFoundException('ไม่พบข้อมูล Ward ในระบบ');

    const orderCount = await this.prisma.order.count({ where: { wardId: id } });
    if (orderCount > 0) {
      throw new BadRequestException(
        `ไม่สามารถลบหอผู้ป่วย "${ward.wardName}" ได้ เนื่องจากมีใบสั่งตรวจ (${orderCount} รายการ) ผูกอยู่ กรุณาเปลี่ยนสถานะเป็น Inactive แทน`
      );
    }

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
    hospitalFile?: string;
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
        hospitalFile: data.hospitalFile,
      },
    });

    await this.cacheManager.del('master_departments');
    return created;
  }

  async updateDepartment(id: string, data: any) {
    const allowed = ['departmentCode', 'departmentName', 'deptStatus', 'hospitalFile'];
    const updateData: any = {};
    for (const key of allowed) {
      if (data[key] !== undefined) updateData[key] = data[key];
    }
    if (data.status !== undefined && updateData.deptStatus === undefined) {
      updateData.deptStatus = data.status;
    }
    const updated = await this.prisma.department.update({ where: { id }, data: updateData });
    await this.cacheManager.del('master_departments');
    return updated;
  }

  async deleteDepartment(id: string) {
    const dept = await this.prisma.department.findUnique({ where: { id } });
    if (!dept) throw new NotFoundException('ไม่พบข้อมูลแผนกในระบบ');

    const resultCount = await this.prisma.testResult.count({ where: { departmentId: id } });
    if (resultCount > 0) {
      throw new BadRequestException(
        `ไม่สามารถลบแผนก "${dept.departmentName}" ได้ เนื่องจากมีผลตรวจวิเคราะห์ (${resultCount} รายการ) ผูกอยู่ กรุณาเปลี่ยนสถานะเป็น Inactive แทน`
      );
    }

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
    const allowed = ['conditionCode', 'conditionName', 'sampleStatus', 'isDefault', 'hospitalFile'];
    const updateData: any = {};
    for (const key of allowed) {
      if (data[key] !== undefined) updateData[key] = data[key];
    }
    if (data.status !== undefined && updateData.sampleStatus === undefined) {
      updateData.sampleStatus = data.status;
    }
    const updated = await this.prisma.sampleCondition.update({ where: { id }, data: updateData });
    await this.cacheManager.del('master_sample_conditions');
    return updated;
  }

  async deleteSampleCondition(id: string) {
    const cond = await this.prisma.sampleCondition.findUnique({ where: { id } });
    if (!cond) throw new NotFoundException('ไม่พบข้อมูลสภาพสิ่งส่งตรวจในระบบ');

    const sampleCount = await this.prisma.sample.count({ where: { sampleConditionId: id } });
    if (sampleCount > 0) {
      throw new BadRequestException(
        `ไม่สามารถลบ "${cond.conditionName}" ได้ เนื่องจากมีสิ่งส่งตรวจ (${sampleCount} รายการ) บันทึกสภาพนี้ไว้ กรุณาเปลี่ยนสถานะเป็น Inactive แทน`
      );
    }

    const deleted = await this.prisma.sampleCondition.delete({ where: { id } });
    await this.cacheManager.del('master_sample_conditions');
    return deleted;
  }

  // ==========================================
  // 6. TITLES (คำนำหน้าชื่อ - Database Persisted)
  // ==========================================
  async findAllTitles() {
    let list = await this.prisma.title.findMany({
      orderBy: { titleCode: 'asc' },
    });
    if (list.length === 0) {
      const defaults = [
        { titleCode: "01", titleNameTh: "นาย", titleNameEn: "Mr.", status: "Active" },
        { titleCode: "02", titleNameTh: "นาง", titleNameEn: "Mrs.", status: "Active" },
        { titleCode: "03", titleNameTh: "นางสาว", titleNameEn: "Miss", status: "Active" },
        { titleCode: "04", titleNameTh: "เด็กชาย", titleNameEn: "Master", status: "Active" },
        { titleCode: "05", titleNameTh: "เด็กหญิง", titleNameEn: "Girl", status: "Active" },
      ];
      for (const d of defaults) {
        await this.prisma.title.create({ data: d }).catch(() => { });
      }
      list = await this.prisma.title.findMany({ orderBy: { titleCode: 'asc' } });
    }
    return list.map((t) => ({
      id: t.id,
      titleCode: t.titleCode,
      titleName: t.titleNameTh,
      titleNameTh: t.titleNameTh,
      titleNameEn: t.titleNameEn,
      name: t.titleNameTh,
      status: t.status,
    }));
  }

  async createTitle(data: any) {
    const titleNameTh = data.titleNameTh || data.titleName || data.name || '';
    const titleCode = data.titleCode || `T-${Date.now().toString().slice(-4)}`;
    const created = await this.prisma.title.create({
      data: {
        titleCode,
        titleNameTh,
        titleNameEn: data.titleNameEn || '',
        status: data.status || 'Active',
      },
    });
    return {
      id: created.id,
      titleCode: created.titleCode,
      titleName: created.titleNameTh,
      titleNameTh: created.titleNameTh,
      titleNameEn: created.titleNameEn,
      name: created.titleNameTh,
      status: created.status,
    };
  }

  async updateTitle(id: string, data: any) {
    const updateData: any = {};
    if (data.titleCode) updateData.titleCode = data.titleCode;
    if (data.titleNameTh || data.titleName || data.name) {
      updateData.titleNameTh = data.titleNameTh || data.titleName || data.name;
    }
    if (data.titleNameEn !== undefined) updateData.titleNameEn = data.titleNameEn;
    if (data.status) updateData.status = data.status;

    const updated = await this.prisma.title.update({
      where: { id },
      data: updateData,
    });
    return {
      id: updated.id,
      titleCode: updated.titleCode,
      titleName: updated.titleNameTh,
      titleNameTh: updated.titleNameTh,
      titleNameEn: updated.titleNameEn,
      name: updated.titleNameTh,
      status: updated.status,
    };
  }

  async deleteTitle(id: string) {
    await this.prisma.title.delete({ where: { id } });
    return { success: true };
  }

  // ==========================================
  // 7. ETHNICITIES (เชื้อชาติ - Database Persisted)
  // ==========================================
  async findAllEthnicities() {
    let list = await this.prisma.ethnicity.findMany({
      orderBy: { ethnicityCode: 'asc' },
    });
    if (list.length === 0) {
      const defaults = [
        { ethnicityCode: "TH", ethnicityNameTh: "ไทย", ethnicityNameEn: "Thai", status: "Active" },
        { ethnicityCode: "MM", ethnicityNameTh: "เมียนมา", ethnicityNameEn: "Myanmar", status: "Active" },
        { ethnicityCode: "LA", ethnicityNameTh: "ลาว", ethnicityNameEn: "Lao", status: "Active" },
        { ethnicityCode: "KH", ethnicityNameTh: "กัมพูชา", ethnicityNameEn: "Cambodian", status: "Active" },
        { ethnicityCode: "CN", ethnicityNameTh: "จีน", ethnicityNameEn: "Chinese", status: "Active" },
        { ethnicityCode: "OTHER", ethnicityNameTh: "อื่นๆ", ethnicityNameEn: "Other", status: "Active" },
      ];
      for (const d of defaults) {
        await this.prisma.ethnicity.create({ data: d }).catch(() => { });
      }
      list = await this.prisma.ethnicity.findMany({ orderBy: { ethnicityCode: 'asc' } });
    }
    return list.map((e) => ({
      id: e.id,
      ethnicityCode: e.ethnicityCode,
      ethnicityName: e.ethnicityNameTh,
      ethnicityNameTh: e.ethnicityNameTh,
      ethnicityNameEn: e.ethnicityNameEn,
      name: e.ethnicityNameTh,
      status: e.status,
    }));
  }

  async createEthnicity(data: any) {
    const ethnicityNameTh = data.ethnicityNameTh || data.ethnicityName || data.name || '';
    const ethnicityCode = data.ethnicityCode || `E-${Date.now().toString().slice(-4)}`;
    const created = await this.prisma.ethnicity.create({
      data: {
        ethnicityCode,
        ethnicityNameTh,
        ethnicityNameEn: data.ethnicityNameEn || '',
        status: data.status || 'Active',
      },
    });
    return {
      id: created.id,
      ethnicityCode: created.ethnicityCode,
      ethnicityName: created.ethnicityNameTh,
      ethnicityNameTh: created.ethnicityNameTh,
      ethnicityNameEn: created.ethnicityNameEn,
      name: created.ethnicityNameTh,
      status: created.status,
    };
  }

  async updateEthnicity(id: string, data: any) {
    const updateData: any = {};
    if (data.ethnicityCode) updateData.ethnicityCode = data.ethnicityCode;
    if (data.ethnicityNameTh || data.ethnicityName || data.name) {
      updateData.ethnicityNameTh = data.ethnicityNameTh || data.ethnicityName || data.name;
    }
    if (data.ethnicityNameEn !== undefined) updateData.ethnicityNameEn = data.ethnicityNameEn;
    if (data.status) updateData.status = data.status;

    const updated = await this.prisma.ethnicity.update({
      where: { id },
      data: updateData,
    });
    return {
      id: updated.id,
      ethnicityCode: updated.ethnicityCode,
      ethnicityName: updated.ethnicityNameTh,
      ethnicityNameTh: updated.ethnicityNameTh,
      ethnicityNameEn: updated.ethnicityNameEn,
      name: updated.ethnicityNameTh,
      status: updated.status,
    };
  }

  async deleteEthnicity(id: string) {
    await this.prisma.ethnicity.delete({ where: { id } });
    return { success: true };
  }

  // ==========================================
  // 8. TEST PANELS (ชุดการตรวจ - Database Persisted)
  // ==========================================
  async findAllTestPanels() {
    let list = await this.prisma.testPanel.findMany({
      orderBy: { panelCode: 'asc' },
    });
    if (list.length === 0) {
      const defaults = [
        { panelCode: "CBC", panelName: "Complete Blood Count Panel", specimenType: "EDTA Blood", department: "Hematology", status: "Active" },
        { panelCode: "DM-SCREEN", panelName: "Diabetic Screen Panel (FBS, HbA1c)", specimenType: "Fluoride / EDTA Blood", department: "Chemistry", status: "Active" },
        { panelCode: "RFT", panelName: "Renal Function Test Panel (BUN, Cr)", specimenType: "Clotted Blood", department: "Chemistry", status: "Active" },
        { panelCode: "LIPID", panelName: "Lipid Profile Panel (CHOL, TRIG, HDL, LDL)", specimenType: "Clotted Blood", department: "Chemistry", status: "Active" },
        { panelCode: "LFT", panelName: "Liver Function Test Panel (AST, ALT, ALP, TBIL)", specimenType: "Clotted Blood", department: "Chemistry", status: "Active" },
        { panelCode: "UA", panelName: "Urinalysis Routine", specimenType: "Urine", department: "Microscopy", status: "Active" },
        { panelCode: "ELECTROLYTES", panelName: "Electrolytes Panel (Na, K, Cl, CO2)", specimenType: "Clotted Blood", department: "Chemistry", status: "Active" },
      ];
      for (const d of defaults) {
        await this.prisma.testPanel.create({ data: d }).catch(() => { });
      }
      list = await this.prisma.testPanel.findMany({ orderBy: { panelCode: 'asc' } });
    }
    return list.map((p) => ({
      id: p.id,
      panelCode: p.panelCode,
      panelName: p.panelName,
      code: p.panelCode,
      name: p.panelName,
      specimenType: p.specimenType,
      department: p.department,
      status: p.status,
    }));
  }

  async createTestPanel(data: any) {
    const panelCode = data.panelCode || data.code || `P-${Date.now().toString().slice(-4)}`;
    const panelName = data.panelName || data.name || '';
    const created = await this.prisma.testPanel.create({
      data: {
        panelCode,
        panelName,
        specimenType: data.specimenType,
        department: data.department,
        status: data.status || 'Active',
      },
    });
    return {
      id: created.id,
      panelCode: created.panelCode,
      panelName: created.panelName,
      code: created.panelCode,
      name: created.panelName,
      specimenType: created.specimenType,
      department: created.department,
      status: created.status,
    };
  }

  async updateTestPanel(id: string, data: any) {
    const updateData: any = {};
    if (data.panelCode || data.code) updateData.panelCode = data.panelCode || data.code;
    if (data.panelName || data.name) updateData.panelName = data.panelName || data.name;
    if (data.specimenType !== undefined) updateData.specimenType = data.specimenType;
    if (data.department !== undefined) updateData.department = data.department;
    if (data.status) updateData.status = data.status;

    const updated = await this.prisma.testPanel.update({
      where: { id },
      data: updateData,
    });
    return {
      id: updated.id,
      panelCode: updated.panelCode,
      panelName: updated.panelName,
      code: updated.panelCode,
      name: updated.panelName,
      specimenType: updated.specimenType,
      department: updated.department,
      status: updated.status,
    };
  }

  async deleteTestPanel(id: string) {
    const panel = await this.prisma.testPanel.findUnique({ where: { id } });
    if (panel) {
      const linkedResults = await this.prisma.testResult.count({
        where: {
          OR: [
            { testPanel: panel.panelCode },
            { testPanel: panel.panelName },
          ],
        },
      });
      if (linkedResults > 0) {
        throw new BadRequestException(
          `ไม่สามารถลบชุดการตรวจ '${panel.panelName}' ได้ เนื่องจากมีประวัติผลการตรวจในระบบ (${linkedResults} รายการ) กรุณาเปลี่ยนสถานะเป็น Inactive แทน`
        );
      }
    }
    await this.prisma.testPanel.delete({ where: { id } });
    return { success: true };
  }

  // ==========================================
  // 9. VALUE LISTS (Database Persisted with Fallback)
  // ==========================================
  private inMemoryValueLists: any[] = [
    { id: "vl-1", code: "POS", name: "Positive", status: "Active" },
    { id: "vl-2", code: "NEG", name: "Negative", status: "Active" },
    { id: "vl-3", code: "EQV", name: "Equivocal", status: "Active" },
    { id: "vl-4", code: "REAC", name: "Reactive", status: "Active" },
    { id: "vl-5", code: "NONREAC", name: "Non-Reactive", status: "Active" },
    { id: "vl-6", code: "FOUND", name: "Found", status: "Active" },
    { id: "vl-7", code: "NOTFOUND", name: "Not Found", status: "Active" },
    { id: "vl-8", code: "YELLOW", name: "Yellow", status: "Active" },
    { id: "vl-9", code: "AMBER", name: "Amber", status: "Active" },
    { id: "vl-10", code: "BLOODY", name: "Bloody", status: "Active" },
    { id: "vl-11", code: "SOFT", name: "Soft", status: "Active" },
    { id: "vl-12", code: "FORMED", name: "Formed", status: "Active" },
    { id: "vl-13", code: "WATERY", name: "Watery", status: "Active" },
    { id: "vl-14", code: "MUCOUS", name: "Mucous", status: "Active" },
  ];

  async findAllValueLists() {
    try {
      if ((this.prisma as any).valueList) {
        const list = await (this.prisma as any).valueList.findMany({ orderBy: { code: 'asc' } });
        if (list && list.length > 0) return list;
      }
    } catch { }
    return this.inMemoryValueLists;
  }

  async createValueList(data: any) {
    const item = {
      id: `vl-${Date.now()}`,
      code: data.code?.trim() || `VL-${Date.now().toString().slice(-4)}`,
      name: data.name?.trim() || '',
      status: data.status || 'Active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    try {
      if ((this.prisma as any).valueList) {
        const created = await (this.prisma as any).valueList.create({ data: item });
        if (created) return created;
      }
    } catch { }
    this.inMemoryValueLists.unshift(item);
    return item;
  }

  async updateValueList(id: string, data: any) {
    try {
      if ((this.prisma as any).valueList) {
        const updated = await (this.prisma as any).valueList.update({
          where: { id },
          data: {
            code: data.code,
            name: data.name,
            status: data.status,
          },
        });
        if (updated) return updated;
      }
    } catch { }
    this.inMemoryValueLists = this.inMemoryValueLists.map((vl) =>
      vl.id === id ? { ...vl, ...data, updatedAt: new Date().toISOString() } : vl
    );
    return this.inMemoryValueLists.find((vl) => vl.id === id);
  }

  async deleteValueList(id: string) {
    try {
      if ((this.prisma as any).valueList) {
        await (this.prisma as any).valueList.delete({ where: { id } });
        return { success: true };
      }
    } catch { }
    this.inMemoryValueLists = this.inMemoryValueLists.filter((vl) => vl.id !== id);
    return { success: true };
  }

  // ==========================================
  // 10. LAB TESTS & SUB-ITEMS (Database Persisted with Fallback)
  // ==========================================
  private inMemoryTests: any[] = [
    {
      id: "test-1",
      code: "FLU-A",
      name: "Influenza A Ag",
      selectedSites: ["ALL"],
      status: "Active",
      testItems: [
        { id: "item-1-1", code: "FluA-COI", name: "Influenza A COI", valueType: "decimal", unit: "COI", low: "0.00", high: "0.99", criticalLow: null, criticalHigh: "1.00", criticalValue: "" },
        { id: "item-1-2", code: "FluA-Ag", name: "Influenza A Ag", valueType: "list", valueList: ["Negative", "Positive"], unit: "", low: null, high: null, criticalLow: null, criticalHigh: null, criticalValue: "Positive" }
      ]
    },
    {
      id: "test-2",
      code: "STOOL-EXAM",
      name: "Stool Examination",
      selectedSites: ["ALL"],
      status: "Active",
      testItems: [
        { id: "item-2-1", code: "Color", name: "Color", valueType: "list", valueList: ["Yellow", "Amber", "Bloody"], unit: "", criticalValue: "Bloody" },
        { id: "item-2-2", code: "Appearance", name: "Appearance", valueType: "list", valueList: ["Soft", "Formed", "Watery", "Mucous"], unit: "", criticalValue: "" },
        { id: "item-2-3", code: "Parasite", name: "Parasite", valueType: "list", valueList: ["Not Found", "Found"], unit: "", criticalValue: "Found" },
        { id: "item-2-4", code: "Protozoa", name: "Protozoa", valueType: "list", valueList: ["Not Found", "Found"], unit: "", criticalValue: "Found" },
        { id: "item-2-5", code: "FOB", name: "Occult Blood (FOB)", valueType: "list", valueList: ["Negative", "Positive"], unit: "", criticalValue: "Positive" }
      ]
    },
    {
      id: "test-3",
      code: "FBS",
      name: "Fasting Blood Sugar",
      selectedSites: ["ALL"],
      status: "Active",
      testItems: [
        { id: "item-3-1", code: "FBS", name: "Fasting Blood Sugar", valueType: "integer", unit: "mg/dL", low: "70", high: "99", criticalLow: "50", criticalHigh: "400", criticalValue: "" }
      ]
    },
    {
      id: "test-4",
      code: "CHOL",
      name: "Cholesterol Total",
      selectedSites: ["ALL"],
      status: "Active",
      testItems: [
        { id: "item-4-1", code: "CHOL", name: "Cholesterol Total", valueType: "integer", unit: "mg/dL", low: "0", high: "200", criticalLow: null, criticalHigh: "300", criticalValue: "" }
      ]
    },
    {
      id: "test-5",
      code: "TRIG",
      name: "Triglyceride",
      selectedSites: ["ALL"],
      status: "Active",
      testItems: [
        { id: "item-5-1", code: "TRIG", name: "Triglyceride", valueType: "integer", unit: "mg/dL", low: "0", high: "150", criticalLow: null, criticalHigh: "500", criticalValue: "" }
      ]
    },
    {
      id: "test-6",
      code: "HDL",
      name: "High-Density Lipoprotein (HDL)",
      selectedSites: ["ALL"],
      status: "Active",
      testItems: [
        { id: "item-6-1", code: "HDL", name: "HDL-Cholesterol", valueType: "integer", unit: "mg/dL", low: "40", high: "60", criticalLow: "20", criticalHigh: null, criticalValue: "" }
      ]
    },
    {
      id: "test-7",
      code: "LDL",
      name: "Low-Density Lipoprotein (LDL)",
      selectedSites: ["ALL"],
      status: "Active",
      testItems: [
        { id: "item-7-1", code: "LDL", name: "LDL-Cholesterol", valueType: "integer", unit: "mg/dL", low: "0", high: "100", criticalLow: null, criticalHigh: "190", criticalValue: "" }
      ]
    },
    {
      id: "test-8",
      code: "BUN",
      name: "Blood Urea Nitrogen",
      selectedSites: ["ALL"],
      status: "Active",
      testItems: [
        { id: "item-8-1", code: "BUN", name: "Blood Urea Nitrogen", valueType: "decimal", unit: "mg/dL", low: "6.0", high: "20.0", criticalLow: null, criticalHigh: "80.0", criticalValue: "" }
      ]
    },
    {
      id: "test-9",
      code: "CR",
      name: "Creatinine",
      selectedSites: ["ALL"],
      status: "Active",
      testItems: [
        { id: "item-9-1", code: "CR", name: "Creatinine", valueType: "decimal", unit: "mg/dL", low: "0.50", high: "1.20", criticalLow: null, criticalHigh: "5.00", criticalValue: "" }
      ]
    }
  ];

  async findAllTests() {
    try {
      if ((this.prisma as any).labTest) {
        const list = await (this.prisma as any).labTest.findMany({ orderBy: { code: 'asc' } });
        if (list && list.length > 0) return list;
      }
    } catch { }
    return this.inMemoryTests;
  }

  async createTest(data: any) {
    const item = {
      id: `test-${Date.now()}`,
      code: data.code?.trim().toUpperCase() || `TEST-${Date.now().toString().slice(-4)}`,
      name: data.name?.trim() || '',
      selectedSites: data.selectedSites || ["ALL"],
      testItems: data.testItems || [],
      status: data.status || 'Active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    try {
      if ((this.prisma as any).labTest) {
        const created = await (this.prisma as any).labTest.create({ data: item });
        if (created) return created;
      }
    } catch { }
    this.inMemoryTests.unshift(item);
    return item;
  }

  async updateTest(id: string, data: any) {
    try {
      if ((this.prisma as any).labTest) {
        const updated = await (this.prisma as any).labTest.update({
          where: { id },
          data: {
            code: data.code?.trim().toUpperCase(),
            name: data.name?.trim(),
            selectedSites: data.selectedSites,
            testItems: data.testItems,
            status: data.status,
          },
        });
        if (updated) return updated;
      }
    } catch { }
    this.inMemoryTests = this.inMemoryTests.map((t) =>
      t.id === id ? { ...t, ...data, updatedAt: new Date().toISOString() } : t
    );
    return this.inMemoryTests.find((t) => t.id === id);
  }

  async deleteTest(id: string) {
    let test: any = null;
    try {
      if ((this.prisma as any).labTest) {
        test = await (this.prisma as any).labTest.findUnique({ where: { id } });
      }
    } catch { }
    if (!test) {
      test = this.inMemoryTests.find((t) => t.id === id);
    }
    if (test) {
      const linkedResults = await this.prisma.testResult.count({
        where: {
          OR: [
            { testName: test.name },
            { testPanel: test.code },
          ],
        },
      });
      if (linkedResults > 0) {
        throw new BadRequestException(
          `ไม่สามารถลบรายการตรวจ '${test.name}' ได้ เนื่องจากมีประวัติผลการตรวจในระบบ (${linkedResults} รายการ) กรุณาเปลี่ยนสถานะเป็น Inactive แทน`
        );
      }
    }

    try {
      if ((this.prisma as any).labTest) {
        await (this.prisma as any).labTest.delete({ where: { id } });
        return { success: true };
      }
    } catch { }
    this.inMemoryTests = this.inMemoryTests.filter((t) => t.id !== id);
    return { success: true };
  }

  // ==========================================
  // 11. TEST PROFILES (Database Persisted with Fallback)
  // ==========================================
  private inMemoryProfiles: any[] = [
    { id: "profile-1", code: "LIPID", name: "Lipid Profile", tests: ["CHOL", "HDL", "LDL", "TRIG"], selectedSites: ["ALL"], status: "Active" },
    { id: "profile-2", code: "RFT-PROFILE", name: "Renal Function Profile", tests: ["BUN", "CR"], selectedSites: ["ALL"], status: "Active" },
    { id: "profile-3", code: "DM-PROFILE", name: "Diabetic Profile", tests: ["FBS"], selectedSites: ["ALL"], status: "Active" },
    { id: "profile-4", code: "FLU-PROFILE", name: "Influenza Rapid Ag Profile", tests: ["FLU-A"], selectedSites: ["ALL"], status: "Active" },
    { id: "profile-5", code: "STOOL-PROFILE", name: "Stool Examination Profile", tests: ["STOOL-EXAM"], selectedSites: ["ALL"], status: "Active" },
  ];

  async findAllTestProfiles() {
    try {
      if ((this.prisma as any).testProfile) {
        const list = await (this.prisma as any).testProfile.findMany({ orderBy: { code: 'asc' } });
        if (list && list.length > 0) return list;
      }
    } catch { }
    return this.inMemoryProfiles;
  }

  async createTestProfile(data: any) {
    const item = {
      id: `profile-${Date.now()}`,
      code: data.code?.trim().toUpperCase() || `PROF-${Date.now().toString().slice(-4)}`,
      name: data.name?.trim() || '',
      tests: data.tests || [],
      selectedSites: data.selectedSites || ["ALL"],
      status: data.status || 'Active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    try {
      if ((this.prisma as any).testProfile) {
        const created = await (this.prisma as any).testProfile.create({ data: item });
        if (created) return created;
      }
    } catch { }
    this.inMemoryProfiles.unshift(item);
    return item;
  }

  async updateTestProfile(id: string, data: any) {
    try {
      if ((this.prisma as any).testProfile) {
        const updated = await (this.prisma as any).testProfile.update({
          where: { id },
          data: {
            code: data.code?.trim().toUpperCase(),
            name: data.name?.trim(),
            tests: data.tests,
            selectedSites: data.selectedSites,
            status: data.status,
          },
        });
        if (updated) return updated;
      }
    } catch { }
    this.inMemoryProfiles = this.inMemoryProfiles.map((p) =>
      p.id === id ? { ...p, ...data, updatedAt: new Date().toISOString() } : p
    );
    return this.inMemoryProfiles.find((p) => p.id === id);
  }

  async deleteTestProfile(id: string) {
    try {
      if ((this.prisma as any).testProfile) {
        await (this.prisma as any).testProfile.delete({ where: { id } });
        return { success: true };
      }
    } catch { }
    this.inMemoryProfiles = this.inMemoryProfiles.filter((p) => p.id !== id);
    return { success: true };
  }

  // ==========================================
  // 12. ANALYZERS (Database Persisted with Fallback)
  // ==========================================
  private inMemoryAnalyzers: any[] = [
    {
      id: "analyzer-1",
      code: "COBAS-6000",
      name: "Roche Cobas 6000",
      department: "Clinical Chemistry",
      protocol: "ASTM 1394",
      ipAddress: "192.168.10.51",
      port: "5000",
      status: "Active",
      orderCodes: [
        {
          id: "ord-1-1",
          orderCode: "GLU_ORD",
          orderName: "Glucose Order",
          resultCodes: [
            { id: "res-1-1-1", resultCode: "GLU", resultName: "Glucose", unit: "mg/dL" },
          ],
        },
        {
          id: "ord-1-2",
          orderCode: "LIPID_ORD",
          orderName: "Lipid Panel Order",
          resultCodes: [
            { id: "res-1-2-1", resultCode: "CHOL", resultName: "Cholesterol Total", unit: "mg/dL" },
            { id: "res-1-2-2", resultCode: "TRIG", resultName: "Triglycerides", unit: "mg/dL" },
            { id: "res-1-2-3", resultCode: "HDL", resultName: "HDL Cholesterol", unit: "mg/dL" },
            { id: "res-1-2-4", resultCode: "LDL", resultName: "LDL Cholesterol", unit: "mg/dL" },
          ],
        },
        {
          id: "ord-1-3",
          orderCode: "RFT_ORD",
          orderName: "Renal Function Panel",
          resultCodes: [
            { id: "res-1-3-1", resultCode: "BUN", resultName: "Blood Urea Nitrogen", unit: "mg/dL" },
            { id: "res-1-3-2", resultCode: "CR", resultName: "Creatinine", unit: "mg/dL" },
            { id: "res-1-3-3", resultCode: "UA", resultName: "Uric Acid", unit: "mg/dL" },
          ],
        },
      ],
    },
    {
      id: "analyzer-2",
      code: "SYSMEX-XN",
      name: "Sysmex XN-1000",
      department: "Hematology",
      protocol: "HL7 v2.5",
      ipAddress: "192.168.10.52",
      port: "5100",
      status: "Active",
      orderCodes: [
        {
          id: "ord-2-1",
          orderCode: "CBC_ORD",
          orderName: "Complete Blood Count Order",
          resultCodes: [
            { id: "res-2-1-1", resultCode: "WBC", resultName: "White Blood Cell", unit: "10^3/uL" },
            { id: "res-2-1-2", resultCode: "RBC", resultName: "Red Blood Cell", unit: "10^6/uL" },
            { id: "res-2-1-3", resultCode: "HGB", resultName: "Hemoglobin", unit: "g/dL" },
            { id: "res-2-1-4", resultCode: "HCT", resultName: "Hematocrit", unit: "%" },
            { id: "res-2-1-5", resultCode: "MCV", resultName: "Mean Corpuscular Volume", unit: "fL" },
            { id: "res-2-1-6", resultCode: "MCH", resultName: "Mean Corpuscular Hemoglobin", unit: "pg" },
            { id: "res-2-1-7", resultCode: "MCHC", resultName: "Mean Corpuscular Hgb Conc.", unit: "g/dL" },
            { id: "res-2-1-8", resultCode: "PLT", resultName: "Platelet Count", unit: "10^3/uL" },
          ],
        },
      ],
    },
    {
      id: "analyzer-3",
      code: "ARCHITECT-C4000",
      name: "Abbott Architect c4000",
      department: "Clinical Chemistry",
      protocol: "ASTM 1394",
      ipAddress: "192.168.10.53",
      port: "5050",
      status: "Active",
      orderCodes: [
        {
          id: "ord-3-1",
          orderCode: "LFT_ORD",
          orderName: "Liver Function Panel",
          resultCodes: [
            { id: "res-3-1-1", resultCode: "AST", resultName: "Aspartate Aminotransferase", unit: "U/L" },
            { id: "res-3-1-2", resultCode: "ALT", resultName: "Alanine Aminotransferase", unit: "U/L" },
            { id: "res-3-1-3", resultCode: "ALP", resultName: "Alkaline Phosphatase", unit: "U/L" },
            { id: "res-3-1-4", resultCode: "TBIL", resultName: "Total Bilirubin", unit: "mg/dL" },
            { id: "res-3-1-5", resultCode: "DBIL", resultName: "Direct Bilirubin", unit: "mg/dL" },
            { id: "res-3-1-6", resultCode: "ALB", resultName: "Albumin", unit: "g/dL" },
          ],
        },
      ],
    },
  ];

  async findAllAnalyzers() {
    try {
      if ((this.prisma as any).analyzer) {
        const list = await (this.prisma as any).analyzer.findMany({ orderBy: { code: 'asc' } });
        if (list && list.length > 0) return list;
      }
    } catch { }
    return this.inMemoryAnalyzers;
  }

  async createAnalyzer(data: any) {
    const item = {
      id: `analyzer-${Date.now()}`,
      code: data.code?.trim().toUpperCase() || `ANALYZER-${Date.now().toString().slice(-4)}`,
      name: data.name?.trim() || '',
      department: data.department || '',
      protocol: data.protocol || 'ASTM 1394',
      ipAddress: data.ipAddress || '',
      port: data.port || '',
      status: data.status || 'Active',
      orderCodes: data.orderCodes || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    try {
      if ((this.prisma as any).analyzer) {
        const created = await (this.prisma as any).analyzer.create({ data: item });
        if (created) return created;
      }
    } catch { }
    this.inMemoryAnalyzers.unshift(item);
    return item;
  }

  async updateAnalyzer(id: string, data: any) {
    try {
      if ((this.prisma as any).analyzer) {
        const updated = await (this.prisma as any).analyzer.update({
          where: { id },
          data: {
            code: data.code?.trim().toUpperCase(),
            name: data.name?.trim(),
            department: data.department,
            protocol: data.protocol,
            ipAddress: data.ipAddress,
            port: data.port,
            status: data.status,
            orderCodes: data.orderCodes,
          },
        });
        if (updated) return updated;
      }
    } catch { }
    this.inMemoryAnalyzers = this.inMemoryAnalyzers.map((a) =>
      a.id === id ? { ...a, ...data, updatedAt: new Date().toISOString() } : a
    );
    return this.inMemoryAnalyzers.find((a) => a.id === id);
  }

  async deleteAnalyzer(id: string) {
    let analyzer: any = null;
    try {
      if ((this.prisma as any).analyzer) {
        analyzer = await (this.prisma as any).analyzer.findUnique({ where: { id } });
      }
    } catch { }
    if (!analyzer) {
      analyzer = this.inMemoryAnalyzers.find((a) => a.id === id);
    }
    if (analyzer) {
      const linkedResults = await this.prisma.testResult.count({
        where: {
          OR: [
            { instrumentName: analyzer.name },
            { instrumentName: analyzer.code },
          ],
        },
      });
      if (linkedResults > 0) {
        throw new BadRequestException(
          `ไม่สามารถลบเครื่องวิเคราะห์ '${analyzer.name}' ได้ เนื่องจากมีผลตรวจที่เชื่อมโยงกับเครื่องตรวจนี้ (${linkedResults} รายการ) กรุณาเปลี่ยนสถานะเป็น Inactive แทน`
        );
      }
    }

    try {
      if ((this.prisma as any).analyzer) {
        await (this.prisma as any).analyzer.delete({ where: { id } });
        return { success: true };
      }
    } catch { }
    this.inMemoryAnalyzers = this.inMemoryAnalyzers.filter((a) => a.id !== id);
    return { success: true };
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
