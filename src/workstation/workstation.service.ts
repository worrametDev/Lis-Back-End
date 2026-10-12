import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ResultFlag, SpecimenStatus, OrderStatus } from '@prisma/client';

@Injectable()
export class WorkstationService {
  constructor(private readonly prisma: PrismaService) {}

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
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return samples.map((s, idx) => ({
      no: idx + 1,
      hn: s.order.hn,
      labNo: s.labNumber,
      sampleId: s.id,
      patientName: s.order.patientName,
      clientSite: s.order.clientSite?.siteName || 'โรงพยาบาลส่งเสริมสุขภาพตำบลทุ่งแสลงหลวง',
      ward: s.order.ward?.wardName || 'OPD',
      specimenType: s.specimenType,
      status: s.status,
    }));
  }

  async getResults(sampleId: string) {
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

    return results.map((r) => {
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
        lastResult: r.lastResult || '',
        unit: r.unit || '',
        refRange: r.referenceRange || '',
        repeatResult: r.repeatResult || '',
        isApproved: r.isApproved,
      };
    });
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
    for (const item of items) {
      const current = await this.prisma.testResult.findUnique({ where: { id: item.id } });
      if (!current) continue;

      let flagEnum = current.flag;
      if (item.flag) {
        if (item.flag === 'H') flagEnum = ResultFlag.HIGH;
        else if (item.flag === 'A') flagEnum = ResultFlag.ABNORMAL;
        else flagEnum = ResultFlag.NORMAL;
      } else if (item.testResult) {
        flagEnum = this.calculateFlag(item.testResult, current.referenceRange || '');
      }

      const res = await this.prisma.testResult.update({
        where: { id: item.id },
        data: {
          testResult: item.testResult ?? current.testResult,
          repeatResult: item.repeatResult ?? current.repeatResult,
          flag: flagEnum,
        },
      });
      updated.push(res);
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

    let sampleId = data.sampleId;
    if (data.resultIds && data.resultIds.length > 0) {
      await this.prisma.testResult.updateMany({
        where: { id: { in: data.resultIds } },
        data: {
          isApproved: true,
          approvedAt: new Date(),
          approvedById: data.approvedById,
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
          approvedById: data.approvedById,
        },
      });
    }

    if (sampleId) {
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

    return {
      success: true,
      message: `ลบผลตรวจ ${data.resultIds.length} รายการเรียบร้อยแล้ว`,
    };
  }

  async reStatus(data: { resultIds: string[]; reason: string; targetStatus?: string; userAccount?: string; sampleId?: string }) {
    if (!data.reason) throw new BadRequestException('กรุณาระบุเหตุผลการปรับสถานะ (ตาม ISO 15189)');

    if (data.sampleId) {
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
