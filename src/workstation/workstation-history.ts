import { NotFoundException } from '@nestjs/common';
import { SpecimenStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export async function loadPatientHistory(
  prisma: PrismaService,
  sampleId: string,
  page = 1,
  pageSize = 20,
) {
  const current = await prisma.sample.findUnique({
    where: { id: sampleId },
    include: { order: true },
  });
  if (!current) throw new NotFoundException('ไม่พบสิ่งส่งตรวจ');
  const safePage = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
  const safePageSize = Number.isFinite(pageSize)
    ? Math.min(100, Math.max(1, Math.floor(pageSize)))
    : 20;
  const where = {
    order: {
      hn: current.order.hn,
      clientSiteId: current.order.clientSiteId,
    },
    status: { in: [SpecimenStatus.VERIFIED, SpecimenStatus.APPROVED] },
  };
  const [samples, total] = await Promise.all([
    prisma.sample.findMany({
      where: {
        ...where,
      },
      include: {
        order: { include: { ward: true } },
        testResults: {
          where: { isVoided: false, testResult: { not: null } },
          include: { department: true, approvedBy: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (safePage - 1) * safePageSize,
      take: safePageSize,
    }),
    prisma.sample.count({ where }),
  ]);
  const data = samples
    .filter((s) => s.testResults.length > 0)
    .map((s) => {
      const approved = s.testResults.find((r) => r.approvedBy);
      return {
        visitDate: s.createdAt.toISOString(),
        labNo: s.labNumber,
        specimenType: s.specimenType,
        ward: s.order.ward?.wardName || '',
        status: s.status === 'APPROVED' ? 'Approved' : 'Reported',
        approvedBy: approved?.approvedBy
          ? [approved.approvedBy.firstName, approved.approvedBy.lastName]
              .join(' ')
              .trim()
          : '',
        approvedAt: approved?.approvedAt?.toISOString() || '',
        items: s.testResults.map((r) => ({
          testName: r.testName,
          dept: r.department.departmentName,
          testResult: r.testResult,
          unit: r.unit || '',
          refRange: r.referenceRange || '',
          flag:
            r.flag === 'HIGH'
              ? 'H'
              : r.flag === 'LOW'
                ? 'L'
                : r.flag === 'ABNORMAL'
                  ? 'A'
                  : 'N',
        })),
      };
    });
  return {
    data,
    meta: {
      page: safePage,
      pageSize: safePageSize,
      total,
      totalPages: Math.ceil(total / safePageSize),
    },
  };
}
