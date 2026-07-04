-- Fase 18 — Vencimientos sin fatiga: escalera de hitos, "En trámite" y "Ya no aplica".
-- Aditiva e idempotente: si ya se aplicó en caliente, migrate deploy es no-op.

-- Tipos de documento operacional: flag crítico-legal + escalera custom
ALTER TABLE "ops"."tipos_doc_operacional"
  ADD COLUMN IF NOT EXISTS "critico_legal" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ops"."tipos_doc_operacional"
  ADD COLUMN IF NOT EXISTS "milestones" JSONB;

-- Documentos operacionales: tracking de hitos + gestión desde la tarjeta
ALTER TABLE "ops"."docs_operacionales"
  ADD COLUMN IF NOT EXISTS "last_expiry_milestone" INTEGER;
ALTER TABLE "ops"."docs_operacionales"
  ADD COLUMN IF NOT EXISTS "last_expiry_milestone_at" TIMESTAMPTZ(6);
ALTER TABLE "ops"."docs_operacionales"
  ADD COLUMN IF NOT EXISTS "renewal_in_progress_until" DATE;
ALTER TABLE "ops"."docs_operacionales"
  ADD COLUMN IF NOT EXISTS "renewal_marked_by" TEXT;
ALTER TABLE "ops"."docs_operacionales"
  ADD COLUMN IF NOT EXISTS "renewal_marked_at" TIMESTAMPTZ(6);
ALTER TABLE "ops"."docs_operacionales"
  ADD COLUMN IF NOT EXISTS "expiry_dismissed_at" TIMESTAMPTZ(6);
ALTER TABLE "ops"."docs_operacionales"
  ADD COLUMN IF NOT EXISTS "expiry_dismissed_by" TEXT;
ALTER TABLE "ops"."docs_operacionales"
  ADD COLUMN IF NOT EXISTS "expiry_dismissed_reason" TEXT;

-- Documentos de guardia: mismos campos
ALTER TABLE "ops"."documentos_persona"
  ADD COLUMN IF NOT EXISTS "last_expiry_milestone" INTEGER;
ALTER TABLE "ops"."documentos_persona"
  ADD COLUMN IF NOT EXISTS "last_expiry_milestone_at" TIMESTAMPTZ(6);
ALTER TABLE "ops"."documentos_persona"
  ADD COLUMN IF NOT EXISTS "renewal_in_progress_until" DATE;
ALTER TABLE "ops"."documentos_persona"
  ADD COLUMN IF NOT EXISTS "renewal_marked_by" TEXT;
ALTER TABLE "ops"."documentos_persona"
  ADD COLUMN IF NOT EXISTS "renewal_marked_at" TIMESTAMPTZ(6);
ALTER TABLE "ops"."documentos_persona"
  ADD COLUMN IF NOT EXISTS "expiry_dismissed_at" TIMESTAMPTZ(6);
ALTER TABLE "ops"."documentos_persona"
  ADD COLUMN IF NOT EXISTS "expiry_dismissed_by" TEXT;
ALTER TABLE "ops"."documentos_persona"
  ADD COLUMN IF NOT EXISTS "expiry_dismissed_reason" TEXT;
