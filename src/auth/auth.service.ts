import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtAuthService } from './jwt.service';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtAuthService,
  ) {}

  async validateUser(username: string, pass: string): Promise<any> {
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

    const { passwordHash, ...result } = user;
    return result;
  }

  async login(username: string, pass: string) {
    const user = await this.validateUser(username, pass);
    const payload = {
      sub: user.id,
      username: user.username,
      role: user.userRole,
      siteId: user.clientSiteId || user.parentSiteId,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        username: user.username,
        fullname: `${user.firstName} ${user.lastName}`.trim(),
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.userRole,
        status: user.userStatus,
        parentSite: user.parentSite?.siteName || 'โรงพยาบาลเสนา',
        clientSite: user.clientSite?.siteName || 'โรงพยาบาลส่งเสริมสุขภาพตำบลทุ่งแสลงหลวง',
        licenseNo: user.licenseNo,
      },
    };
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
    const { passwordHash, ...result } = user;
    return {
      ...result,
      fullname: `${user.firstName} ${user.lastName}`.trim(),
      role: user.userRole,
      status: user.userStatus,
      parentSite: user.parentSite?.siteName || 'โรงพยาบาลเสนา',
      clientSite: user.clientSite?.siteName || 'โรงพยาบาลส่งเสริมสุขภาพตำบลทุ่งแสลงหลวง',
    };
  }
}
