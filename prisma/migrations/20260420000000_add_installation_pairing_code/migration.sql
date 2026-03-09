-- AlterTable: add pairing_code to crm.installations
ALTER TABLE "crm"."installations" ADD COLUMN "pairing_code" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "installations_pairing_code_key" ON "crm"."installations"("pairing_code");
