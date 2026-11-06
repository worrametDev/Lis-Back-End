import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';
import type { ParentSite, Prisma } from '@prisma/client';
import {
  AnalyzerDto,
  EthnicityDto,
  LabTestDto,
  TestPanelDto,
  TestProfileDto,
  TitleDto,
  ValueListDto,
} from './dto/catalog.dto';
import {
  CreateClientSiteDto,
  CreateDepartmentDto,
  CreateParentSiteDto,
  CreateSampleConditionDto,
  CreateWardDto,
  SiteInfoDto,
  UpdateClientSiteDto,
  UpdateDepartmentDto,
  UpdateParentSiteDto,
  UpdateSampleConditionDto,
  UpdateWardDto,
} from './dto/site.dto';

@Injectable()
export class MasterDataService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

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
    } catch (err: unknown) {
      return {
        status: 'DISCONNECTED',
        database: 'PostgreSQL',
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      };
    }
  }

  // ==========================================
  // 1. PARENT SITES
  // ==========================================
  async findAllParentSites() {
    const cached = await this.cacheManager.get<Array<Record<string, unknown>>>(
      'master_parent_sites',
    );
    if (cached) return cached;

    const sites = await this.prisma.parentSite.findMany({
      orderBy: { createdAt: 'desc' },
      include: { clientSites: true },
    });

    await this.cacheManager.set('master_parent_sites', sites, 600000); // 10 minutes
    return sites;
  }

  async getSiteInfo() {
    const cached =
      await this.cacheManager.get<Record<string, unknown>>('master_site_info');
    if (
      cached &&
      typeof cached.siteName === 'string' &&
      !cached.siteName.includes('?')
    )
      return cached;

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

    const siteName = cleanStr(primarySite?.siteName, envHospitalName || '');
    const siteCode = primarySite?.siteCode || '';
    const province = cleanStr(primarySite?.province, '');
    const district = cleanStr(primarySite?.district, '');
    const subdistrict = cleanStr(primarySite?.subdistrict, '');
    const address = cleanStr(primarySite?.address, '');

    let hospitalNameEn = envHospitalNameEn || '';
    if (!hospitalNameEn && siteName.includes('(') && siteName.includes(')')) {
      const match = siteName.match(/\(([^)]+)\)/);
      if (match) hospitalNameEn = match[1];
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
      zipcode: primarySite?.zipcode || '',
      lnPattern: primarySite?.lnPattern || 'yymmdd0000',
      siteType: primarySite?.siteType || 'Parent Site',
    };

    await this.cacheManager.set('master_site_info', result, 600000); // 10 minutes
    return result;
  }

  async updateSiteInfo(data: SiteInfoDto) {
    let primarySite = await this.prisma.parentSite.findFirst({
      where: { siteStatus: 'Active' },
      orderBy: { createdAt: 'asc' },
    });

    const cleanInput = (
      val: string | undefined,
      current: string | null | undefined,
      fallback: string,
    ) => {
      if (val === undefined) return current || fallback;
      if (val.includes('?'))
        return current && !current.includes('?') ? current : fallback;
      return val;
    };

    const siteName = cleanInput(
      data.siteName,
      primarySite?.siteName,
      process.env.HOSPITAL_NAME || '',
    );
    const hospitalNameEn =
      data.hospitalNameEn || process.env.HOSPITAL_NAME_EN || '';
    if (!siteName || (!primarySite && !data.siteCode))
      throw new BadRequestException('กรุณาระบุรหัสและชื่อหน่วยงาน');

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
          address: cleanInput(data.address, primarySite.address, ''),
          subdistrict: cleanInput(
            data.subdistrict,
            primarySite.subdistrict,
            '',
          ),
          district: cleanInput(data.district, primarySite.district, ''),
          province: cleanInput(data.province, primarySite.province, ''),
          zipcode:
            data.zipcode !== undefined ? data.zipcode : primarySite.zipcode,
          lnPattern:
            data.lnPattern !== undefined
              ? data.lnPattern
              : primarySite.lnPattern,
        },
      });
    } else {
      primarySite = await this.prisma.parentSite.create({
        data: {
          siteCode: data.siteCode!,
          siteName: siteName,
          siteType: 'Parent Site',
          siteStatus: 'Active',
          address: data.address || '',
          subdistrict: data.subdistrict || '',
          district: data.district || '',
          province: data.province || '',
          zipcode: data.zipcode || '',
          lnPattern: data.lnPattern || 'yymmdd0000',
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

  async createParentSite(data: CreateParentSiteDto) {
    if (!data.siteCode || !data.siteName) {
      throw new BadRequestException('กรุณาระบุ SITE CODE และ SITE NAME');
    }
    const existing = await this.prisma.parentSite.findUnique({
      where: { siteCode: data.siteCode },
    });
    if (existing) {
      throw new BadRequestException(
        `Parent Site Code "${data.siteCode}" มีอยู่แล้วในระบบ`,
      );
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

  async updateParentSite(id: string, data: UpdateParentSiteDto) {
    const allowed = [
      'siteCode',
      'siteName',
      'siteType',
      'siteStatus',
      'lnPattern',
      'address',
      'subdistrict',
      'district',
      'province',
      'zipcode',
      'hospitalFile',
      'isoFile',
    ];
    const updateData: Prisma.ParentSiteUncheckedUpdateInput = {};
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
        `ไม่สามารถลบ "${parent.siteName}" ได้ เนื่องจากมีข้อมูลเชื่อมโยงอยู่ในระบบ: ${reasons.join(', ')} กรุณาเปลี่ยนสถานะเป็น Inactive แทน หรือลบข้อมูลที่เกี่ยวข้องออกก่อน`,
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
    const cached =
      await this.cacheManager.get<Array<Record<string, unknown>>>(cacheKey);
    if (cached) return cached;

    const where: Prisma.ClientSiteWhereInput = {};
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
      parentSiteName: s.parentSite?.siteName || '',
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

  async createClientSite(data: CreateClientSiteDto) {
    if (!data.siteCode || !data.siteName) {
      throw new BadRequestException('กรุณาระบุ SITE CODE และ SITE NAME');
    }

    const existing = await this.prisma.clientSite.findUnique({
      where: { siteCode: data.siteCode },
    });
    if (existing) {
      throw new BadRequestException(
        `Client Site Code "${data.siteCode}" มีอยู่แล้วในระบบ`,
      );
    }

    // Resolve parent site
    let parentSiteId = data.parentSiteId;
    if (!parentSiteId || parentSiteId === 'default') {
      let parent: ParentSite | null = null;
      if (data.parentSiteCode) {
        parent = await this.prisma.parentSite.findFirst({
          where: { siteCode: data.parentSiteCode },
        });
      }
      if (!parent && data.parentSiteName) {
        parent = await this.prisma.parentSite.findFirst({
          where: { siteName: data.parentSiteName },
        });
      }
      if (!parent) {
        parent = await this.prisma.parentSite.findFirst({
          where: { siteStatus: 'Active' },
        });
      }
      if (!parent) {
        parent = await this.prisma.parentSite.findFirst();
      }
      if (!parent)
        throw new BadRequestException('ไม่พบข้อมูล Parent Site ในระบบ');
      parentSiteId = parent.id;
    }

    // ตรวจสอบสถานะของแม่ข่าย: หากแม่ข่ายถูกระงับการใช้งาน ห้ามสร้างลูกข่ายในสถานะ Active
    const parentSite = await this.prisma.parentSite.findUnique({
      where: { id: parentSiteId },
    });
    if (
      data.siteStatus !== 'Inactive' &&
      (!parentSite || parentSite.siteStatus !== 'Active')
    ) {
      throw new BadRequestException(
        `ไม่สามารถสร้างลูกข่ายในสถานะ Active ได้ เนื่องจากโรงพยาบาลแม่ข่าย "${parentSite?.siteName || 'ไม่ระบุ'}" อยู่ในสถานะระงับการใช้งาน (Inactive) กรุณาเลือกแม่ข่ายที่เปิดใช้งานอยู่`,
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

  async updateClientSite(id: string, data: UpdateClientSiteDto) {
    const currentClient = await this.prisma.clientSite.findUnique({
      where: { id },
      include: { parentSite: true },
    });
    if (!currentClient)
      throw new NotFoundException('ไม่พบข้อมูล Client Site ในระบบ');

    const allowed = [
      'siteCode',
      'siteName',
      'siteType',
      'siteStatus',
      'lnPattern',
      'parentSiteId',
      'address',
      'subdistrict',
      'district',
      'province',
      'zipcode',
      'hospitalFile',
      'isoFile',
    ];
    const updateData: Prisma.ClientSiteUncheckedUpdateInput = {};
    for (const key of allowed) {
      if (data[key] !== undefined) updateData[key] = data[key];
    }
    if (data.status !== undefined && updateData.siteStatus === undefined) {
      updateData.siteStatus = data.status;
    }

    // 1. จัดการการย้ายสังกัด (Relocation): หากมีการส่ง parentSiteId หรือ parentSiteName/Code ใหม่
    let targetParentId =
      typeof updateData.parentSiteId === 'string'
        ? updateData.parentSiteId
        : undefined;
    if (!targetParentId && (data.parentSiteName || data.parentSiteCode)) {
      const foundParent = await this.prisma.parentSite.findFirst({
        where: {
          OR: [
            ...(data.parentSiteCode ? [{ siteCode: data.parentSiteCode }] : []),
            ...(data.parentSiteName ? [{ siteName: data.parentSiteName }] : []),
          ],
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

    const isTargetActive =
      updateData.siteStatus === 'Active' ||
      (updateData.siteStatus === undefined &&
        currentClient.siteStatus === 'Active');
    if (
      updateData.siteStatus === 'Active' ||
      (targetParentId &&
        targetParentId !== currentClient.parentSiteId &&
        isTargetActive)
    ) {
      if (!effectiveParent || effectiveParent.siteStatus !== 'Active') {
        throw new BadRequestException(
          `ไม่สามารถเปิดใช้งานลูกข่าย "${currentClient.siteName}" ได้ เนื่องจากโรงพยาบาลแม่ข่าย "${effectiveParent?.siteName || 'ไม่ระบุ'}" อยู่ในสถานะระงับการใช้งาน (Inactive) กรุณาเปิดใช้งานแม่ข่ายก่อน หรือย้ายสังกัดไปยังแม่ข่ายที่เปิดใช้งาน`,
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
      parentSiteName: updated.parentSite?.siteName || '',
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
        `ไม่สามารถลบ "${client.siteName}" ได้ เนื่องจากมีข้อมูลเชื่อมโยงอยู่ในระบบ: ${reasons.join(', ')} กรุณาเปลี่ยนสถานะเป็น Inactive แทน`,
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
    const cached =
      await this.cacheManager.get<Array<Record<string, unknown>>>(
        'master_wards',
      );
    if (cached) return cached;

    const wards = await this.prisma.ward.findMany({
      include: { parentSite: true },
      orderBy: { createdAt: 'desc' },
    });
    const mapped = wards.map((w) => ({
      id: w.id,
      wardCode: w.wardCode,
      wardName: w.wardName,
      hospitalName: w.parentSite?.siteName || '',
      wardStatus: w.wardStatus || 'Active',
      parentSiteId: w.parentSiteId,
      selectedSites: w.selectedSites,
      hospitalFile: w.hospitalFile,
    }));

    await this.cacheManager.set('master_wards', mapped, 600000);
    return mapped;
  }

  async createWard(data: CreateWardDto) {
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
        selectedSites:
          data.selectedSites || (data.siteCode ? [data.siteCode] : ['ALL']),
        hospitalFile: data.hospitalFile,
      },
      include: { parentSite: true },
    });

    await this.cacheManager.del('master_wards');
    return created;
  }

  async updateWard(id: string, data: UpdateWardDto) {
    const allowed = [
      'wardCode',
      'wardName',
      'wardStatus',
      'hospitalFile',
      'selectedSites',
      'parentSiteId',
    ];
    const updateData: Prisma.WardUncheckedUpdateInput = {};
    for (const key of allowed) {
      if (data[key] !== undefined) updateData[key] = data[key];
    }
    if (data.status !== undefined && updateData.wardStatus === undefined) {
      updateData.wardStatus = data.status;
    }
    const updated = await this.prisma.ward.update({
      where: { id },
      data: updateData,
    });
    await this.cacheManager.del('master_wards');
    return updated;
  }

  async deleteWard(id: string) {
    const ward = await this.prisma.ward.findUnique({ where: { id } });
    if (!ward) throw new NotFoundException('ไม่พบข้อมูล Ward ในระบบ');

    const orderCount = await this.prisma.order.count({ where: { wardId: id } });
    if (orderCount > 0) {
      throw new BadRequestException(
        `ไม่สามารถลบหอผู้ป่วย "${ward.wardName}" ได้ เนื่องจากมีใบสั่งตรวจ (${orderCount} รายการ) ผูกอยู่ กรุณาเปลี่ยนสถานะเป็น Inactive แทน`,
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
    const cached =
      await this.cacheManager.get<Array<Record<string, unknown>>>(
        'master_departments',
      );
    if (cached) return cached;

    const depts = await this.prisma.department.findMany({
      orderBy: { departmentCode: 'asc' },
    });

    await this.cacheManager.set('master_departments', depts, 600000);
    return depts;
  }

  async createDepartment(data: CreateDepartmentDto) {
    if (!data.departmentCode || !data.departmentName) {
      throw new BadRequestException(
        'กรุณาระบุ DEPARTMENT CODE และ DEPARTMENT NAME',
      );
    }
    const existing = await this.prisma.department.findUnique({
      where: { departmentCode: data.departmentCode },
    });
    if (existing) {
      throw new BadRequestException(
        `Department Code "${data.departmentCode}" มีอยู่แล้ว`,
      );
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

  async updateDepartment(id: string, data: UpdateDepartmentDto) {
    const allowed = [
      'departmentCode',
      'departmentName',
      'deptStatus',
      'hospitalFile',
    ];
    const updateData: Prisma.DepartmentUncheckedUpdateInput = {};
    for (const key of allowed) {
      if (data[key] !== undefined) updateData[key] = data[key];
    }
    if (data.status !== undefined && updateData.deptStatus === undefined) {
      updateData.deptStatus = data.status;
    }
    const updated = await this.prisma.department.update({
      where: { id },
      data: updateData,
    });
    await this.cacheManager.del('master_departments');
    return updated;
  }

  async deleteDepartment(id: string) {
    const dept = await this.prisma.department.findUnique({ where: { id } });
    if (!dept) throw new NotFoundException('ไม่พบข้อมูลแผนกในระบบ');

    const resultCount = await this.prisma.testResult.count({
      where: { departmentId: id },
    });
    if (resultCount > 0) {
      throw new BadRequestException(
        `ไม่สามารถลบแผนก "${dept.departmentName}" ได้ เนื่องจากมีผลตรวจวิเคราะห์ (${resultCount} รายการ) ผูกอยู่ กรุณาเปลี่ยนสถานะเป็น Inactive แทน`,
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
    const cached = await this.cacheManager.get<Array<Record<string, unknown>>>(
      'master_sample_conditions',
    );
    if (cached) return cached;

    const conditions = await this.prisma.sampleCondition.findMany({
      orderBy: { createdAt: 'asc' },
    });

    await this.cacheManager.set('master_sample_conditions', conditions, 600000);
    return conditions;
  }

  async createSampleCondition(data: CreateSampleConditionDto) {
    if (!data.conditionCode || !data.conditionName) {
      throw new BadRequestException(
        'กรุณาระบุ CONDITION CODE และ CONDITION NAME',
      );
    }
    const existing = await this.prisma.sampleCondition.findUnique({
      where: { conditionCode: data.conditionCode },
    });
    if (existing) {
      throw new BadRequestException(
        `Condition Code "${data.conditionCode}" มีอยู่แล้ว`,
      );
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

  async updateSampleCondition(id: string, data: UpdateSampleConditionDto) {
    const allowed = [
      'conditionCode',
      'conditionName',
      'sampleStatus',
      'isDefault',
      'hospitalFile',
    ];
    const updateData: Prisma.SampleConditionUncheckedUpdateInput = {};
    for (const key of allowed) {
      if (data[key] !== undefined) updateData[key] = data[key];
    }
    if (data.status !== undefined && updateData.sampleStatus === undefined) {
      updateData.sampleStatus = data.status;
    }
    const updated = await this.prisma.sampleCondition.update({
      where: { id },
      data: updateData,
    });
    await this.cacheManager.del('master_sample_conditions');
    return updated;
  }

  async deleteSampleCondition(id: string) {
    const cond = await this.prisma.sampleCondition.findUnique({
      where: { id },
    });
    if (!cond) throw new NotFoundException('ไม่พบข้อมูลสภาพสิ่งส่งตรวจในระบบ');

    const sampleCount = await this.prisma.sample.count({
      where: { sampleConditionId: id },
    });
    if (sampleCount > 0) {
      throw new BadRequestException(
        `ไม่สามารถลบ "${cond.conditionName}" ได้ เนื่องจากมีสิ่งส่งตรวจ (${sampleCount} รายการ) บันทึกสภาพนี้ไว้ กรุณาเปลี่ยนสถานะเป็น Inactive แทน`,
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
    const list = await this.prisma.title.findMany({
      orderBy: { titleCode: 'asc' },
    });
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

  async createTitle(data: TitleDto) {
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

  async updateTitle(id: string, data: TitleDto) {
    const updateData: Prisma.TitleUpdateInput = {};
    if (data.titleCode) updateData.titleCode = data.titleCode;
    if (data.titleNameTh || data.titleName || data.name) {
      updateData.titleNameTh = data.titleNameTh || data.titleName || data.name;
    }
    if (data.titleNameEn !== undefined)
      updateData.titleNameEn = data.titleNameEn;
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
    const list = await this.prisma.ethnicity.findMany({
      orderBy: { ethnicityCode: 'asc' },
    });
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

  async createEthnicity(data: EthnicityDto) {
    const ethnicityNameTh =
      data.ethnicityNameTh || data.ethnicityName || data.name || '';
    const ethnicityCode =
      data.ethnicityCode || `E-${Date.now().toString().slice(-4)}`;
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

  async updateEthnicity(id: string, data: EthnicityDto) {
    const updateData: Prisma.EthnicityUpdateInput = {};
    if (data.ethnicityCode) updateData.ethnicityCode = data.ethnicityCode;
    if (data.ethnicityNameTh || data.ethnicityName || data.name) {
      updateData.ethnicityNameTh =
        data.ethnicityNameTh || data.ethnicityName || data.name;
    }
    if (data.ethnicityNameEn !== undefined)
      updateData.ethnicityNameEn = data.ethnicityNameEn;
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
    const list = await this.prisma.testPanel.findMany({
      orderBy: { panelCode: 'asc' },
    });
    return list.map((p) => ({
      id: p.id,
      panelCode: p.panelCode,
      panelName: p.panelName,
      code: p.panelCode,
      name: p.panelName,
      specimenType: p.specimenType,
      department: p.department,
      testItems: Array.isArray(p.testItems) ? p.testItems : [],
      selectedSites: Array.isArray(p.selectedSites) ? p.selectedSites : ['ALL'],
      status: p.status,
    }));
  }

  async createTestPanel(data: TestPanelDto) {
    const panelCode =
      data.panelCode || data.code || `P-${Date.now().toString().slice(-4)}`;
    const panelName = data.panelName || data.name || '';
    const created = await this.prisma.testPanel.create({
      data: {
        panelCode,
        panelName,
        specimenType: data.specimenType,
        department: data.department,
        testItems: Array.isArray(data.testItems) ? data.testItems : [],
        selectedSites: Array.isArray(data.selectedSites)
          ? data.selectedSites
          : ['ALL'],
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
      testItems: created.testItems || [],
      selectedSites: created.selectedSites || ['ALL'],
      status: created.status,
    };
  }

  async updateTestPanel(id: string, data: TestPanelDto) {
    const updateData: Prisma.TestPanelUpdateInput = {};
    if (data.panelCode || data.code)
      updateData.panelCode = data.panelCode || data.code;
    if (data.panelName || data.name)
      updateData.panelName = data.panelName || data.name;
    if (data.specimenType !== undefined)
      updateData.specimenType = data.specimenType;
    if (data.department !== undefined) updateData.department = data.department;
    if (data.testItems !== undefined)
      updateData.testItems = Array.isArray(data.testItems)
        ? data.testItems
        : [];
    if (data.selectedSites !== undefined)
      updateData.selectedSites = Array.isArray(data.selectedSites)
        ? data.selectedSites
        : ['ALL'];
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
      testItems: updated.testItems || [],
      selectedSites: updated.selectedSites || ['ALL'],
      status: updated.status,
    };
  }

  async deleteTestPanel(id: string) {
    const panel = await this.prisma.testPanel.findUnique({ where: { id } });
    if (panel) {
      const linkedResults = await this.prisma.testResult.count({
        where: {
          OR: [{ testPanel: panel.panelCode }, { testPanel: panel.panelName }],
        },
      });
      if (linkedResults > 0) {
        throw new BadRequestException(
          `ไม่สามารถลบชุดการตรวจ '${panel.panelName}' ได้ เนื่องจากมีประวัติผลการตรวจในระบบ (${linkedResults} รายการ) กรุณาเปลี่ยนสถานะเป็น Inactive แทน`,
        );
      }
    }
    await this.prisma.testPanel.delete({ where: { id } });
    return { success: true };
  }

  // ==========================================
  // 9. VALUE LISTS (Database Persisted)
  // ==========================================
  async findAllValueLists() {
    return this.prisma.valueList.findMany({ orderBy: { code: 'asc' } });
  }

  async createValueList(data: ValueListDto) {
    return this.prisma.valueList.create({
      data: {
        code: String(data.code || '').trim(),
        name: String(data.name || '').trim(),
        status: data.status || 'Active',
      },
    });
  }

  async updateValueList(id: string, data: ValueListDto) {
    return this.prisma.valueList.update({
      where: { id },
      data: {
        code: data.code,
        name: data.name,
        status: data.status,
      },
    });
  }

  async deleteValueList(id: string) {
    await this.prisma.valueList.delete({ where: { id } });
    return { success: true };
  }

  // ==========================================
  // 10. LAB TESTS & SUB-ITEMS (Database Persisted)
  // ==========================================
  async findAllTests() {
    try {
      if (this.prisma.labTest) {
        return await this.prisma.labTest.findMany({
          orderBy: { code: 'asc' },
        });
      }
    } catch {}
    throw new BadRequestException('ไม่สามารถโหลด Test จากฐานข้อมูลได้');
  }

  async createTest(data: LabTestDto) {
    const item = {
      id: `test-${Date.now()}`,
      code: data.code?.trim() || `TEST-${Date.now().toString().slice(-4)}`,
      name: data.name?.trim() || '',
      selectedSites: data.selectedSites || ['ALL'],
      testItems: data.testItems || [],
      status: data.status || 'Active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    try {
      if (this.prisma.labTest) {
        const created = await this.prisma.labTest.create({
          data: item,
        });
        if (created) return created;
      }
    } catch {}
    throw new BadRequestException('ไม่สามารถบันทึก Test ลงฐานข้อมูลได้');
  }

  async updateTest(id: string, data: LabTestDto) {
    try {
      if (this.prisma.labTest) {
        const updated = await this.prisma.labTest.update({
          where: { id },
          data: {
            code: data.code?.trim(),
            name: data.name?.trim(),
            selectedSites: data.selectedSites,
            testItems: data.testItems,
            status: data.status,
          },
        });
        if (updated) return updated;
      }
    } catch {}
    throw new BadRequestException('ไม่สามารถแก้ไข Test ในฐานข้อมูลได้');
  }

  async deleteTest(id: string) {
    let test: Awaited<ReturnType<typeof this.prisma.labTest.findUnique>> = null;
    try {
      if (this.prisma.labTest) {
        test = await this.prisma.labTest.findUnique({ where: { id } });
      }
    } catch {}
    if (test) {
      const linkedResults = await this.prisma.testResult.count({
        where: {
          OR: [{ testName: test.name }, { testPanel: test.code }],
        },
      });
      if (linkedResults > 0) {
        throw new BadRequestException(
          `ไม่สามารถลบรายการตรวจ '${test.name}' ได้ เนื่องจากมีประวัติผลการตรวจในระบบ (${linkedResults} รายการ) กรุณาเปลี่ยนสถานะเป็น Inactive แทน`,
        );
      }
    }

    try {
      if (this.prisma.labTest) {
        await this.prisma.labTest.delete({ where: { id } });
        return { success: true };
      }
    } catch {}
    throw new BadRequestException('ไม่สามารถลบ Test จากฐานข้อมูลได้');
  }

  // ==========================================
  // 11. TEST PROFILES (Database Persisted)
  // ==========================================
  async findAllTestProfiles() {
    try {
      if (this.prisma.testProfile) {
        return await this.prisma.testProfile.findMany({
          orderBy: { code: 'asc' },
        });
      }
    } catch {}
    throw new BadRequestException('ไม่สามารถโหลด Test Profile จากฐานข้อมูลได้');
  }

  async createTestProfile(data: TestProfileDto) {
    const item = {
      id: `profile-${Date.now()}`,
      code:
        data.code?.trim().toUpperCase() ||
        `PROF-${Date.now().toString().slice(-4)}`,
      name: data.name?.trim() || '',
      tests: data.tests || [],
      selectedSites: data.selectedSites || ['ALL'],
      status: data.status || 'Active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    try {
      if (this.prisma.testProfile) {
        const created = await this.prisma.testProfile.create({
          data: item,
        });
        if (created) return created;
      }
    } catch {}
    throw new BadRequestException(
      'ไม่สามารถบันทึก Test Profile ลงฐานข้อมูลได้',
    );
  }

  async updateTestProfile(id: string, data: TestProfileDto) {
    try {
      if (this.prisma.testProfile) {
        const updated = await this.prisma.testProfile.update({
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
    } catch {}
    throw new BadRequestException('ไม่สามารถแก้ไข Test Profile ในฐานข้อมูลได้');
  }

  async deleteTestProfile(id: string) {
    try {
      if (this.prisma.testProfile) {
        await this.prisma.testProfile.delete({ where: { id } });
        return { success: true };
      }
    } catch {}
    throw new BadRequestException('ไม่สามารถลบ Test Profile จากฐานข้อมูลได้');
  }

  // ==========================================
  // 12. ANALYZERS (Database Persisted)
  // ==========================================
  async findAllAnalyzers() {
    try {
      if (this.prisma.analyzer) {
        return await this.prisma.analyzer.findMany({
          orderBy: { code: 'asc' },
        });
      }
    } catch {}
    throw new BadRequestException('ไม่สามารถโหลด Analyzer จากฐานข้อมูลได้');
  }

  async createAnalyzer(data: AnalyzerDto) {
    const item = {
      id: `analyzer-${Date.now()}`,
      code:
        data.code?.trim().toUpperCase() ||
        `ANALYZER-${Date.now().toString().slice(-4)}`,
      name: data.name?.trim() || '',
      department: data.department || '',
      protocol: data.protocol || 'ASTM 1394',
      ipAddress: data.ipAddress || '',
      port: data.port === undefined ? '' : String(data.port),
      status: data.status || 'Active',
      orderCodes: data.orderCodes || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    try {
      if (this.prisma.analyzer) {
        const created = await this.prisma.analyzer.create({
          data: item,
        });
        if (created) return created;
      }
    } catch {}
    throw new BadRequestException('ไม่สามารถบันทึก Analyzer ลงฐานข้อมูลได้');
  }

  async updateAnalyzer(id: string, data: AnalyzerDto) {
    try {
      if (this.prisma.analyzer) {
        const updated = await this.prisma.analyzer.update({
          where: { id },
          data: {
            code: data.code?.trim().toUpperCase(),
            name: data.name?.trim(),
            department: data.department,
            protocol: data.protocol,
            ipAddress: data.ipAddress,
            port: data.port === undefined ? undefined : String(data.port),
            status: data.status,
            orderCodes: data.orderCodes,
          },
        });
        if (updated) return updated;
      }
    } catch {}
    throw new BadRequestException('ไม่สามารถแก้ไข Analyzer ในฐานข้อมูลได้');
  }

  async deleteAnalyzer(id: string) {
    let analyzer: Awaited<ReturnType<typeof this.prisma.analyzer.findUnique>> =
      null;
    try {
      if (this.prisma.analyzer) {
        analyzer = await this.prisma.analyzer.findUnique({
          where: { id },
        });
      }
    } catch {}
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
          `ไม่สามารถลบเครื่องวิเคราะห์ '${analyzer.name}' ได้ เนื่องจากมีผลตรวจที่เชื่อมโยงกับเครื่องตรวจนี้ (${linkedResults} รายการ) กรุณาเปลี่ยนสถานะเป็น Inactive แทน`,
        );
      }
    }

    try {
      if (this.prisma.analyzer) {
        await this.prisma.analyzer.delete({ where: { id } });
        return { success: true };
      }
    } catch {}
    throw new BadRequestException('ไม่สามารถลบ Analyzer จากฐานข้อมูลได้');
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
      const data = await this.cacheManager.get<unknown>(key);
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
