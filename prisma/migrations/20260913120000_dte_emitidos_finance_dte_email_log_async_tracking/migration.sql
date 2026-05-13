-- ──────────────────────────────────────────────────────────────────────────
--  DTE Emitidos · Fase 1.C — Tracking asíncrono + enums en
--  finance.finance_dte_email_logs.
--
--  Cambios:
--    1. Crea 3 enums (kind, status, attachments) reemplazando strings libres.
--    2. Suma columnas para tracking webhook Resend:
--       - delivered_at / opened_at / bounced_at / complained_at
--       - idempotency_key (dedupe doble-click)
--       - attempt_number (reservado para retry futuro)
--    3. resend_id pasa a UNIQUE (lookup desde webhook).
--    4. Migra datos string → enum preservando valores existentes.
--
--  Orden crítico: las columnas string se renombran a *_new, se rellenan
--  con CASE desde el valor viejo, se hace SET NOT NULL, y luego se dropea
--  la columna vieja + rename. Si un valor inesperado deja NULL en *_new,
--  el SET NOT NULL falla (fail-loud explícito).
-- ──────────────────────────────────────────────────────────────────────────

-- 1. Enums
CREATE TYPE "finance"."FinanceDteEmailKind" AS ENUM (
  'AUTO_RECEIVER',
  'AUTO_BACKOFFICE',
  'MANUAL_RESEND',
  'MANUAL_OVERRIDE_RECIPIENT',
  'MANUAL_BACKOFFICE'
);

CREATE TYPE "finance"."FinanceDteEmailStatus" AS ENUM (
  'QUEUED',
  'SENT',
  'DELIVERED',
  'OPENED',
  'BOUNCED',
  'COMPLAINED',
  'FAILED'
);

CREATE TYPE "finance"."FinanceDteEmailAttachments" AS ENUM (
  'PDF_XML',
  'XML_ONLY',
  'PDF_ONLY'
);

-- 2. Columnas nuevas para tracking async
ALTER TABLE "finance"."finance_dte_email_logs"
  ADD COLUMN "idempotency_key" TEXT,
  ADD COLUMN "attempt_number"  INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "delivered_at"    TIMESTAMP(6) WITH TIME ZONE,
  ADD COLUMN "opened_at"       TIMESTAMP(6) WITH TIME ZONE,
  ADD COLUMN "bounced_at"      TIMESTAMP(6) WITH TIME ZONE,
  ADD COLUMN "complained_at"   TIMESTAMP(6) WITH TIME ZONE;

-- 3. Deduplicar resend_id antes de aplicar UNIQUE: mantener el log más
-- reciente con ese resend_id; el resto pasa a NULL (mantenemos la fila
-- como histórico pero perdemos el lookup para webhook).
WITH ranked AS (
  SELECT "id", "resend_id",
         ROW_NUMBER() OVER (
           PARTITION BY "resend_id"
           ORDER BY "sent_at" DESC, "id" DESC
         ) AS rn
  FROM "finance"."finance_dte_email_logs"
  WHERE "resend_id" IS NOT NULL
)
UPDATE "finance"."finance_dte_email_logs"
SET "resend_id" = NULL
WHERE "id" IN (SELECT "id" FROM ranked WHERE rn > 1);

-- 4. Unique indexes (Postgres trata cada NULL como distinto en unique
-- index regular, así que no hace falta WHERE parcial).
CREATE UNIQUE INDEX "finance_dte_email_logs_resend_id_key"
  ON "finance"."finance_dte_email_logs"("resend_id");

CREATE UNIQUE INDEX "finance_dte_email_logs_idempotency_key_key"
  ON "finance"."finance_dte_email_logs"("idempotency_key");

-- 5. Migración kind (String → FinanceDteEmailKind)
ALTER TABLE "finance"."finance_dte_email_logs"
  ADD COLUMN "kind_new" "finance"."FinanceDteEmailKind";

UPDATE "finance"."finance_dte_email_logs"
SET "kind_new" = CASE "kind"
  WHEN 'auto_receiver'             THEN 'AUTO_RECEIVER'::"finance"."FinanceDteEmailKind"
  WHEN 'auto_backoffice'           THEN 'AUTO_BACKOFFICE'::"finance"."FinanceDteEmailKind"
  WHEN 'manual_resend'             THEN 'MANUAL_RESEND'::"finance"."FinanceDteEmailKind"
  WHEN 'manual_override_recipient' THEN 'MANUAL_OVERRIDE_RECIPIENT'::"finance"."FinanceDteEmailKind"
  WHEN 'manual_backoffice'         THEN 'MANUAL_BACKOFFICE'::"finance"."FinanceDteEmailKind"
END;

ALTER TABLE "finance"."finance_dte_email_logs" ALTER COLUMN "kind_new" SET NOT NULL;
ALTER TABLE "finance"."finance_dte_email_logs" DROP COLUMN "kind";
ALTER TABLE "finance"."finance_dte_email_logs" RENAME COLUMN "kind_new" TO "kind";

-- 6. Migración status (String → FinanceDteEmailStatus). Valores legacy
-- 'sent' y 'failed' mapean directo; cualquier otro pasa a QUEUED.
ALTER TABLE "finance"."finance_dte_email_logs"
  ADD COLUMN "status_new" "finance"."FinanceDteEmailStatus";

UPDATE "finance"."finance_dte_email_logs"
SET "status_new" = CASE "status"
  WHEN 'sent'   THEN 'SENT'::"finance"."FinanceDteEmailStatus"
  WHEN 'failed' THEN 'FAILED'::"finance"."FinanceDteEmailStatus"
  ELSE 'QUEUED'::"finance"."FinanceDteEmailStatus"
END;

ALTER TABLE "finance"."finance_dte_email_logs"
  ALTER COLUMN "status_new" SET DEFAULT 'QUEUED'::"finance"."FinanceDteEmailStatus";
ALTER TABLE "finance"."finance_dte_email_logs" ALTER COLUMN "status_new" SET NOT NULL;
ALTER TABLE "finance"."finance_dte_email_logs" DROP COLUMN "status";
ALTER TABLE "finance"."finance_dte_email_logs" RENAME COLUMN "status_new" TO "status";

-- 7. Migración attachments (String → FinanceDteEmailAttachments)
ALTER TABLE "finance"."finance_dte_email_logs"
  ADD COLUMN "attachments_new" "finance"."FinanceDteEmailAttachments";

UPDATE "finance"."finance_dte_email_logs"
SET "attachments_new" = CASE "attachments"
  WHEN 'pdf_xml'  THEN 'PDF_XML'::"finance"."FinanceDteEmailAttachments"
  WHEN 'xml_only' THEN 'XML_ONLY'::"finance"."FinanceDteEmailAttachments"
  WHEN 'pdf_only' THEN 'PDF_ONLY'::"finance"."FinanceDteEmailAttachments"
END;

ALTER TABLE "finance"."finance_dte_email_logs" ALTER COLUMN "attachments_new" SET NOT NULL;
ALTER TABLE "finance"."finance_dte_email_logs" DROP COLUMN "attachments";
ALTER TABLE "finance"."finance_dte_email_logs" RENAME COLUMN "attachments_new" TO "attachments";
