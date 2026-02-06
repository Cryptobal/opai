-- AddColumn: Admin.status (migrado desde active)
ALTER TABLE "Admin" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active';

-- MigrateData: Copiar active → status
UPDATE "Admin" SET "status" = CASE 
  WHEN "active" = true THEN 'active'
  WHEN "active" = false THEN 'disabled'
END;

-- AddColumn: Metadata de invitación
ALTER TABLE "Admin" ADD COLUMN IF NOT EXISTS "invitedBy" TEXT;
ALTER TABLE "Admin" ADD COLUMN IF NOT EXISTS "invitedAt" TIMESTAMP(3);
ALTER TABLE "Admin" ADD COLUMN IF NOT EXISTS "activatedAt" TIMESTAMP(3);

-- DropColumn: active (ya migrado a status)
ALTER TABLE "Admin" DROP COLUMN IF EXISTS "active";

-- CreateTable: UserInvitation
CREATE TABLE IF NOT EXISTS "UserInvitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "invitedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "UserInvitation_token_key" ON "UserInvitation"("token");
CREATE INDEX IF NOT EXISTS "UserInvitation_token_idx" ON "UserInvitation"("token");
CREATE INDEX IF NOT EXISTS "UserInvitation_email_idx" ON "UserInvitation"("email");
CREATE INDEX IF NOT EXISTS "UserInvitation_tenantId_idx" ON "UserInvitation"("tenantId");
CREATE INDEX IF NOT EXISTS "UserInvitation_expiresAt_idx" ON "UserInvitation"("expiresAt");
CREATE INDEX IF NOT EXISTS "UserInvitation_tenantId_email_idx" ON "UserInvitation"("tenantId", "email");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Admin_status_idx" ON "Admin"("status");
CREATE INDEX IF NOT EXISTS "Admin_tenantId_status_idx" ON "Admin"("tenantId", "status");
