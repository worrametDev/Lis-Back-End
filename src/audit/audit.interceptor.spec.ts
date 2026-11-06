import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { AuditInterceptor } from './audit.interceptor';

describe('AuditInterceptor', () => {
  it('stores the database snapshot and mutation response for an update', async () => {
    const audit = {
      snapshot: jest
        .fn()
        .mockResolvedValue({ id: 'order-1', status: 'REGISTERED' }),
      record: jest.fn().mockResolvedValue(undefined),
    };
    const interceptor = new AuditInterceptor(audit as never);
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'PUT',
          path: '/orders/order-1',
          params: { id: 'order-1' },
          user: { sub: 'user-1' },
          ip: '127.0.0.1',
          get: () => 'jest',
        }),
      }),
    } as unknown as ExecutionContext;

    await firstValueFrom(
      interceptor.intercept(context, {
        handle: () => of({ id: 'order-1', status: 'CANCELLED' }),
      } as CallHandler),
    );
    await Promise.resolve();

    expect(audit.snapshot).toHaveBeenCalledWith('orders', 'order-1');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        oldValues: { id: 'order-1', status: 'REGISTERED' },
        newValues: { id: 'order-1', status: 'CANCELLED' },
      }),
    );
  });
});
