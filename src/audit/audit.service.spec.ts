import { AuditService } from './audit.service';

describe('AuditService', () => {
  it('removes password hashes from user snapshots', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          username: 'tester',
          passwordHash: 'secret-hash',
        }),
      },
    };
    const service = new AuditService(prisma as never);

    await expect(service.snapshot('users', 'user-1')).resolves.toEqual({
      id: 'user-1',
      username: 'tester',
    });
  });

  it('returns undefined when no entity id is available', async () => {
    const service = new AuditService({} as never);
    await expect(service.snapshot('orders')).resolves.toBeUndefined();
  });
});
