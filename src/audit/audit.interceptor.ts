import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AuditService } from './audit.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const method = req.method;
    if (
      !['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) ||
      req.path.includes('/auth') ||
      req.path.includes('/middleware')
    )
      return next.handle();
    return next.handle().pipe(
      tap((result) => {
        const user = req.user;
        if (!user?.sub) return;
        void this.audit.record({
          userId: user.sub,
          action: `${method}_${String(req.path).split('/')[1]?.toUpperCase() || 'REQUEST'}`,
          entityType: String(req.path).split('/')[1] || 'Unknown',
          entityId: req.params?.id,
          newValues: result && typeof result === 'object' ? result : undefined,
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
        });
      }),
    );
  }
}
