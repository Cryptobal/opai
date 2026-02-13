-- Migration: add fields for bulk data import (ops migration)
-- Adds: startDate/endDate to accounts and installations
--        currentInstallationId, montoAnticipo, recibeAnticipo to guardias
--        commune to accounts

-- ============================================
-- 1. CrmAccount: add commune, start_date, end_date
-- ============================================
ALTER TABLE "crm"."accounts"
  ADD COLUMN "commune" TEXT,
  ADD COLUMN "start_date" DATE,
  ADD COLUMN "end_date" DATE;

-- ============================================
-- 2. CrmInstallation: add start_date, end_date
-- ============================================
ALTER TABLE "crm"."installations"
  ADD COLUMN "start_date" DATE,
  ADD COLUMN "end_date" DATE;

-- ============================================
-- 3. OpsGuardia: add current_installation_id, monto_anticipo, recibe_anticipo
-- ============================================
ALTER TABLE "ops"."guardias"
  ADD COLUMN "current_installation_id" UUID,
  ADD COLUMN "monto_anticipo" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "recibe_anticipo" BOOLEAN NOT NULL DEFAULT false;

-- Foreign key: guardias.current_installation_id → installations.id
ALTER TABLE "ops"."guardias"
  ADD CONSTRAINT "guardias_current_installation_id_fkey"
  FOREIGN KEY ("current_installation_id")
  REFERENCES "crm"."installations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Index for quick lookup
CREATE INDEX "idx_ops_guardias_current_installation"
  ON "ops"."guardias"("current_installation_id");
