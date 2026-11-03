import { WorkstationWorkflowService } from './workstation-workflow.service';
describe('persisted workstation actions', () => {
  function setup(rows: any[]) {
    const tx: any = {
      testResult: {
        findMany: jest.fn().mockResolvedValue(rows),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      sample: {
        update: jest.fn().mockResolvedValue({ orderId: 'order' }),
        count: jest.fn().mockResolvedValue(0),
      },
      order: { update: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const cache = { del: jest.fn() };
    const prisma: any = { $transaction: jest.fn((callback) => callback(tx)) };
    return {
      tx,
      cache,
      service: new WorkstationWorkflowService(prisma, cache as any),
    };
  }
  it('rejects missing result values before writing any data', async () => {
    const { service, tx } = setup([]);
    await expect(
      service.report('sample', [{ id: 'result', testResult: '' }], 'user'),
    ).rejects.toThrow();
    expect(tx.testResult.update).not.toHaveBeenCalled();
  });
  it('rejects results from a different sample and approved results', async () => {
    for (const rows of [[], [{ id: 'result', isApproved: true }]]) {
      const { service, tx } = setup(rows);
      await expect(
        service.report('sample', [{ id: 'result', testResult: '5' }], 'user'),
      ).rejects.toThrow();
      expect(tx.testResult.update).not.toHaveBeenCalled();
    }
  });
  it('does not report success or clear caches if the database write fails', async () => {
    const { service, tx, cache } = setup([{ id: 'result', isApproved: false }]);
    tx.testResult.update.mockRejectedValue(new Error('database unavailable'));
    await expect(
      service.report('sample', [{ id: 'result', testResult: '5' }], 'user'),
    ).rejects.toThrow('database unavailable');
    expect(cache.del).not.toHaveBeenCalled();
  });
  it('stores values and flags together with the authenticated reporter audit', async () => {
    const { service, tx } = setup([
      { id: 'result', isApproved: false, referenceRange: '1 - 10' },
    ]);
    await service.report(
      'sample',
      [{ id: 'result', testResult: '12' }],
      'user',
    );
    expect(tx.testResult.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          testResult: '12',
          flag: 'HIGH',
          status: 'REPORTED',
        }),
      }),
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user',
          action: 'REPORT_RESULTS',
        }),
      }),
    );
  });
  it('does not approve a result that has never been reported', async () => {
    const { service, tx } = setup([{ id: 'result', status: 'PENDING' }]);
    await expect(
      service.approve('sample', ['result'], 'user'),
    ).rejects.toThrow();
    expect(tx.testResult.updateMany).not.toHaveBeenCalled();
  });
});
