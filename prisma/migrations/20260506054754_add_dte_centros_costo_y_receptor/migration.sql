-- Centros de costo + datos completos del receptor en DTEs.
-- Permite asociar cada factura (emitida o recibida) a un cliente CRM y
-- una instalación, y guardar los datos del receptor que el SII exige
-- (giro, dirección, comuna, ciudad).

ALTER TABLE "finance"."finance_dtes"
  ADD COLUMN "crm_account_id" UUID,
  ADD COLUMN "installation_id" UUID,
  ADD COLUMN "receiver_giro" TEXT,
  ADD COLUMN "receiver_direccion" TEXT,
  ADD COLUMN "receiver_comuna" TEXT,
  ADD COLUMN "receiver_ciudad" TEXT;

-- Índices para filtros por centro de costo en listas de DTEs.
CREATE INDEX "idx_finance_dte_crm_account" ON "finance"."finance_dtes"("tenant_id", "crm_account_id");
CREATE INDEX "idx_finance_dte_installation" ON "finance"."finance_dtes"("tenant_id", "installation_id");
