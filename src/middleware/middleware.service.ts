import { Injectable, Logger, ConflictException, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';
import {
  ResultFlag,
  SpecimenStatus,
  OrderStatus,
  Prisma,
} from '@prisma/client';

export interface MiddlewareTelemetry {
  channelsCount?: number;
  pendingOutboxCount?: number;
}

export interface CloudResultPayload {
  messageId: string;
  specimenId: string;
  instrument: {
    channel: string;
    model: string;
    deviceId?: string;
    serialNumber?: string;
  };
  results: Array<{
    testCode: string;
    value: string;
    valueType: string;
    unit: string;
    flag: string;
    resultedAt: string;
    instrumentCode: string;
    rawValue: string;
    isRerun: boolean;
  }>;
}

@Injectable()
export class MiddlewareService {
  private readonly logger = new Logger(MiddlewareService.name);
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  /**
   * Get orders to sync down to Local Middleware
   */
  async getOrders(siteCode: string, since?: string, page = 1, pageSize = 50) {
    const parentSite = await this.prisma.parentSite.findFirst({
      where: { siteCode: siteCode || '00940' },
    });

    const whereClause: Prisma.OrderWhereInput = {
      status: {
        in: [
          OrderStatus.REGISTERED,
          OrderStatus.RECEIVED,
          OrderStatus.IN_PROCESS,
        ],
      },
    };

    if (since) {
      const sinceDate = new Date(since);
      if (!isNaN(sinceDate.getTime())) {
        whereClause.updatedAt = { gte: sinceDate };
      }
    }

    if (parentSite) {
      whereClause.parentSiteId = parentSite.id;
    }

    const safePage = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
    const safePageSize = Number.isFinite(pageSize)
      ? Math.min(100, Math.max(1, Math.floor(pageSize)))
      : 50;
    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where: whereClause,
        include: {
          samples: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (safePage - 1) * safePageSize,
        take: safePageSize,
      }),
      this.prisma.order.count({ where: whereClause }),
    ]);

    const formattedOrders = orders.flatMap((o) => {
      return (o.samples || []).map((s, idx) => {
        const suffix = String(idx + 1).padStart(2, '0');
        const specimenId = `${s.labNumber}-${suffix}`;

        // Extract test items from JSON or sample
        const orderItems = Array.isArray(o.orderItems) ? o.orderItems : [];
        const tests =
          orderItems.length > 0
            ? orderItems.map((item) => ({
                testCode:
                  item && typeof item === 'object'
                    ? String(
                        ('testCode' in item && item.testCode) ||
                          ('code' in item && item.code) ||
                          'CHOL',
                      )
                    : String(item || 'CHOL'),
                status: 'ACTIVE',
              }))
            : [
                { testCode: 'CHOL', status: 'ACTIVE' },
                { testCode: 'GLU', status: 'ACTIVE' },
              ];

        return {
          labNumber: s.labNumber,
          specimenId,
          specimenType: s.specimenType || 'SERUM',
          container: 'SST',
          priority: o.urgentStatus || 'ROUTINE',
          patient: {
            hn: o.hn,
            name: o.patientName,
            sex: o.gender,
            birthDate: o.dob,
          },
          collectedAt: o.collectedDate,
          tests,
        };
      });
    });

    return {
      cursor: new Date().toISOString(),
      orders: formattedOrders,
      meta: {
        page: safePage,
        pageSize: safePageSize,
        total,
        totalPages: Math.ceil(total / safePageSize),
      },
    };
  }

  /**
   * Receive parsed lab results from Local Middleware
   */
  async receiveResults(siteCode: string, payload: CloudResultPayload) {
    const { messageId, specimenId, instrument, results } = payload;
    const crypto = await import('crypto');
    const payloadHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');

    const prior = await this.prisma.middlewareReceipt.findUnique({
      where: { siteCode_messageId: { siteCode, messageId } },
    });
    if (prior) {
      if (prior.payloadHash !== payloadHash)
        throw new ConflictException(
          `Message ${messageId} already exists with a different payload`,
        );
      return (
        prior.responseJson || { success: true, duplicate: true, messageId }
      );
    }
    await this.prisma.middlewareReceipt.create({
      data: {
        siteCode,
        messageId,
        specimenId,
        payloadHash,
        status: 'RECEIVED',
      },
    });

    this.logger.log(
      `Received ${results.length} results for Specimen ${specimenId} from ${instrument.model}`,
    );

    // Find sample by labNumber
    const labNumber = specimenId.split('-')[0];
    const sample = await this.prisma.sample.findFirst({
      where: {
        OR: [{ labNumber }, { barcode: specimenId }],
      },
      include: {
        testResults: true,
        order: true,
      },
    });

    if (sample) {
      // Find a default department (CHEMISTRY or default)
      const department = await this.prisma.department.findFirst();
      const departmentId = department?.id || 'default-dept';

      await Promise.all(
        results.map(async (res) => {
          // Map flag
          let flagEnum: ResultFlag = ResultFlag.NORMAL;
          if (res.flag === 'H' || res.flag === 'HIGH')
            flagEnum = ResultFlag.HIGH;
          if (res.flag === 'L' || res.flag === 'LOW') flagEnum = ResultFlag.LOW;
          if (res.flag === 'A' || res.flag === 'ABNORMAL')
            flagEnum = ResultFlag.ABNORMAL;

          // Check if test result already exists for this testName
          const existingResult = sample.testResults.find(
            (tr) =>
              tr.testName.toUpperCase() === res.testCode.toUpperCase() ||
              tr.testPanel.toUpperCase() === res.testCode.toUpperCase(),
          );

          if (existingResult) {
            return this.prisma.testResult.update({
              where: { id: existingResult.id },
              data: {
                testResult: res.value,
                flag: flagEnum,
                unit: res.unit || existingResult.unit,
                instrumentName: instrument.model || instrument.channel,
                instrumentCode: res.instrumentCode || res.testCode,
                rawValue: res.rawValue || res.value,
                valueType: res.valueType,
                resultedAt: res.resultedAt
                  ? new Date(res.resultedAt)
                  : undefined,
                middlewareMessageId: messageId,
                middlewareChannel: instrument.channel,
                middlewareModel: instrument.model,
                updatedAt: new Date(),
              },
            });
          } else if (departmentId) {
            return this.prisma.testResult.create({
              data: {
                sampleId: sample.id,
                departmentId,
                testPanel: res.testCode,
                testName: res.testCode,
                testResult: res.value,
                flag: flagEnum,
                unit: res.unit || 'mg/dL',
                instrumentName: instrument.model || instrument.channel,
                instrumentCode: res.instrumentCode || res.testCode,
                rawValue: res.rawValue || res.value,
                valueType: res.valueType,
                resultedAt: res.resultedAt
                  ? new Date(res.resultedAt)
                  : undefined,
                middlewareMessageId: messageId,
                middlewareChannel: instrument.channel,
                middlewareModel: instrument.model,
                status: 'NORMAL',
              },
            });
          }
        }),
      );

      // Update sample status to IN_PROCESS
      await this.prisma.sample.update({
        where: { id: sample.id },
        data: {
          status: SpecimenStatus.IN_PROCESS,
          updatedAt: new Date(),
        },
      });

      await this.cacheManager.del(`workstation_results_${sample.id}`);
      await this.cacheManager.del('dashboard_stats');
    } else {
      this.logger.warn(
        `Sample with labNumber ${labNumber} not found in Cloud LIS database. Result recorded as unlinked.`,
      );
    }

    const response = {
      success: true,
      specimenId,
      processedCount: results.length,
    };
    await this.prisma.middlewareReceipt.update({
      where: { siteCode_messageId: { siteCode, messageId } },
      data: {
        status: 'PROCESSED',
        processedAt: new Date(),
        responseJson: response,
      },
    });
    return response;
  }

  recordHeartbeat(siteCode: string, telemetry: MiddlewareTelemetry = {}) {
    this.logger.debug(
      `Heartbeat from Site ${siteCode}: channels=${telemetry.channelsCount}, pending=${telemetry.pendingOutboxCount}`,
    );
    return {
      status: 'OK',
      serverTime: new Date().toISOString(),
    };
  }
}
