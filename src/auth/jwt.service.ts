import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class JwtAuthService {
  private readonly secret: string;
  private readonly expiresIn: string;

  constructor(private readonly config: ConfigService) {
    this.secret = this.config.get<string>(
      'JWT_SECRET',
      'healthdi_lab_secret_jwt_key_2026_sena_hospital_secure',
    );
    this.expiresIn = this.config.get<string>('JWT_EXPIRES_IN', '7d');
  }

  sign(payload: object): string {
    return jwt.sign(payload, this.secret, {
      expiresIn: this.expiresIn as any,
    });
  }

  verify<T extends object = any>(token: string): T {
    return jwt.verify(token, this.secret) as T;
  }
}
