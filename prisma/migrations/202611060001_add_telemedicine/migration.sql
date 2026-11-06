CREATE TYPE "TelemedicineQueueStatus" AS ENUM ('WAITING_TRIAGE', 'READY', 'IN_CONSULTATION', 'COMPLETED', 'CANCELLED');
CREATE TYPE "TelemedicinePriority" AS ENUM ('NORMAL', 'URGENT');

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "telemedicineAccess" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "telemedicineRole" TEXT;

CREATE TABLE "TelemedicineQueue" (
  "id" TEXT NOT NULL,
  "queueNumber" TEXT NOT NULL,
  "orderId" TEXT,
  "hn" TEXT NOT NULL,
  "patientName" TEXT NOT NULL,
  "ageGender" TEXT,
  "phone" TEXT,
  "chiefComplaint" TEXT NOT NULL,
  "priority" "TelemedicinePriority" NOT NULL DEFAULT 'NORMAL',
  "status" "TelemedicineQueueStatus" NOT NULL DEFAULT 'WAITING_TRIAGE',
  "roomName" TEXT,
  "parentSiteId" TEXT NOT NULL,
  "clientSiteId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "assignedDoctorId" TEXT,
  "triageData" JSONB,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelemedicineQueue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TelemedicineConsultation" (
  "id" TEXT NOT NULL,
  "consultationNumber" TEXT NOT NULL,
  "queueId" TEXT NOT NULL,
  "doctorId" TEXT NOT NULL,
  "subjective" TEXT NOT NULL,
  "objective" TEXT NOT NULL,
  "assessment" TEXT NOT NULL,
  "plan" TEXT NOT NULL,
  "outcome" TEXT,
  "referralSiteName" TEXT,
  "vitalSigns" JSONB,
  "diagnosisCodes" JSONB,
  "prescriptions" JSONB,
  "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelemedicineConsultation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TelemedicineSetting" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "dropdownSettings" JSONB,
  "generalSettings" JSONB,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelemedicineSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelemedicineQueue_queueNumber_key" ON "TelemedicineQueue"("queueNumber");
CREATE INDEX "TelemedicineQueue_status_createdAt_idx" ON "TelemedicineQueue"("status", "createdAt" DESC);
CREATE INDEX "TelemedicineQueue_hn_createdAt_idx" ON "TelemedicineQueue"("hn", "createdAt" DESC);
CREATE INDEX "TelemedicineQueue_clientSiteId_status_idx" ON "TelemedicineQueue"("clientSiteId", "status");
CREATE INDEX "TelemedicineQueue_assignedDoctorId_status_idx" ON "TelemedicineQueue"("assignedDoctorId", "status");
CREATE UNIQUE INDEX "TelemedicineConsultation_consultationNumber_key" ON "TelemedicineConsultation"("consultationNumber");
CREATE UNIQUE INDEX "TelemedicineConsultation_queueId_key" ON "TelemedicineConsultation"("queueId");
CREATE INDEX "TelemedicineConsultation_doctorId_completedAt_idx" ON "TelemedicineConsultation"("doctorId", "completedAt" DESC);
CREATE INDEX "TelemedicineConsultation_completedAt_idx" ON "TelemedicineConsultation"("completedAt" DESC);

ALTER TABLE "TelemedicineQueue" ADD CONSTRAINT "TelemedicineQueue_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TelemedicineQueue" ADD CONSTRAINT "TelemedicineQueue_parentSiteId_fkey" FOREIGN KEY ("parentSiteId") REFERENCES "ParentSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TelemedicineQueue" ADD CONSTRAINT "TelemedicineQueue_clientSiteId_fkey" FOREIGN KEY ("clientSiteId") REFERENCES "ClientSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TelemedicineQueue" ADD CONSTRAINT "TelemedicineQueue_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TelemedicineQueue" ADD CONSTRAINT "TelemedicineQueue_assignedDoctorId_fkey" FOREIGN KEY ("assignedDoctorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TelemedicineConsultation" ADD CONSTRAINT "TelemedicineConsultation_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "TelemedicineQueue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TelemedicineConsultation" ADD CONSTRAINT "TelemedicineConsultation_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
