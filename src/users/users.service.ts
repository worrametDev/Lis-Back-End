import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  private mapRole(roleString?: string): UserRole {
    if (!roleString) return UserRole.SYSTEM_ADMINISTRATOR;
    const clean = roleString.trim().toUpperCase();
    if (clean.includes('LAB') || clean === 'LAB_ADMINISTRATOR')
      return UserRole.LAB_ADMINISTRATOR;
    if (clean.includes('TECH') || clean === 'MEDICAL_TECHNOLOGIST')
      return UserRole.MEDICAL_TECHNOLOGIST;
    if (clean.includes('CLIENT') || clean === 'CLIENT_SITE_USER')
      return UserRole.CLIENT_SITE_USER;
    return UserRole.SYSTEM_ADMINISTRATOR;
  }

  private mapStatus(statusString?: string): UserStatus {
    if (!statusString) return UserStatus.ACTIVE;
    const clean = statusString.trim().toUpperCase();
    if (clean === 'INACTIVE' || clean.includes('ระงับ'))
      return UserStatus.INACTIVE;
    return UserStatus.ACTIVE;
  }

  async findAll(search?: string, role?: string, status?: string) {
    const where: any = {};
    if (role) {
      where.userRole = this.mapRole(role);
    }
    if (status) {
      where.userStatus = this.mapStatus(status);
    }
    if (search) {
      where.OR = [
        { username: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const users = await this.prisma.user.findMany({
      where,
      include: {
        parentSite: true,
        clientSite: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return users.map((u) => ({
      id: u.id,
      status: u.userStatus === UserStatus.ACTIVE ? 'Active' : 'Inactive',
      userStatus: u.userStatus === UserStatus.ACTIVE ? 'Active' : 'Inactive',
      username: u.username,
      fullname: `${u.firstName} ${u.lastName}`.trim(),
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email || '',
      telNo: u.telNo || '',
      position: u.position || '',
      organization: u.organization || '',
      userRole: u.userRole.replace(/_/g, ' '),
      role: u.userRole.replace(/_/g, ' '),
      clientSite:
        u.clientSite?.siteName ||
        u.parentSite?.siteName ||
        'โรงพยาบาลส่งเสริมสุขภาพตำบลทุ่งแสลงหลวง',
      clientSiteId: u.clientSiteId || '',
      parentSite: u.parentSite?.siteName || 'โรงพยาบาลเสนา',
      parentSiteId: u.parentSiteId || '',
      province: u.province || '',
      healthRegion: u.healthRegion || '',
      signatureUrl: u.signatureUrl || '',
      licenseNo: u.licenseNo || '',
      license: u.licenseNo || '',
      telemedicineAccess: u.telemedicineAccess ?? false,
      telemedicineRole: u.telemedicineRole || '',
      createdAt: u.createdAt,
    }));
  }

  async getOptions() {
    const cached = await this.cacheManager.get<any>('user_options');
    if (cached) return cached;

    const parentSites = await this.prisma.parentSite.findMany({
      where: { siteStatus: 'Active' },
      select: {
        id: true,
        siteCode: true,
        siteName: true,
        siteType: true,
        province: true,
      },
      orderBy: { siteName: 'asc' },
    });
    const clientSites = await this.prisma.clientSite.findMany({
      where: { siteStatus: 'Active' },
      select: {
        id: true,
        siteCode: true,
        siteName: true,
        siteType: true,
        parentSiteId: true,
        province: true,
      },
      orderBy: { siteName: 'asc' },
    });

    const roles = [
      { id: 'System Administrator', name: 'System Administrator' },
      { id: 'Lab Administrator', name: 'Lab Administrator' },
      { id: 'Medical Technologist', name: 'Medical Technologist' },
      { id: 'Client Site User', name: 'Client Site User' },
    ];

    const telemedicineRoles = [
      { id: 'DOCTOR', name: 'แพทย์ (Doctor)' },
      { id: 'NURSE', name: 'พยาบาล (Nurse)' },
      { id: 'STAFF', name: 'เจ้าหน้าที่ (Staff)' },
      { id: 'ADMIN', name: 'ผู้ดูแลระบบ (Telemedicine Admin)' },
    ];

    const statuses = [
      { id: 'Active', name: 'Active' },
      { id: 'Inactive', name: 'Inactive' },
    ];

    const result = {
      parentSites,
      clientSites,
      roles,
      telemedicineRoles,
      statuses,
    };

    await this.cacheManager.set('user_options', result, 600000); // 10 minutes
    return result;
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { parentSite: true, clientSite: true },
    });
    if (!user) throw new NotFoundException(`User with ID ${id} not found`);
    const { passwordHash: _passwordHash, ...safeUser } = user;
    return {
      ...safeUser,
      fullname: `${user.firstName} ${user.lastName}`.trim(),
      role: user.userRole.replace(/_/g, ' '),
      status: user.userStatus === UserStatus.ACTIVE ? 'Active' : 'Inactive',
      clientSite:
        user.clientSite?.siteName ||
        user.parentSite?.siteName ||
        'โรงพยาบาลส่งเสริมสุขภาพตำบลทุ่งแสลงหลวง',
      parentSite: user.parentSite?.siteName || 'โรงพยาบาลเสนา',
      license: user.licenseNo || '',
      telemedicineAccess: user.telemedicineAccess ?? false,
      telemedicineRole: user.telemedicineRole || '',
    };
  }

  async create(data: {
    username: string;
    password?: string;
    firstName: string;
    lastName?: string;
    email?: string;
    telNo?: string;
    position?: string;
    organization?: string;
    role?: string;
    userRole?: string;
    userStatus?: string;
    status?: string;
    siteName?: string;
    clientSite?: string;
    parentSite?: string;
    license?: string;
    licenseNo?: string;
    province?: string;
    healthRegion?: string;
    signatureUrl?: string;
    parentSiteId?: string;
    clientSiteId?: string;
    telemedicineAccess?: boolean;
    telemedicineRole?: string;
  }) {
    if (!data.username || !data.firstName) {
      throw new BadRequestException('กรุณาระบุ Username และ First Name');
    }

    const existing = await this.prisma.user.findUnique({
      where: { username: data.username },
    });
    if (existing) {
      throw new BadRequestException(
        `Username "${data.username}" นี้ถูกใช้งานแล้ว`,
      );
    }

    const passwordHash = bcrypt.hashSync(data.password || 'Admin@1234', 10);
    const userRole = this.mapRole(data.role || data.userRole);
    const userStatus = this.mapStatus(data.userStatus || data.status);

    // Find parent site / client site by siteName or default
    let parentSiteId = data.parentSiteId;
    let clientSiteId = data.clientSiteId;

    const targetSite = data.clientSite || data.siteName;
    if (!clientSiteId && targetSite) {
      const foundClient = await this.prisma.clientSite.findFirst({
        where: {
          OR: [
            { siteName: { contains: targetSite, mode: 'insensitive' } },
            { siteCode: { equals: targetSite, mode: 'insensitive' } },
          ],
        },
      });
      if (foundClient) {
        clientSiteId = foundClient.id;
        if (!parentSiteId) parentSiteId = foundClient.parentSiteId;
      }
    }

    if (!parentSiteId && (data.parentSite || data.siteName)) {
      const targetParent = data.parentSite || data.siteName;
      const foundParent = await this.prisma.parentSite.findFirst({
        where: {
          OR: [
            { siteName: { contains: targetParent, mode: 'insensitive' } },
            { siteCode: { equals: targetParent, mode: 'insensitive' } },
          ],
        },
      });
      if (foundParent) parentSiteId = foundParent.id;
    }

    const newUser = await this.prisma.user.create({
      data: {
        username: data.username,
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName || '',
        email: data.email,
        telNo: data.telNo,
        position: data.position,
        organization: data.organization,
        userRole,
        userStatus,
        licenseNo: data.licenseNo || data.license,
        province: data.province,
        healthRegion: data.healthRegion,
        signatureUrl: data.signatureUrl,
        telemedicineAccess: data.telemedicineAccess ?? false,
        telemedicineRole: data.telemedicineRole || null,
        parentSiteId,
        clientSiteId,
      },
      include: {
        parentSite: true,
        clientSite: true,
      },
    });

    try {
      await this.cacheManager.del('user_options');
    } catch {}

    return {
      id: newUser.id,
      status: newUser.userStatus === UserStatus.ACTIVE ? 'Active' : 'Inactive',
      userStatus:
        newUser.userStatus === UserStatus.ACTIVE ? 'Active' : 'Inactive',
      username: newUser.username,
      fullname: `${newUser.firstName} ${newUser.lastName}`.trim(),
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      email: newUser.email || '',
      telNo: newUser.telNo || '',
      position: newUser.position || '',
      organization: newUser.organization || '',
      userRole: newUser.userRole.replace(/_/g, ' '),
      role: newUser.userRole.replace(/_/g, ' '),
      clientSite:
        newUser.clientSite?.siteName ||
        newUser.parentSite?.siteName ||
        'โรงพยาบาลเสนา',
      clientSiteId: newUser.clientSiteId || '',
      parentSite: newUser.parentSite?.siteName || 'โรงพยาบาลเสนา',
      parentSiteId: newUser.parentSiteId || '',
      province: newUser.province || '',
      healthRegion: newUser.healthRegion || '',
      signatureUrl: newUser.signatureUrl || '',
      licenseNo: newUser.licenseNo || '',
      license: newUser.licenseNo || '',
      telemedicineAccess: newUser.telemedicineAccess ?? false,
      telemedicineRole: newUser.telemedicineRole || '',
      createdAt: newUser.createdAt,
    };
  }

  async update(id: string, data: any) {
    await this.findOne(id);
    const updateData: any = { ...data };

    if (updateData.password) {
      updateData.passwordHash = bcrypt.hashSync(updateData.password, 10);
      delete updateData.password;
    }
    if (updateData.role || updateData.userRole) {
      updateData.userRole = this.mapRole(
        updateData.role || updateData.userRole,
      );
      delete updateData.role;
    }
    if (updateData.userStatus || updateData.status) {
      updateData.userStatus = this.mapStatus(
        updateData.userStatus || updateData.status,
      );
      delete updateData.status;
    }
    if (updateData.license) {
      updateData.licenseNo = updateData.license;
      delete updateData.license;
    }
    if (typeof updateData.telemedicineAccess === 'boolean') {
      updateData.telemedicineAccess = updateData.telemedicineAccess;
    }
    if (updateData.telemedicineRole !== undefined) {
      updateData.telemedicineRole = updateData.telemedicineRole || null;
    }

    // Resolve clientSite & parentSite by name or code if provided
    const clientTarget = updateData.clientSite || updateData.siteName;
    if (clientTarget && !updateData.clientSiteId) {
      const foundClient = await this.prisma.clientSite.findFirst({
        where: {
          OR: [
            { siteName: { contains: clientTarget, mode: 'insensitive' } },
            { siteCode: { equals: clientTarget, mode: 'insensitive' } },
          ],
        },
      });
      if (foundClient) {
        updateData.clientSiteId = foundClient.id;
        if (!updateData.parentSiteId)
          updateData.parentSiteId = foundClient.parentSiteId;
      }
    }

    const parentTarget = updateData.parentSite || updateData.siteName;
    if (parentTarget && !updateData.parentSiteId) {
      const foundParent = await this.prisma.parentSite.findFirst({
        where: {
          OR: [
            { siteName: { contains: parentTarget, mode: 'insensitive' } },
            { siteCode: { equals: parentTarget, mode: 'insensitive' } },
          ],
        },
      });
      if (foundParent) {
        updateData.parentSiteId = foundParent.id;
      }
    }

    // Clean non-Prisma fields
    delete updateData.siteName;
    delete updateData.clientSite;
    delete updateData.parentSite;
    delete updateData.fullname;
    delete updateData.confirmPassword;
    delete updateData.id;
    delete updateData.createdAt;
    delete updateData.updatedAt;
    delete updateData.status;

    const updated = await this.prisma.user.update({
      where: { id },
      data: updateData,
      include: { parentSite: true, clientSite: true },
    });

    try {
      await this.cacheManager.del('user_options');
    } catch {}

    return {
      id: updated.id,
      status: updated.userStatus === UserStatus.ACTIVE ? 'Active' : 'Inactive',
      userStatus:
        updated.userStatus === UserStatus.ACTIVE ? 'Active' : 'Inactive',
      username: updated.username,
      fullname: `${updated.firstName} ${updated.lastName}`.trim(),
      firstName: updated.firstName,
      lastName: updated.lastName,
      email: updated.email || '',
      telNo: updated.telNo || '',
      position: updated.position || '',
      organization: updated.organization || '',
      userRole: updated.userRole.replace(/_/g, ' '),
      role: updated.userRole.replace(/_/g, ' '),
      clientSite:
        updated.clientSite?.siteName ||
        updated.parentSite?.siteName ||
        'โรงพยาบาลเสนา',
      clientSiteId: updated.clientSiteId || '',
      parentSite: updated.parentSite?.siteName || 'โรงพยาบาลเสนา',
      parentSiteId: updated.parentSiteId || '',
      province: updated.province || '',
      healthRegion: updated.healthRegion || '',
      signatureUrl: updated.signatureUrl || '',
      licenseNo: updated.licenseNo || '',
      license: updated.licenseNo || '',
      telemedicineAccess: updated.telemedicineAccess ?? false,
      telemedicineRole: updated.telemedicineRole || '',
      createdAt: updated.createdAt,
    };
  }

  async updateTelemedicineAccess(
    id: string,
    telemedicineAccess: boolean,
    telemedicineRole?: string,
  ) {
    await this.findOne(id);
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        telemedicineAccess,
        telemedicineRole: telemedicineAccess
          ? telemedicineRole || 'DOCTOR'
          : null,
      },
      include: { parentSite: true, clientSite: true },
    });

    try {
      await this.cacheManager.del('user_options');
    } catch {}

    return {
      id: updated.id,
      username: updated.username,
      fullname: `${updated.firstName} ${updated.lastName}`.trim(),
      telemedicineAccess: updated.telemedicineAccess,
      telemedicineRole: updated.telemedicineRole || '',
      status: updated.userStatus === UserStatus.ACTIVE ? 'Active' : 'Inactive',
    };
  }

  async remove(id: string) {
    await this.findOne(id);
    const res = await this.prisma.user.update({
      where: { id },
      data: { userStatus: UserStatus.INACTIVE },
    });
    try {
      await this.cacheManager.del('user_options');
    } catch {}
    return res;
  }
}
