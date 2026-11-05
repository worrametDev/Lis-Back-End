CREATE INDEX "Sample_status_receivedAt_idx" ON "Sample"("status", "receivedAt" DESC);
CREATE INDEX "TestResult_sampleId_isApproved_isVoided_approvedAt_idx" ON "TestResult"("sampleId", "isApproved", "isVoided", "approvedAt" DESC);
CREATE INDEX "AuditLog_action_entityId_createdAt_idx" ON "AuditLog"("action", "entityId", "createdAt" DESC);
