-- Soporte de archivos adjuntos en DTEs (Feature: adjuntar XML/PDF del proveedor):
-- Tabla nueva finance.finance_dte_attachments con storage en BYTEA (MVP).
-- Casos: usuario sube el XML que el proveedor le mandó por email, o el PDF
-- impreso del DTE recibido. El SII no expone re-descarga.
-- Si crecen mucho los archivos podemos migrar a Vercel Blob después.

CREATE TABLE "finance"."finance_dte_attachments" (
  "id"          UUID NOT NULL DEFAULT uuid_generate_v4(),
  "dte_id"      UUID NOT NULL,
  "tenant_id"   TEXT NOT NULL,
  "kind"        TEXT NOT NULL DEFAULT 'OTHER',
  "filename"    TEXT NOT NULL,
  "mime_type"   TEXT NOT NULL,
  "size"        INT  NOT NULL,
  "data"        BYTEA NOT NULL,
  "uploaded_at" TIMESTAMP(6) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uploaded_by" TEXT NOT NULL,
  CONSTRAINT "finance_dte_attachments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "finance"."finance_dte_attachments"
  ADD CONSTRAINT "finance_dte_attachments_dte_id_fkey"
  FOREIGN KEY ("dte_id") REFERENCES "finance"."finance_dtes"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "idx_finance_dte_attachments_dte" ON "finance"."finance_dte_attachments"("dte_id");
CREATE INDEX "idx_finance_dte_attachments_tenant_dte" ON "finance"."finance_dte_attachments"("tenant_id", "dte_id");
