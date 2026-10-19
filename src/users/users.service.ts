import { Injectable, BadRequestException, NotFoundException, Inject } from '@nestjs/common';
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
    if (clean.includes('LAB') || clean === 'LAB_ADMINISTRATOR') return UserRole.LAB_ADMINISTRATOR;
    if (clean.includes('TECH') || clean === 'MEDICAL_TECHNOLOGIST') return UserRole.MEDICAL_TECHNOLOGIST;
    if (clean.includes('CLIENT') || clean === 'CLIENT_SITE_USER') return UserRole.CLIENT_SITE_USER;
    return UserRole.SYSTEM_ADMINISTRATOR;
  }

  private mapStatus(statusString?: string): UserStatus {
    if (!statusString) return UserStatus.ACTIVE;
    const clean = statusString.trim().toUpperCase();
    if (clean === 'INACTIVE' || clean.includes('ระงับ')) return UserStatus.INACTIVE;
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
      username: u.username,
      fullname: `${u.firstName} ${u.lastName}`.trim(),
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email || '',
      telNo: u.telNo || '',
      position: u.position || '',
      organization: u.organization || '',
      userRole: u.userRole.replace(/_/g, ' '),
      clientSite: u.clientSite?.siteName || u.parentSite?.siteName || 'โรงพยาบาลส่งเสริมสุขภาพตำบลทุ่งแสลงหลวง',
      parentSite: u.parentSite?.siteName || 'โรงพยาบาลเสนา',
      licenseNo: u.licenseNo || '',
      createdAt: u.createdAt,
    }));
  }

  async getOptions() {
    const cached = await this.cacheManager.get<any>('user_options');
    if (cached) return cached;

    const parentSites = await this.prisma.parentSite.findMany({
      where: { siteStatus: 'Active' },
      select: { id: true, siteCode: true, siteName: true, siteType: true },
      orderBy: { siteName: 'asc' },
    });
    const clientSites = await this.prisma.clientSite.findMany({
      where: { siteStatus: 'Active' },
      select: { id: true, siteCode: true, siteName: true, siteType: true, parentSiteId: true },
      orderBy: { siteName: 'asc' },
    });

    const roles = [
      { id: 'System Administrator', name: 'System Administrator' },
      { id: 'Lab Administrator', name: 'Lab Administrator' },
      { id: 'Medical Technologist', name: 'Medical Technologist' },
      { id: 'Client Site User', name: 'Client Site User' },
    ];

    const statuses = [
      { id: 'Active', name: 'Active' },
      { id: 'Inactive', name: 'Inactive' },
    ];

    const result = {
      parentSites,
      clientSites,
      roles,
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
    const { passwordHash, ...safeUser } = user;
    return safeUser;
  }

  async create(data: {
    username: string;
    password?: string;
    firstName: string;
    lastName: string;
    email?: string;
    telNo?: string;
    position?: string;
    organization?: string;
    role?: string;
    userStatus?: string;
    siteName?: string;
    licenseNo?: string;
    parentSiteId?: string;
    clientSiteId?: string;
  }) {
    if (!data.username || !data.firstName) {
      throw new BadRequestException('กรุณาระบุ Username และ First Name');
    }

    const existing = await this.prisma.user.findUnique({
      where: { username: data.username },
    });
    if (existing) {
      throw new BadRequestException(`Username "${data.username}" นี้ถูกใช้งานแล้ว`);
    }

    const passwordHash = bcrypt.hashSync(data.password || 'Admin@1234', 10);
    const userRole = this.mapRole(data.role);
    const userStatus = this.mapStatus(data.userStatus);

    // Find parent site / client site by siteName or default
    let parentSiteId = data.parentSiteId;
    let clientSiteId = data.clientSiteId;

    if (!parentSiteId && !clientSiteId && data.siteName) {
      const foundClient = await this.prisma.clientSite.findFirst({
        where: { siteName: { contains: data.siteName, mode: 'insensitive' } },
      });
      if (foundClient) {
        clientSiteId = foundClient.id;
        parentSiteId = foundClient.parentSiteId;
      } else {
        const foundParent = await this.prisma.parentSite.findFirst({
          where: { siteName: { contains: data.siteName, mode: 'insensitive' } },
        });
        if (foundParent) parentSiteId = foundParent.id;
      }
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
        licenseNo: data.licenseNo,
        parentSiteId,
        clientSiteId,
      },
      include: {
        parentSite: true,
        clientSite: true,
      },
    });

    return {
      id: newUser.id,
      status: newUser.userStatus === UserStatus.ACTIVE ? 'Active' : 'Inactive',
      username: newUser.username,
      fullname: `${newUser.firstName} ${newUser.lastName}`.trim(),
      userRole: newUser.userRole.replace(/_/g, ' '),
      clientSite: newUser.clientSite?.siteName || newUser.parentSite?.siteName || 'โรงพยาบาลเสนา',
      parentSite: newUser.parentSite?.siteName || 'โรงพยาบาลเสนา',
    };
  }

  async update(id: string, data: any) {
    await this.findOne(id);
    const updateData: any = { ...data };
    if (updateData.password) {
      updateData.passwordHash = bcrypt.hashSync(updateData.password, 10);
      delete updateData.password;
    }
    if (updateData.role) {
      updateData.userRole = this.mapRole(updateData.role);
      delete updateData.role;
    }
    if (updateData.userStatus) {
      updateData.userStatus = this.mapStatus(updateData.userStatus);
    }
    if (updateData.siteName) {
      const foundClient = await this.prisma.clientSite.findFirst({
        where: { siteName: { contains: updateData.siteName, mode: 'insensitive' } },
      });
      if (foundClient) {
        updateData.clientSiteId = foundClient.id;
        updateData.parentSiteId = foundClient.parentSiteId;
      } else {
        const foundParent = await this.prisma.parentSite.findFirst({
          where: { siteName: { contains: updateData.siteName, mode: 'insensitive' } },
        });
        if (foundParent) {
          updateData.parentSiteId = foundParent.id;
          updateData.clientSiteId = null;
        }
      }
      delete updateData.siteName;
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: updateData,
      include: { parentSite: true, clientSite: true },
    });

    return {
      id: updated.id,
      status: updated.userStatus === UserStatus.ACTIVE ? 'Active' : 'Inactive',
      username: updated.username,
      fullname: `${updated.firstName} ${updated.lastName}`.trim(),
      firstName: updated.firstName,
      lastName: updated.lastName,
      email: updated.email || '',
      telNo: updated.telNo || '',
      position: updated.position || '',
      organization: updated.organization || '',
      userRole: updated.userRole.replace(/_/g, ' '),
      clientSite: updated.clientSite?.siteName || updated.parentSite?.siteName || 'โรงพยาบาลเสนา',
      parentSite: updated.parentSite?.siteName || 'โรงพยาบาลเสนา',
      createdAt: updated.createdAt,
    };
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.user.update({
      where: { id },
      data: { userStatus: UserStatus.INACTIVE },
    });
  }
}
