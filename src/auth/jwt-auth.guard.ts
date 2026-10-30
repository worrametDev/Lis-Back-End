import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthService } from './jwt.service';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtAuthService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromRequest(request);

    if (!token) {
      throw new UnauthorizedException(
        'กรุณาเข้าสู่ระบบก่อนทำรายการ (Missing access token)',
      );
    }

    try {
      const payload = this.jwtService.verify(token);
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException(
        'Token หมดอายุหรือไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่',
      );
    }
  }

  private extractTokenFromRequest(request: any): string | null {
    // 1. From Authorization Bearer header
    const authHeader = request.headers.authorization;
    if (
      authHeader &&
      typeof authHeader === 'string' &&
      authHeader.startsWith('Bearer ')
    ) {
      return authHeader.substring(7);
    }

    // 2. From HttpOnly Cookie
    if (request.cookies && request.cookies.healthdi_token) {
      return request.cookies.healthdi_token;
    }

    return null;
  }
}
