import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtAuthService } from './jwt.service';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import type { Prisma } from '@prisma/client';

type AuthenticatedUserRecord = Omit<
  Prisma.UserGetPayload<{
    include: { parentSite: true; clientSite: true };
  }>,
  'passwordHash'
>;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtAuthService,
  ) {}

  async validateUser(
    username: string,
    pass: string,
  ): Promise<AuthenticatedUserRecord> {
    const user = await this.prisma.user.findUnique({
      where: { username },
      include: {
        parentSite: true,
        clientSite: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง');
    }

    if (user.userStatus !== 'ACTIVE') {
      throw new UnauthorizedException('บัญชีผู้ใช้งานนี้ถูกระงับการใช้งาน');
    }

    const isMatch = await bcrypt.compare(pass, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง');
    }

    const { passwordHash: _passwordHash, ...result } = user;
    return result;
  }

  private async getDefaultParentSiteName(): Promise<string> {
    const primarySite = await this.prisma.parentSite.findFirst({
      where: { siteStatus: 'Active' },
      orderBy: { createdAt: 'asc' },
    });
    return primarySite?.siteName || process.env.HOSPITAL_NAME || '';
  }

  async login(username: string, pass: string) {
    const user = await this.validateUser(username, pass);
    const defaultParent = await this.getDefaultParentSiteName();
    const payload = {
      sub: user.id,
      username: user.username,
      role: user.userRole,
      siteId: user.clientSiteId || user.parentSiteId,
    };

    const refreshToken = randomBytes(48).toString('base64url');
    await this.storeRefreshToken(user.id, refreshToken);
    return {
      accessToken: this.jwtService.sign(payload),
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        fullname: `${user.firstName} ${user.lastName}`.trim(),
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.userRole,
        status: user.userStatus,
        parentSite: user.parentSite?.siteName || defaultParent,
        parentSiteId: user.parentSiteId || '',
        clientSite: user.clientSite?.siteName || '',
        clientSiteId: user.clientSiteId || '',
        licenseNo: user.licenseNo || '',
        province: user.province || '',
        healthRegion: user.healthRegion || '',
        signatureUrl: user.signatureUrl || '',
        telemedicineAccess: user.telemedicineAccess ?? false,
        telemedicineRole: user.telemedicineRole || '',
      },
    };
  }

  private hashRefreshToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private async storeRefreshToken(userId: string, token: string) {
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await this.prisma.refreshToken.create({
      data: { userId, tokenHash: this.hashRefreshToken(token), expiresAt },
    });
  }

  async refresh(refreshToken: string) {
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hashRefreshToken(refreshToken) },
      include: { user: true },
    });
    if (
      !record ||
      record.revokedAt ||
      record.expiresAt <= new Date() ||
      record.user.userStatus !== 'ACTIVE'
    ) {
      throw new UnauthorizedException('Refresh token ไม่ถูกต้องหรือหมดอายุ');
    }
    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });
    const nextRefreshToken = randomBytes(48).toString('base64url');
    await this.storeRefreshToken(record.userId, nextRefreshToken);
    return {
      accessToken: this.jwtService.sign({
        sub: record.user.id,
        username: record.user.username,
        role: record.user.userRole,
        siteId: record.user.clientSiteId || record.user.parentSiteId,
      }),
      refreshToken: nextRefreshToken,
    };
  }

  async revokeRefreshToken(refreshToken: string) {
    await this.prisma.refreshToken.updateMany({
      where: {
        tokenHash: this.hashRefreshToken(refreshToken),
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        parentSite: true,
        clientSite: true,
      },
    });
    if (!user) {
      throw new UnauthorizedException('ไม่พบข้อมูลผู้ใช้งาน');
    }
    const defaultParent = await this.getDefaultParentSiteName();
    const { passwordHash: _passwordHash, ...result } = user;
    return {
      ...result,
      fullname: `${user.firstName} ${user.lastName}`.trim(),
      role: user.userRole,
      status: user.userStatus,
      parentSite: user.parentSite?.siteName || defaultParent,
      parentSiteId: user.parentSiteId || '',
      clientSite: user.clientSite?.siteName || '',
      clientSiteId: user.clientSiteId || '',
      licenseNo: user.licenseNo || '',
      province: user.province || '',
      healthRegion: user.healthRegion || '',
      signatureUrl: user.signatureUrl || '',
      telemedicineAccess: user.telemedicineAccess ?? false,
      telemedicineRole: user.telemedicineRole || '',
    };
  }
}
