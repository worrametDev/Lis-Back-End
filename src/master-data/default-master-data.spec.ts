import { ensureDefaultMasterData } from './default-master-data';
describe('shared installation defaults', () => {
  it('fills partial installations, preserves customized inactive rows, and is idempotent', async () => {
    const customized = {
      titleCode: '01',
      titleNameTh: 'ชื่อที่แก้ไข',
      status: 'Inactive',
    };
    const tables: Record<string, any[]> = {
      title: [customized],
      ethnicity: [],
      department: [],
      sampleCondition: [],
    };
    const prisma: any = {
      $transaction: (operations: Promise<unknown>[]) => Promise.all(operations),
    };
    for (const table of Object.keys(tables))
      prisma[table] = {
        createMany: async ({ data }: any) => {
          const key =
            table === 'title'
              ? 'titleCode'
              : table === 'ethnicity'
                ? 'ethnicityCode'
                : table === 'department'
                  ? 'departmentCode'
                  : 'conditionCode';
          for (const row of data)
            if (!tables[table].some((existing) => existing[key] === row[key]))
              tables[table].push({ ...row });
        },
      };
    await ensureDefaultMasterData(prisma);
    const snapshot = JSON.stringify(tables);
    await ensureDefaultMasterData(prisma);
    expect(JSON.stringify(tables)).toBe(snapshot);
    expect(tables.title[0]).toEqual(customized);
    expect(tables.title).toHaveLength(5);
    expect(tables.ethnicity.some((row) => row.ethnicityCode === 'TH')).toBe(
      true,
    );
    expect(Object.keys(tables)).not.toContain('labTest');
  });
});
