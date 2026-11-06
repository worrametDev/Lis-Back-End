import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class JwtAuthService {
  private readonly secret: string;
  private readonly expiresIn: jwt.SignOptions['expiresIn'];

  constructor(private readonly config: ConfigService) {
    const configuredSecret = this.config.get<string>('JWT_SECRET');
    if (!configuredSecret || configuredSecret.length < 32) {
      throw new Error(
        'JWT_SECRET must be configured and at least 32 characters long',
      );
    }
    this.secret = configuredSecret;
    this.expiresIn = this.config.get<string>(
      'JWT_EXPIRES_IN',
      '15m',
    ) as jwt.SignOptions['expiresIn'];
  }

  sign(payload: object): string {
    return jwt.sign(payload, this.secret, {
      expiresIn: this.expiresIn,
    });
  }

  verify<T extends object = jwt.JwtPayload>(token: string): T {
    return jwt.verify(token, this.secret) as T;
  }
}
