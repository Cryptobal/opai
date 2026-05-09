-- DTE attachments en R2 + adjuntos para plantillas recurrentes.
--
-- 1) Hacemos `data` nullable en finance_dte_attachments y agregamos
--    storage_key + public_url para nuevos uploads en R2. Filas legacy
--    siguen funcionando con `data` inline.
-- 2) Nueva tabla finance_dte_recurring_template_attachments para los
--    archivos asociados a una plantilla recurrente, que se copian
--    (por referencia: mismo storage_key) a cada borrador generado.

ALTER TABLE "finance"."finance_dte_attachments"
  ALTER COLUMN "data" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "storage_key" TEXT,
  ADD COLUMN IF NOT EXISTS "public_url" TEXT;

-- ── finance_dte_recurring_template_attachments ──
CREATE TABLE IF NOT EXISTS "finance"."finance_dte_recurring_template_attachments" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "template_id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "public_url" TEXT,
    "uploaded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploaded_by" TEXT NOT NULL,

    CONSTRAINT "finance_dte_recurring_template_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_finance_dte_rec_attach_template"
  ON "finance"."finance_dte_recurring_template_attachments"("template_id");

CREATE INDEX IF NOT EXISTS "idx_finance_dte_rec_attach_tenant_template"
  ON "finance"."finance_dte_recurring_template_attachments"("tenant_id", "template_id");

ALTER TABLE "finance"."finance_dte_recurring_template_attachments"
  ADD CONSTRAINT "finance_dte_rec_attach_template_id_fkey"
  FOREIGN KEY ("template_id")
  REFERENCES "finance"."finance_dte_recurring_templates"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
