import { Injectable, BadRequestException, NotFoundException, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';
import { ResultFlag, SpecimenStatus, OrderStatus } from '@prisma/client';

@Injectable()
export class WorkstationService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async getQueue() {
    const samples = await this.prisma.sample.findMany({
      where: {
        status: { in: [SpecimenStatus.REGISTERED, SpecimenStatus.RECEIVED, SpecimenStatus.IN_PROCESS, SpecimenStatus.VERIFIED] },
      },
      include: {
        order: {
          include: {
            clientSite: true,
            ward: true,
            samples: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return samples.map((s, idx) => {
      // In case an order has multiple samples / specimen types, join distinct values with a comma
      const orderSpecimenTypes = s.order?.samples && s.order.samples.length > 0
        ? Array.from(new Set(s.order.samples.map((sm) => sm.specimenType).filter(Boolean))).join(', ')
        : s.specimenType;

      return {
        no: idx + 1,
        hn: s.order.hn,
        labNo: s.labNumber,
        sampleId: s.id,
        patientName: s.order.patientName,
        clientSite: s.order.clientSite?.siteName || 'โรงพยาบาลส่งเสริมสุขภาพตำบลทุ่งแสลงหลวง',
        ward: s.order.ward?.wardName || 'OPD',
        specimenType: orderSpecimenTypes || s.specimenType,
        status: s.status,
      };
    });
  }

  async getResults(sampleId: string) {
    const cacheKey = `workstation_results_${sampleId}`;
    const cached = await this.cacheManager.get<any[]>(cacheKey);
    if (cached) return cached;

    // 1. ค้นหาข้อมูล Sample ปัจจุบัน พร้อม Order และ Client Site
    const currentSample = await this.prisma.sample.findUnique({
      where: { id: sampleId },
      include: {
        order: {
          include: {
            clientSite: true,
          },
        },
      },
    });

    const clientSiteCode = currentSample?.order?.clientSite?.siteCode;
    const clientSiteId = currentSample?.order?.clientSiteId;
    const hn = currentSample?.order?.hn;

    const results = await this.prisma.testResult.findMany({
      where: {
        sampleId,
        isVoided: false,
      },
      include: {
        department: true,
      },
      orderBy: [
        { department: { departmentCode: 'asc' } },
        { testPanel: 'asc' },
        { createdAt: 'asc' },
      ],
    });

    // 2. Optimization: Batch fetch all historical previous tests for this patient in ONE single query!
    const previousTestMap = new Map<string, string>();
    if (results.length > 0 && hn && (clientSiteCode || clientSiteId)) {
      const testNames = Array.from(new Set(results.map((r) => r.testName)));
      const previousTests = await this.prisma.testResult.findMany({
        where: {
          testName: { in: testNames },
          isVoided: false,
          testResult: { not: null },
          sample: {
            id: { not: sampleId },
            order: {
              hn,
              ...(clientSiteId ? { clientSiteId } : {}),
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      for (const pt of previousTests) {
        if (!previousTestMap.has(pt.testName) && pt.testResult) {
          previousTestMap.set(pt.testName, pt.testResult);
        }
      }
    }

    const resolvedResults = results.map((r) => {
      const lastResultValue = r.lastResult || previousTestMap.get(r.testName) || '-';

      let flagChar: 'H' | 'A' | 'N' = 'N';
      if (r.flag === ResultFlag.HIGH) flagChar = 'H';
      else if (r.flag === ResultFlag.ABNORMAL || r.flag === ResultFlag.LOW) flagChar = 'A';

      return {
        id: r.id,
        dept: r.department?.departmentName || 'DEPT: HEMATOLOGY',
        panel: r.testPanel,
        testName: r.testName,
        testResult: r.testResult || '',
        flag: flagChar,
        lastResult: lastResultValue,
        unit: r.unit || '',
        refRange: r.referenceRange || '',
        repeatResult: r.repeatResult || '',
        isApproved: r.isApproved,
      };
    });

    await this.cacheManager.set(cacheKey, resolvedResults, 30 * 1000);
    return resolvedResults;
  }

  private calculateFlag(valStr?: string, refRange?: string): ResultFlag {
    if (!valStr || !refRange) return ResultFlag.NORMAL;
    const val = parseFloat(valStr);
    if (isNaN(val)) return ResultFlag.NORMAL;

    // Check if range is like "4.00 - 10.00"
    const parts = refRange.split('-').map((s) => parseFloat(s.trim()));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      const [low, high] = parts;
      if (val < low) return ResultFlag.ABNORMAL;
      if (val > high) return ResultFlag.HIGH;
      return ResultFlag.NORMAL;
    }
    return ResultFlag.NORMAL;
  }

  async updateResults(items: { id: string; testResult?: string; repeatResult?: string; flag?: 'H' | 'A' | 'N' }[]) {
    if (!items || items.length === 0) {
      throw new BadRequestException('ไม่มีรายการผลตรวจที่ต้องการบันทึก');
    }

    const updated = [];
    const affectedSampleIds = new Set<string>();
    for (const item of items) {
      const current = await this.prisma.testResult.findUnique({ where: { id: item.id } });
      if (!current) continue;
      affectedSampleIds.add(current.sampleId);

      let finalTestResult = item.testResult ?? current.testResult;
      let finalRepeatResult = item.repeatResult ?? current.repeatResult;

      // กรณี ตรวจซ้ำ (repeat) แล้วส่งผลมา:
      // - ถ้าในช่อง TEST RESULT มีค่าอยู่แล้ว ให้มาลงในช่อง REPEAT RESULT แทน
      // - แต่ถ้าช่อง TEST RESULT ว่าง (เช่น กรณี DELETE RESULT ให้เป็นช่องว่างก่อน) ให้ไปลงช่อง TEST RESULT แทนที่ช่อง REPEAT RESULT
      if (item.repeatResult !== undefined && item.repeatResult !== null && item.repeatResult !== '') {
        const hasExistingTestResult = current.testResult && current.testResult.trim() !== '';
        if (hasExistingTestResult && item.testResult === undefined) {
          finalRepeatResult = item.repeatResult;
          finalTestResult = current.testResult;
        } else if (!hasExistingTestResult && (item.testResult === undefined || item.testResult === '')) {
          finalTestResult = item.repeatResult;
          finalRepeatResult = '';
        }
      }

      let flagEnum = current.flag;
      if (item.flag) {
        if (item.flag === 'H') flagEnum = ResultFlag.HIGH;
        else if (item.flag === 'A') flagEnum = ResultFlag.ABNORMAL;
        else flagEnum = ResultFlag.NORMAL;
      } else if (finalTestResult) {
        flagEnum = this.calculateFlag(finalTestResult, current.referenceRange || '');
      }

      const res = await this.prisma.testResult.update({
        where: { id: item.id },
        data: {
          testResult: finalTestResult,
          repeatResult: finalRepeatResult,
          flag: flagEnum,
        },
      });
      updated.push(res);
    }

    for (const sId of affectedSampleIds) {
      await this.cacheManager.del(`workstation_results_${sId}`);
    }

    return {
      success: true,
      updatedCount: updated.length,
      message: `บันทึกผลตรวจแล็บเรียบร้อยแล้ว ${updated.length} รายการ`,
    };
  }

  async approve(data: { sampleId?: string; resultIds?: string[]; approvedById?: string }) {
    if (!data.sampleId && (!data.resultIds || data.resultIds.length === 0)) {
      throw new BadRequestException('กรุณาระบุ Sample ID หรือ Result IDs ที่ต้องการอนุมัติ');
    }

    let userUuid: string | undefined = undefined;
    if (data.approvedById) {
      const user = await this.prisma.user.findFirst({
        where: {
          OR: [
            { id: data.approvedById },
            { username: data.approvedById },
          ],
        },
      });
      if (user) {
        userUuid = user.id;
      }
    }

    let sampleId = data.sampleId;
    if (data.resultIds && data.resultIds.length > 0) {
      await this.prisma.testResult.updateMany({
        where: { id: { in: data.resultIds } },
        data: {
          isApproved: true,
          approvedAt: new Date(),
          approvedById: userUuid,
        },
      });
      if (!sampleId) {
        const first = await this.prisma.testResult.findUnique({ where: { id: data.resultIds[0] } });
        if (first) sampleId = first.sampleId;
      }
    } else if (sampleId) {
      await this.prisma.testResult.updateMany({
        where: { sampleId },
        data: {
          isApproved: true,
          approvedAt: new Date(),
          approvedById: userUuid,
        },
      });
    }

    if (sampleId) {
      await this.cacheManager.del(`workstation_results_${sampleId}`);
      await this.cacheManager.del('dashboard_stats');
      await this.prisma.sample.update({
        where: { id: sampleId },
        data: { status: SpecimenStatus.APPROVED },
      });
      const s = await this.prisma.sample.findUnique({ where: { id: sampleId } });
      if (s) {
        await this.prisma.order.update({
          where: { id: s.orderId },
          data: { status: OrderStatus.COMPLETED },
        });
      }
    }

    return {
      success: true,
      message: 'อนุมัติผลตรวจทางห้องปฏิบัติการเรียบร้อยแล้ว (Approved)',
    };
  }

  async voidResult(id: string, reason: string) {
    if (!reason) throw new BadRequestException('กรุณาระบุเหตุผลการยกเลิกผลแล็บ (ตาม ISO 15189)');
    return this.prisma.testResult.update({
      where: { id },
      data: {
        isVoided: true,
        voidReason: reason,
        voidedAt: new Date(),
      },
    });
  }

  async deleteResults(data: { resultIds: string[]; reason: string; userAccount?: string; sampleId?: string }) {
    if (!data.reason) throw new BadRequestException('กรุณาระบุเหตุผลการลบผลตรวจแล็บ (ตาม ISO 15189)');
    if (!data.resultIds || data.resultIds.length === 0) {
      throw new BadRequestException('กรุณาเลือกรายการที่ต้องการลบ');
    }

    await this.prisma.testResult.updateMany({
      where: { id: { in: data.resultIds } },
      data: {
        isVoided: true,
        voidReason: data.reason,
        voidedAt: new Date(),
      },
    });

    try {
      await this.prisma.auditLog.create({
        data: {
          action: 'DELETE_TEST_RESULTS',
          entityType: 'TestResult',
          entityId: data.sampleId || data.resultIds[0],
          newValues: {
            resultIds: data.resultIds,
            reason: data.reason,
            userAccount: data.userAccount,
          },
        },
      });
    } catch {}

    if (data.sampleId) {
      await this.cacheManager.del(`workstation_results_${data.sampleId}`);
    }

    return {
      success: true,
      message: `ลบผลตรวจ ${data.resultIds.length} รายการเรียบร้อยแล้ว`,
    };
  }

  async reStatus(data: { resultIds: string[]; reason: string; targetStatus?: string; userAccount?: string; sampleId?: string }) {
    if (!data.reason) throw new BadRequestException('กรุณาระบุเหตุผลการปรับสถานะ (ตาม ISO 15189)');

    if (data.sampleId) {
      await this.cacheManager.del(`workstation_results_${data.sampleId}`);
      const targetSpecimenStatus = data.targetStatus
        ? (data.targetStatus as SpecimenStatus)
        : SpecimenStatus.IN_PROCESS;

      await this.prisma.sample.update({
        where: { id: data.sampleId },
        data: { status: targetSpecimenStatus },
      });
    }

    if (data.resultIds && data.resultIds.length > 0) {
      await this.prisma.testResult.updateMany({
        where: { id: { in: data.resultIds } },
        data: {
          isApproved: false,
          approvedAt: null,
          approvedById: null,
        },
      });
    }

    try {
      await this.prisma.auditLog.create({
        data: {
          action: 'RE_STATUS',
          entityType: 'Sample',
          entityId: data.sampleId || (data.resultIds?.[0] ?? ''),
          newValues: {
            resultIds: data.resultIds,
            reason: data.reason,
            targetStatus: data.targetStatus,
            userAccount: data.userAccount,
          },
        },
      });
    } catch {}

    return {
      success: true,
      message: 'ปรับสถานะเรียบร้อยแล้ว',
    };
  }
}
