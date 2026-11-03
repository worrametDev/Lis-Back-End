import { OrderCatalogService } from './order-catalog.service';
describe('order catalog resolution', () => {
  const make = () =>
    new OrderCatalogService({
      labTest: {
        findMany: async () => [
          {
            code: 'T1',
            name: 'Real test',
            testItems: [
              {
                code: 'P1',
                name: 'Real parameter',
                unit: 'units',
                low: '1',
                high: '10',
              },
            ],
          },
        ],
      },
      testPanel: {
        findMany: async () => [{ panelCode: 'PANEL', testItems: ['P1'] }],
      },
      testProfile: {
        findMany: async () => [{ code: 'PROFILE', tests: ['T1'] }],
      },
      department: {
        findMany: async () => [{ id: 'general', departmentCode: 'GEN' }],
      },
    } as any);
  it('resolves profile and panel members from configured tests', async () => {
    const items = await make().resolve([
      { testCode: 'PROFILE', catalogType: 'profile' },
      { testCode: 'PANEL', catalogType: 'panel' },
    ]);
    expect(items.map((item) => item.subtests[0].name)).toEqual([
      'Real parameter',
      'Real parameter',
    ]);
  });
  it('rejects empty or unknown catalog entries rather than adding CBC or FBS', async () => {
    await expect(make().resolve([])).rejects.toThrow();
    await expect(make().resolve([{ testCode: 'UNKNOWN' }])).rejects.toThrow(
      'UNKNOWN',
    );
  });
});
