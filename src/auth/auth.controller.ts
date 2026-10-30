import {
  Controller,
  Post,
  Body,
  Get,
  Headers,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { IsNotEmpty, IsString } from 'class-validator';
import { AuthService } from './auth.service';
import { JwtAuthService } from './jwt.service';
import { Public } from './public.decorator';

export class LoginDto {
  @IsString()
  @IsNotEmpty({ message: 'กรุณาระบุ Username' })
  username!: string;

  @IsString()
  @IsNotEmpty({ message: 'กรุณาระบุ Password' })
  password!: string;
}

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: JwtAuthService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('login')
  @ApiOperation({
    summary:
      'เข้าสู่ระบบ (Login) และออก HttpOnly Cookie + JWT Token ตามมาตรฐานความปลอดภัยสูงสุด',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        username: {
          type: 'string',
          example: 'thititada.p',
          description: 'ชื่อผู้ใช้งาน (เช่น thititada.p หรือ admin)',
        },
        password: {
          type: 'string',
          example: 'Admin@1234',
          description: 'รหัสผ่าน',
        },
      },
      required: ['username', 'password'],
    },
  })
  @ApiResponse({
    status: 200,
    description:
      'เข้าสู่ระบบสำเร็จ ตั้งค่า HttpOnly Cookie และคืนค่าข้อมูลผู้ใช้',
  })
  @ApiResponse({
    status: 401,
    description: 'Username หรือ Password ไม่ถูกต้อง',
  })
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { username, password } = body;
    if (!username || !password) {
      throw new UnauthorizedException('กรุณาระบุ Username และ Password');
    }

    const result = await this.authService.login(username, password);

    const isProd = process.env.NODE_ENV === 'production';
    const sameSiteMode = isProd ? ('none' as const) : ('lax' as const);

    // Set HttpOnly Cookie (รองรับทั้ง Cross-Domain Vercel และ Localhost)
    res.cookie('healthdi_token', result.accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: sameSiteMode,
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return result;
  }

  @Public()
  @Post('logout')
  @ApiOperation({ summary: 'ออกจากระบบ (Logout) และทำลาย HttpOnly Cookie' })
  @ApiResponse({ status: 200, description: 'ออกจากระบบสำเร็จ' })
  async logout(@Res({ passthrough: true }) res: Response) {
    const isProd = process.env.NODE_ENV === 'production';
    const sameSiteMode = isProd ? ('none' as const) : ('lax' as const);

    res.clearCookie('healthdi_token', {
      httpOnly: true,
      secure: isProd,
      sameSite: sameSiteMode,
      path: '/',
    });
    return { success: true, message: 'ออกจากระบบเรียบร้อยแล้ว' };
  }

  @Get('me')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'ตรวจสอบโปรไฟล์ผู้ใช้งานปัจจุบัน (รองรับทั้ง HttpOnly Cookie และ Bearer Token)',
  })
  @ApiResponse({ status: 200, description: 'คืนค่าข้อมูลผู้ใช้งาน' })
  @ApiResponse({ status: 401, description: 'Token ไม่ถูกต้องหรือหมดอายุ' })
  async getMe(
    @Req() req: Request,
    @Headers('authorization') authHeader?: string,
  ) {
    // 1. ดึง Token จาก Bearer header หรือ HttpOnly Cookie
    let token: string | undefined;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.replace('Bearer ', '').trim();
    } else if (req.cookies && req.cookies['healthdi_token']) {
      token = req.cookies['healthdi_token'];
    }

    if (!token) {
      throw new UnauthorizedException(
        'ไม่พบ Token ยืนยันตัวตน (Missing Token)',
      );
    }

    try {
      const decoded: any = this.jwtService.verify(token);
      return this.authService.getProfile(decoded.sub);
    } catch {
      throw new UnauthorizedException('Token ไม่ถูกต้องหรือหมดอายุการใช้งาน');
    }
  }
}
