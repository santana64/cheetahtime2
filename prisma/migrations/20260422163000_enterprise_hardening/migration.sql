-- Enterprise hardening: binary attachment storage metadata, outbound notification tracking,
-- and auth controls for MFA / lockout / permission-ready memberships.

ALTER TYPE "NotificationChannel" ADD VALUE IF NOT EXISTS 'TEAMS';
ALTER TYPE "NotificationChannel" ADD VALUE IF NOT EXISTS 'JIRA';
ALTER TYPE "AttachmentKind" ADD VALUE IF NOT EXISTS 'BINARY';

ALTER TABLE "User" ADD COLUMN "mfaEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "mfaSecretEncrypted" TEXT;
ALTER TABLE "User" ADD COLUMN "failedLoginCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "lockedUntil" TIMESTAMP(3);

ALTER TABLE "WorkspaceMember" ADD COLUMN "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "TaskAttachment" ALTER COLUMN "url" DROP NOT NULL;
ALTER TABLE "TaskAttachment" ADD COLUMN "storageProvider" TEXT NOT NULL DEFAULT 'reference';
ALTER TABLE "TaskAttachment" ADD COLUMN "storagePath" TEXT;
ALTER TABLE "TaskAttachment" ADD COLUMN "checksumSha256" TEXT;

ALTER TABLE "Notification" ADD COLUMN "providerTarget" TEXT;
ALTER TABLE "Notification" ADD COLUMN "providerMessageId" TEXT;
ALTER TABLE "Notification" ADD COLUMN "sentAt" TIMESTAMP(3);
ALTER TABLE "Notification" ADD COLUMN "errorMessage" TEXT;

CREATE INDEX "User_lockedUntil_idx" ON "User"("lockedUntil");
CREATE INDEX "TaskAttachment_storageProvider_idx" ON "TaskAttachment"("storageProvider");
CREATE INDEX "Notification_channel_status_createdAt_idx" ON "Notification"("channel", "status", "createdAt");
