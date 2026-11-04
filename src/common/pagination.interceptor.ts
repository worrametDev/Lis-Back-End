import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

@Injectable()
export class PaginationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    return next.handle().pipe(
      map((body) => {
        if (!Array.isArray(body)) return body;
        const page = Math.max(1, Number(request.query?.page) || 1);
        const pageSize = Math.min(
          200,
          Math.max(1, Number(request.query?.pageSize) || body.length || 1),
        );
        const total = body.length;
        const start = (page - 1) * pageSize;
        return {
          data: body.slice(start, start + pageSize),
          meta: {
            page,
            pageSize,
            total,
            totalPages: Math.ceil(total / pageSize),
          },
        };
      }),
    );
  }
}
