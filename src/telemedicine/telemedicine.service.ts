import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  TelemedicinePriority,
  TelemedicineQueueStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateConsultationDto,
  CreateQueueDto,
  UpdateQueueDto,
  UpdateSettingsDto,
} from './dto/telemedicine.dto';

const statusToApi: Record<TelemedicineQueueStatus, string> = {
  WAITING_TRIAGE: 'รอพบแพทย์',
  READY: 'รับคิวแล้ว',
  IN_CONSULTATION: 'กำลังปรึกษา',
  COMPLETED: 'เสร็จสิ้น',
  CANCELLED: 'CANCELLED',
};

@Injectable()
export class TelemedicineService {
  constructor(private readonly prisma: PrismaService) {}

  async assertAccess(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.userStatus !== 'ACTIVE')
      throw new ForbiddenException('บัญชีผู้ใช้ไม่พร้อมใช้งาน');
    if (!user.telemedicineAccess)
      throw new ForbiddenException(
        'บัญชีนี้ไม่มีสิทธิ์เข้าใช้งาน Telemedicine',
      );
    return user;
  }

  private parseStatus(value?: string): TelemedicineQueueStatus | undefined {
    if (!value || value === 'ทั้งหมด') return undefined;
    const status = Object.entries(statusToApi).find(
      ([key, label]) => key === value || label === value,
    )?.[0];
    if (!status) throw new BadRequestException('สถานะคิวไม่ถูกต้อง');
    return status as TelemedicineQueueStatus;
  }

  private formatQueue(queue: any) {
    return {
      id: queue.id,
      queueNo: queue.queueNumber,
      time: queue.createdAt.toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      patientName: queue.patientName,
      hn: queue.hn,
      ageGender: queue.ageGender || '- / ไม่ระบุ',
      chiefComplaint: queue.chiefComplaint,
      priority: queue.priority === 'URGENT' ? 'Urgent' : 'Normal',
      status: statusToApi[queue.status as TelemedicineQueueStatus],
      doctor: queue.assignedDoctor
        ? `${queue.assignedDoctor.firstName} ${queue.assignedDoctor.lastName}`.trim()
        : 'รอแพทย์รับคิว',
      actionText:
        queue.status === 'IN_CONSULTATION'
          ? 'เปิดเคส'
          : queue.status === 'COMPLETED'
            ? 'ดูสรุป'
            : queue.status === 'WAITING_TRIAGE'
              ? 'คัดกรอง'
              : 'เริ่ม Call',
      originSite: queue.clientSite.siteName,
      clientSite: queue.clientSite.siteName,
      parentSite: queue.parentSite.siteName,
      roomName: queue.roomName || undefined,
      phone: queue.phone || '-',
      createdAt: queue.createdAt.toISOString(),
    };
  }

  private queueInclude = {
    parentSite: true,
    clientSite: true,
    assignedDoctor: true,
  } satisfies Prisma.TelemedicineQueueInclude;

  async findQueues(userId: string, search?: string, status?: string) {
    await this.assertAccess(userId);
    const parsedStatus = this.parseStatus(status);
    const queues = await this.prisma.telemedicineQueue.findMany({
      where: {
        ...(parsedStatus ? { status: parsedStatus } : {}),
        ...(search
          ? {
              OR: [
                { queueNumber: { contains: search, mode: 'insensitive' } },
                { hn: { contains: search, mode: 'insensitive' } },
                { patientName: { contains: search, mode: 'insensitive' } },
                { chiefComplaint: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: this.queueInclude,
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
    return queues.map((queue) => this.formatQueue(queue));
  }

  async createQueue(userId: string, dto: CreateQueueDto) {
    const user = await this.assertAccess(userId);
    const order = dto.orderId
      ? await this.prisma.order.findUnique({ where: { id: dto.orderId } })
      : await this.prisma.order.findFirst({
          where: { hn: dto.hn },
          orderBy: { createdAt: 'desc' },
        });
    const clientSiteId =
      dto.clientSiteId || order?.clientSiteId || user.clientSiteId;
    const parentSiteId =
      dto.parentSiteId || order?.parentSiteId || user.parentSiteId;
    if (!clientSiteId || !parentSiteId)
      throw new BadRequestException('กรุณาระบุ Parent Site และ Client Site');
    const count = await this.prisma.telemedicineQueue.count({
      where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
    });
    const queue = await this.prisma.telemedicineQueue.create({
      data: {
        queueNumber: `Q-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(count + 1).padStart(3, '0')}`,
        orderId: order?.id,
        hn: dto.hn,
        patientName: dto.patientName || order?.patientName || 'ไม่ระบุชื่อ',
        ageGender:
          dto.ageGender ||
          [order?.age, order?.gender].filter(Boolean).join(' / '),
        phone: dto.phone || order?.telephone,
        chiefComplaint: dto.chiefComplaint,
        priority:
          dto.priority?.toUpperCase() === 'URGENT' ? 'URGENT' : 'NORMAL',
        parentSiteId,
        clientSiteId,
        createdById: userId,
        triageData: dto.triageData as Prisma.InputJsonValue,
      },
      include: this.queueInclude,
    });
    return this.formatQueue(queue);
  }

  async updateQueue(userId: string, id: string, dto: UpdateQueueDto) {
    await this.assertAccess(userId);
    const status = this.parseStatus(dto.status);
    let assignedDoctorId = dto.assignedDoctorId;
    if (!assignedDoctorId && dto.doctor) {
      const doctor = await this.prisma.user.findFirst({
        where: {
          telemedicineAccess: true,
          OR: [
            { username: dto.doctor },
            { firstName: { contains: dto.doctor, mode: 'insensitive' } },
          ],
        },
      });
      assignedDoctorId = doctor?.id;
    }
    const queue = await this.prisma.telemedicineQueue.update({
      where: { id },
      data: {
        ...(status ? { status } : {}),
        ...(assignedDoctorId ? { assignedDoctorId } : {}),
        ...(dto.chiefComplaint !== undefined
          ? { chiefComplaint: dto.chiefComplaint }
          : {}),
        ...(dto.ageGender !== undefined ? { ageGender: dto.ageGender } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.priority
          ? { priority: dto.priority.toUpperCase() as TelemedicinePriority }
          : {}),
        ...(dto.triageData
          ? { triageData: dto.triageData as Prisma.InputJsonValue }
          : {}),
        ...(status === 'IN_CONSULTATION' ? { startedAt: new Date() } : {}),
        ...(status === 'COMPLETED' ? { completedAt: new Date() } : {}),
        ...(status === 'CANCELLED' ? { cancelledAt: new Date() } : {}),
      },
      include: this.queueInclude,
    });
    return this.formatQueue(queue);
  }

  async cancelQueue(userId: string, id: string) {
    return this.updateQueue(userId, id, { status: 'CANCELLED' });
  }

  async dashboard(userId: string) {
    await this.assertAccess(userId);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const queues = await this.prisma.telemedicineQueue.findMany({
      where: { createdAt: { gte: start } },
      select: {
        status: true,
        priority: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
      },
    });
    const completed = queues.filter((q) => q.status === 'COMPLETED');
    const durations = completed
      .map(
        (q) =>
          (q.completedAt!.getTime() - (q.startedAt || q.createdAt).getTime()) /
          60000,
      )
      .filter((minutes) => minutes >= 0);
    return {
      totalWaiting: queues.filter((q) =>
        ['WAITING_TRIAGE', 'READY'].includes(q.status),
      ).length,
      inConsultation: queues.filter((q) => q.status === 'IN_CONSULTATION')
        .length,
      completedToday: completed.length,
      urgentCases: queues.filter(
        (q) => q.priority === 'URGENT' && q.status !== 'COMPLETED',
      ).length,
      averageTimeMin: durations.length
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : 0,
    };
  }

  async patient(userId: string, hn: string) {
    await this.assertAccess(userId);
    const order = await this.prisma.order.findFirst({
      where: { hn },
      include: {
        clientSite: true,
        parentSite: true,
        samples: {
          include: {
            testResults: {
              where: { isVoided: false },
              orderBy: { createdAt: 'desc' },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    const pastQueues = await this.prisma.telemedicineQueue.findMany({
      where: { hn },
      include: { clientSite: true, parentSite: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const queue = pastQueues[0] || null;
    if (!order && !queue) {
      throw new NotFoundException('ไม่พบข้อมูลผู้ป่วยใน LIS หรือ Telemedicine');
    }
    const vitalsHistory = pastQueues
      .map((q) => {
        const t = (q.triageData || {}) as Record<string, any>;
        return {
          id: q.id,
          queueNo: q.queueNumber,
          recordedAt: t.recordedAt || q.createdAt.toISOString(),
          bp: t.bp || '-',
          hr: Number(t.hr || 0),
          temp: Number(t.temp || 0),
          rr: Number(t.rr || 0),
          spo2: Number(t.spo2 || 0),
          site: q.clientSite?.siteName || '-',
        };
      })
      .filter((v) => (v.bp && v.bp !== '-') || v.hr > 0 || v.temp > 0);

    if (!order && queue) {
      const vitals = (queue.triageData || {}) as Record<string, any>;
      return {
        hn: queue.hn,
        patientName: queue.patientName,
        ageGender: queue.ageGender || '-',
        phone: queue.phone || '-',
        idCard: undefined,
        entitlement: '-',
        queueNo: queue.queueNumber,
        siteName: queue.clientSite?.siteName || '-',
        clientSite: queue.clientSite?.siteName || '-',
        clientSiteId: queue.clientSiteId,
        parentSite: queue.parentSite?.siteName || '-',
        parentSiteId: queue.parentSiteId,
        chiefComplaint: queue.chiefComplaint || '-',
        vitals: {
          bp: vitals.bp || '-',
          hr: Number(vitals.hr || 0),
          temp: Number(vitals.temp || 0),
          rr: Number(vitals.rr || 0),
          spo2: Number(vitals.spo2 || 0),
          recordedAt: vitals.recordedAt || queue.updatedAt.toISOString(),
        },
        vitalsHistory,
        labResults: [],
      };
    }
    const vitals = (queue?.triageData || {}) as Record<string, any>;
    return {
      hn: order.hn,
      patientName: order.patientName,
      ageGender: [order.age, order.gender].filter(Boolean).join(' / '),
      phone: order.telephone || '-',
      idCard: order.idCard || undefined,
      entitlement: order.entitlement || '-',
      queueNo: queue?.queueNumber || '-',
      siteName: order.clientSite.siteName,
      clientSite: order.clientSite.siteName,
      clientSiteId: order.clientSiteId,
      parentSite: order.parentSite.siteName,
      parentSiteId: order.parentSiteId,
      chiefComplaint: queue?.chiefComplaint || '-',
      vitals: {
        bp: vitals.bp || '-',
        hr: Number(vitals.hr || 0),
        temp: Number(vitals.temp || 0),
        rr: Number(vitals.rr || 0),
        spo2: Number(vitals.spo2 || 0),
        recordedAt: vitals.recordedAt || queue?.updatedAt.toISOString() || '',
      },
      vitalsHistory,
      labResults: order.samples.flatMap((sample) =>
        sample.testResults.map((result) => ({
          testName: result.testName,
          result: result.testResult || '-',
          unit: result.unit || '',
          refRange: result.referenceRange || '',
          flag:
            result.flag === 'ABNORMAL' ? 'A' : result.flag?.charAt(0) || 'N',
          status: result.isApproved ? 'APPROVED' : result.status || 'PENDING',
        })),
      ),
    };
  }

  async consultations(userId: string, search?: string) {
    await this.assertAccess(userId);
    const rows = await this.prisma.telemedicineConsultation.findMany({
      where: search
        ? {
            OR: [
              { consultationNumber: { contains: search, mode: 'insensitive' } },
              { queue: { hn: { contains: search, mode: 'insensitive' } } },
              {
                queue: {
                  patientName: { contains: search, mode: 'insensitive' },
                },
              },
            ],
          }
        : undefined,
      include: {
        doctor: true,
        queue: { include: { parentSite: true, clientSite: true } },
      },
      orderBy: { completedAt: 'desc' },
    });
    return rows.map((row) => this.formatConsultation(row));
  }

  private formatConsultation(row: any) {
    const rawDiag = (row.diagnosisCodes || {}) as Record<string, any>;
    const details = (rawDiag.details || rawDiag) as Record<string, any>;

    return {
      id: row.id,
      consultationId: row.consultationNumber,
      queueId: row.queueId,
      patientName: row.queue.patientName,
      hn: row.queue.hn,
      date: row.completedAt.toLocaleDateString('th-TH'),
      doctor: `${row.doctor.firstName} ${row.doctor.lastName}`.trim(),
      outcome: row.outcome || '-',
      status: row.queue?.status === 'COMPLETED' ? 'เสร็จสิ้น' : 'กำลังปรึกษา',
      noteStatus: details.noteStatus || (row.queue?.status === 'COMPLETED' ? 'closed' : 'draft'),
      roomName: row.queue.roomName || undefined,
      clientSite: row.queue.clientSite.siteName,
      parentSite: row.queue.parentSite.siteName,
      referral: details.referral || (row.referralSiteName ? 'ส่งต่อ' : 'ไม่ส่งต่อ'),
      referralSiteName: row.referralSiteName || details.referralSiteName || undefined,
      followUp: details.followUp || undefined,
      followUpDate: details.followUpDate || undefined,
      soap: {
        s: row.subjective,
        o: row.objective,
        a: row.assessment,
        p: row.plan,
        chiefComplaint: details.chiefComplaint || undefined,
        hpi: details.hpi || undefined,
        pe: details.pe || row.objective || undefined,
        assessment: details.assessment || row.assessment || undefined,
        planAdvice:
          details.planAdvice !== undefined && details.planAdvice !== null
            ? details.planAdvice
            : (row.plan || "")
                .replace(/\s*•\s*Follow-up:.*$/i, "")
                .replace(/\s*•\s*Referral:.*$/i, "")
                .trim(),
      },
      vitals: row.vitalSigns,
    };
  }

  async createConsultation(userId: string, dto: CreateConsultationDto) {
    await this.assertAccess(userId);
    const queue = dto.queueId
      ? await this.prisma.telemedicineQueue.findUnique({
          where: { id: dto.queueId },
        })
      : dto.hn
        ? await this.prisma.telemedicineQueue.findFirst({
            where: { hn: dto.hn },
            orderBy: { createdAt: 'desc' },
          })
        : null;
    if (!queue) throw new NotFoundException('ไม่พบคิว Telemedicine');

    const s =
      dto.soap?.s ||
      [dto.soap?.chiefComplaint, dto.soap?.hpi].filter(Boolean).join(': ') ||
      '';
    const o = dto.soap?.o || dto.soap?.pe || '';
    const a = dto.soap?.a || dto.soap?.assessment || '';
    const p = dto.soap?.p || dto.soap?.planAdvice || '';
    const referral =
      dto.referral ||
      dto.soap?.referral ||
      (dto.referralSiteName ? 'ส่งต่อ' : 'ไม่ส่งต่อ');
    const referralSiteName =
      dto.referralSiteName || dto.soap?.referralSiteName || null;
    const followUp = dto.followUp || dto.soap?.followUp || null;
    const followUpDate = dto.followUpDate || dto.soap?.followUpDate || null;

    const noteStatus =
      dto.noteStatus ||
      (dto.status === 'เสร็จสิ้น' || dto.status === 'COMPLETED'
        ? 'closed'
        : 'note');

    const clinicalDetails = {
      chiefComplaint: dto.soap?.chiefComplaint || '',
      hpi: dto.soap?.hpi || '',
      pe: dto.soap?.pe || '',
      assessment: dto.soap?.assessment || '',
      planAdvice: dto.soap?.planAdvice || '',
      followUp,
      followUpDate,
      referral,
      referralSiteName,
      noteStatus,
    };

    const result = await this.prisma.$transaction(async (tx) => {
      const count = await tx.telemedicineConsultation.count();
      const row = await tx.telemedicineConsultation.upsert({
        where: { queueId: queue.id },
        create: {
          consultationNumber: `CON-${new Date().getFullYear()}-${String(count + 1).padStart(6, '0')}`,
          queueId: queue.id,
          doctorId: userId,
          subjective: s,
          objective: o,
          assessment: a,
          plan: p,
          outcome: dto.outcome,
          referralSiteName,
          vitalSigns: dto.vitals as Prisma.InputJsonValue,
          diagnosisCodes: {
            details: clinicalDetails,
            codes: dto.diagnosisCodes || [],
          } as Prisma.InputJsonValue,
          prescriptions: dto.prescriptions as Prisma.InputJsonValue,
        },
        update: {
          doctorId: userId,
          subjective: s,
          objective: o,
          assessment: a,
          plan: p,
          outcome: dto.outcome,
          referralSiteName,
          vitalSigns: dto.vitals as Prisma.InputJsonValue,
          diagnosisCodes: {
            details: clinicalDetails,
            codes: dto.diagnosisCodes || [],
          } as Prisma.InputJsonValue,
          prescriptions: dto.prescriptions as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
        include: {
          doctor: true,
          queue: { include: { parentSite: true, clientSite: true } },
        },
      });
      const completed =
        dto.status === 'เสร็จสิ้น' || dto.status === 'COMPLETED';
      await tx.telemedicineQueue.update({
        where: { id: queue.id },
        data: completed
          ? { status: 'COMPLETED', completedAt: new Date() }
          : {
              status: 'IN_CONSULTATION',
              startedAt: queue.startedAt || new Date(),
            },
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: 'UPSERT_TELEMEDICINE_CONSULTATION',
          entityType: 'TelemedicineConsultation',
          entityId: row.id,
          newValues: { queueId: queue.id },
        },
      });
      return row;
    });
    return this.formatConsultation(result);
  }

  async getSettings(userId: string) {
    await this.assertAccess(userId);
    return (
      (await this.prisma.telemedicineSetting.findUnique({
        where: { id: 'default' },
      })) || { dropdownSettings: {}, generalSettings: {} }
    );
  }

  async updateSettings(userId: string, dto: UpdateSettingsDto) {
    const user = await this.assertAccess(userId);
    if (
      user.userRole !== 'SYSTEM_ADMINISTRATOR' &&
      user.telemedicineRole !== 'ADMIN'
    )
      throw new ForbiddenException(
        'เฉพาะผู้ดูแลระบบเท่านั้นที่แก้ไข Settings ได้',
      );
    return this.prisma.telemedicineSetting.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        dropdownSettings: dto.dropdownSettings as Prisma.InputJsonValue,
        generalSettings: dto.generalSettings as Prisma.InputJsonValue,
        updatedById: userId,
      },
      update: {
        dropdownSettings: dto.dropdownSettings as Prisma.InputJsonValue,
        generalSettings: dto.generalSettings as Prisma.InputJsonValue,
        updatedById: userId,
      },
    });
  }
}
