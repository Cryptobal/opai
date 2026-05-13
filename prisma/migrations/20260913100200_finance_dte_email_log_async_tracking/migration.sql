-- Convierte finance.finance_dte_email_logs.kind/status/attachments de
-- String libre a tres enums tipados y agrega tracking asíncrono
-- (idempotencyKey, attemptNumber, deliveredAt, openedAt, bouncedAt,
-- complainedAt). También vuelve resend_id UNIQUE para que el webhook
-- Resend pueda hacer lookup O(1) por message-id.
--
-- ORDEN IMPORTA:
--   1. Crear tipos enum.
--   2. Sumar columnas nuevas (sin tocar las viejas todavía).
--   3. Limpiar duplicados de resend_id antes de hacerlo UNIQUE.
--   4. Crear unique indexes.
--   5. Migrar strings → enum: agregar columna tipada, CASE WHEN con ELSE
--      defensivo, drop columna vieja, rename.
--
-- ELSE defensivos:
--   - kind        → 'MANUAL_RESEND'  (categoría más segura para legacy)
--   - status      → 'QUEUED'         (peor caso: webhook lo reconcilia luego)
--   - attachments → 'PDF_XML'        (combinación más común)

-- ── 1. Crear enums ────────────────────────────────────────────
CREATE TYPE "finance"."FinanceDteEmailKind" AS ENUM (
  'AUTO_RECEIVER',
  'AUTO_BACKOFFICE',
  'MANUAL_RESEND',
  'MANUAL_OVERRIDE_RECIPIENT',
  'MANUAL_BACKOFFICE',
  -- billing-document-send.service.ts también escribe a esta tabla:
  'PROFORMA_SENT',
  'ESTADO_PAGO_SENT',
  'PROFORMA_FAILED',
  'ESTADO_PAGO_FAILED'
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

-- ── 2. Columnas nuevas ────────────────────────────────────────
ALTER TABLE "finance"."finance_dte_email_logs"
  ADD COLUMN "idempotency_key" TEXT,
  ADD COLUMN "attempt_number"  INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "delivered_at"    TIMESTAMPTZ(6),
  ADD COLUMN "opened_at"       TIMESTAMPTZ(6),
  ADD COLUMN "bounced_at"      TIMESTAMPTZ(6),
  ADD COLUMN "complained_at"   TIMESTAMPTZ(6);

-- ── 3. Limpieza de duplicados en resend_id ────────────────────
-- Mantenemos el row más reciente (mayor sent_at). Los demás se NULLean
-- para no perder la fila pero permitir el UNIQUE INDEX.
WITH ranked AS (
  SELECT "id",
         "resend_id",
         ROW_NUMBER() OVER (
           PARTITION BY "resend_id"
           ORDER BY "sent_at" DESC, "id" DESC
         ) AS rn
  FROM "finance"."finance_dte_email_logs"
  WHERE "resend_id" IS NOT NULL
)
UPDATE "finance"."finance_dte_email_logs" l
SET "resend_id" = NULL
WHERE l."id" IN (SELECT "id" FROM ranked WHERE rn > 1);

-- ── 4. Unique indexes ─────────────────────────────────────────
-- En Postgres, UNIQUE permite múltiples NULL por default — no hace falta
-- WHERE IS NOT NULL. Nombres siguen convención prisma `<table>_<col>_key`.
CREATE UNIQUE INDEX "finance_dte_email_logs_resend_id_key"
  ON "finance"."finance_dte_email_logs" ("resend_id");
CREATE UNIQUE INDEX "finance_dte_email_logs_idempotency_key_key"
  ON "finance"."finance_dte_email_logs" ("idempotency_key");

-- ── 5. String → enum: kind ────────────────────────────────────
ALTER TABLE "finance"."finance_dte_email_logs"
  ADD COLUMN "kind_new" "finance"."FinanceDteEmailKind";

UPDATE "finance"."finance_dte_email_logs"
SET "kind_new" = CASE "kind"
  WHEN 'auto_receiver'             THEN 'AUTO_RECEIVER'::"finance"."FinanceDteEmailKind"
  WHEN 'auto_backoffice'           THEN 'AUTO_BACKOFFICE'::"finance"."FinanceDteEmailKind"
  WHEN 'manual_resend'             THEN 'MANUAL_RESEND'::"finance"."FinanceDteEmailKind"
  WHEN 'manual_override_recipient' THEN 'MANUAL_OVERRIDE_RECIPIENT'::"finance"."FinanceDteEmailKind"
  WHEN 'manual_backoffice'         THEN 'MANUAL_BACKOFFICE'::"finance"."FinanceDteEmailKind"
  -- billing-document-send.service.ts (proforma + estado de pago):
  WHEN 'proforma_sent'             THEN 'PROFORMA_SENT'::"finance"."FinanceDteEmailKind"
  WHEN 'estado_pago_sent'          THEN 'ESTADO_PAGO_SENT'::"finance"."FinanceDteEmailKind"
  WHEN 'proforma_failed'           THEN 'PROFORMA_FAILED'::"finance"."FinanceDteEmailKind"
  WHEN 'estado_pago_failed'        THEN 'ESTADO_PAGO_FAILED'::"finance"."FinanceDteEmailKind"
  ELSE                                  'MANUAL_RESEND'::"finance"."FinanceDteEmailKind"
END;

ALTER TABLE "finance"."finance_dte_email_logs"
  ALTER COLUMN "kind_new" SET NOT NULL;
ALTER TABLE "finance"."finance_dte_email_logs" DROP COLUMN "kind";
ALTER TABLE "finance"."finance_dte_email_logs" RENAME COLUMN "kind_new" TO "kind";

-- ── 5. String → enum: status ──────────────────────────────────
ALTER TABLE "finance"."finance_dte_email_logs"
  ADD COLUMN "status_new" "finance"."FinanceDteEmailStatus";

UPDATE "finance"."finance_dte_email_logs"
SET "status_new" = CASE "status"
  WHEN 'sent'   THEN 'SENT'::"finance"."FinanceDteEmailStatus"
  WHEN 'failed' THEN 'FAILED'::"finance"."FinanceDteEmailStatus"
  ELSE               'QUEUED'::"finance"."FinanceDteEmailStatus"
END;

ALTER TABLE "finance"."finance_dte_email_logs"
  ALTER COLUMN "status_new" SET NOT NULL;
ALTER TABLE "finance"."finance_dte_email_logs"
  ALTER COLUMN "status_new" SET DEFAULT 'QUEUED'::"finance"."FinanceDteEmailStatus";
ALTER TABLE "finance"."finance_dte_email_logs" DROP COLUMN "status";
ALTER TABLE "finance"."finance_dte_email_logs" RENAME COLUMN "status_new" TO "status";

-- ── 5. String → enum: attachments ─────────────────────────────
ALTER TABLE "finance"."finance_dte_email_logs"
  ADD COLUMN "attachments_new" "finance"."FinanceDteEmailAttachments";

UPDATE "finance"."finance_dte_email_logs"
SET "attachments_new" = CASE "attachments"
  WHEN 'pdf_xml'  THEN 'PDF_XML'::"finance"."FinanceDteEmailAttachments"
  WHEN 'xml_only' THEN 'XML_ONLY'::"finance"."FinanceDteEmailAttachments"
  WHEN 'pdf_only' THEN 'PDF_ONLY'::"finance"."FinanceDteEmailAttachments"
  ELSE                 'PDF_XML'::"finance"."FinanceDteEmailAttachments"
END;

ALTER TABLE "finance"."finance_dte_email_logs"
  ALTER COLUMN "attachments_new" SET NOT NULL;
ALTER TABLE "finance"."finance_dte_email_logs" DROP COLUMN "attachments";
ALTER TABLE "finance"."finance_dte_email_logs" RENAME COLUMN "attachments_new" TO "attachments";
