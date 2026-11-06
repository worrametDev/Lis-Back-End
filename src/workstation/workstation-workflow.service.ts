import { BadRequestException, Injectable, Inject } from '@nestjs/common';
import { loadPatientHistory } from './workstation-history';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { SpecimenStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type CacheWithKeys = Cache & {
  store?: { keys?: (pattern: string) => Promise<string[]> };
};

@Injectable()
export class WorkstationWorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  history(sampleId: string) {
    return loadPatientHistory(this.prisma, sampleId);
  }

  async report(
    sampleId: string,
    items: { id: string; testResult: string }[],
    userId: string,
  ) {
    if (!sampleId || !items?.length || !userId)
      throw new BadRequestException('กรุณาเลือกผลตรวจและเข้าสู่ระบบ');
    const ids = items.map((item) => item.id);
    if (
      new Set(ids).size !== ids.length ||
      items.some((item) => !item.testResult?.trim())
    )
      throw new BadRequestException(
        'กรุณากรอกผลตรวจให้ครบและไม่เลือกรายการซ้ำ',
      );
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.testResult.findMany({
        where: { sampleId, id: { in: ids }, isVoided: false },
      });
      if (rows.length !== ids.length || rows.some((r) => r.isApproved))
        throw new BadRequestException('รายการผลตรวจไม่ถูกต้องหรืออนุมัติแล้ว');
      for (const item of items) {
        const row = rows.find((r) => r.id === item.id)!;
        const range = row.referenceRange?.match(
          /^\s*(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)\s*$/,
        );
        const value = Number(item.testResult);
        const flag =
          range && Number.isFinite(value)
            ? value < Number(range[1])
              ? 'LOW'
              : value > Number(range[2])
                ? 'HIGH'
                : 'NORMAL'
            : row.flag;
        await tx.testResult.update({
          where: { id: item.id },
          data: { testResult: item.testResult, flag, status: 'REPORTED' },
        });
      }
      const pending = await tx.testResult.count({
        where: {
          sampleId,
          isVoided: false,
          isApproved: false,
          status: { not: 'REPORTED' },
        },
      });
      await tx.sample.update({
        where: { id: sampleId },
        data: {
          status: pending ? SpecimenStatus.IN_PROCESS : SpecimenStatus.VERIFIED,
        },
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: 'REPORT_RESULTS',
          entityType: 'Sample',
          entityId: sampleId,
          newValues: { resultIds: ids },
        },
      });
    });
    await this.invalidate(sampleId);
    return { success: true };
  }

  async repeat(sampleId: string, resultIds: string[], userId: string) {
    if (!sampleId || !resultIds?.length || !userId)
      throw new BadRequestException('กรุณาเลือกรายการตรวจซ้ำและเข้าสู่ระบบ');
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.testResult.findMany({
        where: { sampleId, id: { in: resultIds }, isVoided: false },
      });
      if (
        rows.length !== new Set(resultIds).size ||
        rows.some((r) => r.isApproved)
      )
        throw new BadRequestException('รายการตรวจซ้ำไม่ถูกต้องหรืออนุมัติแล้ว');
      await tx.testResult.updateMany({
        where: { id: { in: resultIds } },
        data: { status: 'PENDING_REPEAT' },
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: 'REQUEST_REPEAT',
          entityType: 'Sample',
          entityId: sampleId,
          newValues: { resultIds },
        },
      });
    });
    await this.invalidate(sampleId);
    return { success: true, message: 'บันทึกคำขอตรวจซ้ำแล้ว' };
  }

  async approve(sampleId: string, resultIds: string[], userId: string) {
    if (!sampleId || !resultIds?.length || !userId)
      throw new BadRequestException('กรุณาเลือกผลตรวจที่จะอนุมัติ');
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.testResult.findMany({
        where: { sampleId, id: { in: resultIds }, isVoided: false },
      });
      if (
        rows.length !== new Set(resultIds).size ||
        rows.some((r) => r.isApproved || r.status !== 'REPORTED')
      )
        throw new BadRequestException('อนุมัติได้เฉพาะผลที่รายงานแล้ว');
      await tx.testResult.updateMany({
        where: { id: { in: resultIds } },
        data: {
          isApproved: true,
          approvedAt: new Date(),
          approvedById: userId,
        },
      });
      const pending = await tx.testResult.count({
        where: { sampleId, isVoided: false, isApproved: false },
      });
      const sample = await tx.sample.update({
        where: { id: sampleId },
        data: { status: pending ? 'VERIFIED' : 'APPROVED' },
      });
      const pendingSamples = await tx.sample.count({
        where: {
          orderId: sample.orderId,
          status: { notIn: ['APPROVED', 'REJECTED'] },
        },
      });
      await tx.order.update({
        where: { id: sample.orderId },
        data: { status: pendingSamples ? 'IN_PROCESS' : 'COMPLETED' },
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: 'APPROVE_RESULTS',
          entityType: 'Sample',
          entityId: sampleId,
          newValues: { resultIds },
        },
      });
    });
    await this.invalidate(sampleId);
    return { success: true };
  }

  async transferRepeat(sampleId: string, resultIds: string[], userId: string) {
    if (!sampleId || !resultIds?.length || !userId)
      throw new BadRequestException('กรุณาเลือกผลตรวจซ้ำ');
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.testResult.findMany({
        where: { sampleId, id: { in: resultIds }, isVoided: false },
      });
      if (
        rows.length !== new Set(resultIds).size ||
        rows.some((r) => r.isApproved || !r.repeatResult?.trim())
      )
        throw new BadRequestException('ไม่พบผลตรวจซ้ำที่โอนได้');
      for (const row of rows)
        await tx.testResult.update({
          where: { id: row.id },
          data: {
            testResult: row.repeatResult,
            repeatResult: '',
            status: 'PENDING',
          },
        });
      await tx.sample.update({
        where: { id: sampleId },
        data: { status: 'IN_PROCESS' },
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: 'TRANSFER_REPEAT',
          entityType: 'Sample',
          entityId: sampleId,
          oldValues: rows.map((r) => ({
            id: r.id,
            testResult: r.testResult,
            repeatResult: r.repeatResult,
          })),
          newValues: { resultIds },
        },
      });
    });
    await this.invalidate(sampleId);
    return { success: true };
  }

  async changeResults(
    body: {
      sampleId: string;
      resultIds: string[];
      reason: string;
      targetStatus?: string;
    },
    userId: string,
    voidResults = false,
  ) {
    const { sampleId, resultIds, reason } = body;
    if (!sampleId || !resultIds?.length || !reason?.trim() || !userId)
      throw new BadRequestException('กรุณาเลือกรายการและระบุเหตุผล');
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.testResult.findMany({
        where: { sampleId, id: { in: resultIds }, isVoided: false },
      });
      if (rows.length !== new Set(resultIds).size)
        throw new BadRequestException('รายการตรวจไม่ถูกต้อง');
      const status = body.targetStatus === 'REPORTED' ? 'REPORTED' : 'PENDING';
      await tx.testResult.updateMany({
        where: { id: { in: resultIds } },
        data: voidResults
          ? { isVoided: true, voidReason: reason, voidedAt: new Date() }
          : { isApproved: false, approvedAt: null, approvedById: null, status },
      });
      const sample = await tx.sample.update({
        where: { id: sampleId },
        data: {
          status:
            !voidResults && status === 'REPORTED' ? 'VERIFIED' : 'RECEIVED',
        },
      });
      await tx.order.update({
        where: { id: sample.orderId },
        data: { status: 'IN_PROCESS' },
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: voidResults ? 'VOID_RESULTS' : 'RE_STATUS',
          entityType: 'Sample',
          entityId: sampleId,
          newValues: {
            resultIds,
            reason,
            targetStatus: body.targetStatus || '',
          },
        },
      });
    });
    await this.invalidate(sampleId);
    return { success: true };
  }

  private async invalidate(sampleId: string) {
    for (const key of [
      'workstation_results_' + sampleId,
      'workstation_queue',
      'dashboard_stats',
      'samples_list_{}',
      'orders_list_{}',
    ])
      await this.cache.del(key);
    const store = (this.cache as CacheWithKeys).store;
    if (store && typeof store.keys === 'function') {
      const keys = await store.keys('workstation_queue_*');
      for (const key of keys) await this.cache.del(key);
    }
  }
}
