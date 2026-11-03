import { Injectable, BadRequestException } from '@nestjs/common';
import { Prisma, SpecimenStatus } from '@prisma/client';
import { nextLabNumber } from './lab-number';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OrderCatalogService {
  constructor(private readonly prisma: PrismaService) {}
  async resolve(items: any[]) {
    if (!items?.length)
      throw new BadRequestException('กรุณาเลือกรายการตรวจจาก master data');
    const [tests, panels, profiles, departments] = await Promise.all([
      this.prisma.labTest.findMany({ where: { status: 'Active' } }),
      this.prisma.testPanel.findMany({ where: { status: 'Active' } }),
      this.prisma.testProfile.findMany({ where: { status: 'Active' } }),
      this.prisma.department.findMany({ where: { deptStatus: 'Active' } }),
    ]);
    const expand = (
      code: string,
      kind?: string,
      seen = new Set<string>(),
    ): any[] => {
      const key = (kind || '') + ':' + code;
      if (seen.has(key))
        throw new BadRequestException('master data อ้างอิงวนซ้ำ: ' + code);
      const next = new Set([...seen, key]);
      const test =
        kind !== 'panel' && kind !== 'profile'
          ? tests.find((t) => t.code === code)
          : undefined;
      if (test)
        return Array.isArray(test.testItems) && test.testItems.length
          ? test.testItems
          : [{ code: test.code, name: test.name }];
      const profile =
        kind !== 'panel' ? profiles.find((p) => p.code === code) : undefined;
      if (profile)
        return (Array.isArray(profile.tests) ? profile.tests : []).flatMap(
          (c) => expand(String(c), 'test', next),
        );
      const panel = panels.find((p) => p.panelCode === code);
      if (panel)
        return (Array.isArray(panel.testItems) ? panel.testItems : []).flatMap(
          (c) => expand(String(c), 'test', next),
        );
      for (const t of tests) {
        const sub = Array.isArray(t.testItems)
          ? t.testItems.find((item: any) => item.code === code)
          : undefined;
        if (sub) return [sub];
      }
      throw new BadRequestException('ไม่พบรายการตรวจที่เปิดใช้งาน: ' + code);
    };
    return items.map((item) => {
      const panel =
        item.catalogType === 'panel'
          ? panels.find((p) => p.panelCode === item.testCode)
          : undefined;
      const deptValue = panel?.department || item.department;
      const dept =
        departments.find(
          (d) =>
            d.id === deptValue ||
            d.departmentCode === deptValue ||
            d.departmentName === deptValue,
        ) || departments.find((d) => d.departmentCode === 'GEN');
      if (!dept)
        throw new BadRequestException('กรุณาตั้งค่าแผนกสำหรับรายการตรวจ');
      const subtests = expand(item.testCode, item.catalogType);
      if (!subtests.length)
        throw new BadRequestException(
          'รายการตรวจไม่มีสมาชิก: ' + item.testCode,
        );
      return { ...item, departmentId: dept.id, subtests };
    });
  }

  async createSamples(
    tx: Prisma.TransactionClient,
    orderId: string,
    items: any[],
    urgentStatus = 'NORMAL',
  ) {
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { parentSite: true },
    });
    const pattern = order.parentSite.lnPattern || '{yy}{MM}{DD}{SEQ}';
    const samples = [];
    for (const item of items) {
      const labNumber = await nextLabNumber(tx, pattern);
      const sample = await tx.sample.create({
        data: {
          orderId,
          labNumber,
          barcode: labNumber,
          specimenType: item.specimenType || '',
          profileTestName: item.testName,
          urgentStatus,
          status: SpecimenStatus.REGISTERED,
        },
      });
      for (const sub of item.subtests) {
        const hasRange =
          sub.low !== undefined &&
          sub.low !== null &&
          sub.low !== '' &&
          sub.high !== undefined &&
          sub.high !== null &&
          sub.high !== '';
        await tx.testResult.create({
          data: {
            sampleId: sample.id,
            departmentId: item.departmentId,
            testPanel: item.testCode,
            testName: sub.name || sub.code,
            unit: sub.unit || '',
            referenceRange: hasRange
              ? String(sub.low) + ' - ' + String(sub.high)
              : '',
            testResult: null,
            repeatResult: null,
            lastResult: null,
            status: 'PENDING',
          },
        });
      }
      samples.push(sample);
    }
    return samples;
  }
}
