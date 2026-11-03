import { NotFoundException } from '@nestjs/common';
import { SpecimenStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export async function loadPatientHistory(
  prisma: PrismaService,
  sampleId: string,
) {
  const current = await prisma.sample.findUnique({
    where: { id: sampleId },
    include: { order: true },
  });
  if (!current) throw new NotFoundException('ไม่พบสิ่งส่งตรวจ');
  const samples = await prisma.sample.findMany({
    where: {
      order: {
        hn: current.order.hn,
        clientSiteId: current.order.clientSiteId,
      },
      status: { in: [SpecimenStatus.VERIFIED, SpecimenStatus.APPROVED] },
    },
    include: {
      order: { include: { ward: true } },
      testResults: {
        where: { isVoided: false, testResult: { not: null } },
        include: { department: true, approvedBy: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return samples
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
}
