-- AlterTable: add pairing_code to crm.installations
ALTER TABLE "crm"."installations" ADD COLUMN IF NOT EXISTS "pairing_code" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "installations_pairing_code_key" ON "crm"."installations"("pairing_code");
