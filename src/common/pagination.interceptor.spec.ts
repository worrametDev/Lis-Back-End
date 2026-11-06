import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { PaginationInterceptor } from './pagination.interceptor';

function context(query: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ query }) }),
  } as unknown as ExecutionContext;
}

describe('PaginationInterceptor', () => {
  const interceptor = new PaginationInterceptor();

  it('wraps list responses in a standard paginated envelope', (done) => {
    interceptor
      .intercept(context({ page: '2', pageSize: '2' }), {
        handle: () => of(['a', 'b', 'c', 'd', 'e']),
      } as CallHandler)
      .subscribe((response) => {
        expect(response).toEqual({
          data: ['c', 'd'],
          meta: { page: 2, pageSize: 2, total: 5, totalPages: 3 },
        });
        done();
      });
  });

  it('keeps non-list responses unchanged', (done) => {
    const response = { success: true };
    interceptor
      .intercept(context({}), { handle: () => of(response) } as CallHandler)
      .subscribe((body) => {
        expect(body).toBe(response);
        done();
      });
  });
});
