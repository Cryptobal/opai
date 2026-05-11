-- ════════════════════════════════════════════════════════════════
--  Cashflow · IPC adjustment metadata (Fase E)
-- ════════════════════════════════════════════════════════════════
--
-- Permite a un contrato CLP declarar que tiene ajuste de IPC cada N
-- meses. El cron correrá una vez al día, detectará contratos donde la
-- fecha del próximo ajuste se acerca, y creará un registro
-- ContractIpcAdjustment en estado PENDING + dispará notificaciones.
--
-- El % real del ajuste NO se guarda acá — el usuario lo ingresa cuando
-- aplica el ajuste (el IPC del período recién se conoce ese mes).

ALTER TABLE "finance"."finance_cashflow_items"
  ADD COLUMN IF NOT EXISTS "has_ipc_adjustment"  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "ipc_adjustment_months" INTEGER;

COMMENT ON COLUMN "finance"."finance_cashflow_items"."has_ipc_adjustment"
  IS 'Indica que el item tiene ajuste de IPC periódico. Sólo aplica a items CLP.';
COMMENT ON COLUMN "finance"."finance_cashflow_items"."ipc_adjustment_months"
  IS 'Frecuencia del ajuste en meses (ej. 6 o 12). Si has_ipc_adjustment=true.';

-- Registros de ajustes IPC. Una fila por cada período de ajuste de un
-- item — el cron las crea como PENDING cuando se acerca la fecha, el
-- usuario las aplica ingresando el % real (que no se conoce de
-- antemano).
CREATE TABLE IF NOT EXISTS "finance"."finance_contract_ipc_adjustments" (
  "id"               UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id"        TEXT NOT NULL,
  "item_id"          UUID NOT NULL,
  "due_date"         DATE NOT NULL,
  "status"           TEXT NOT NULL DEFAULT 'PENDING',
  "applied_pct"      DECIMAL(6,4),
  "old_amount"       DECIMAL(14,2),
  "new_amount"       DECIMAL(14,2),
  "applied_at"       TIMESTAMPTZ(6),
  "applied_by"       TEXT,
  "notes"            TEXT,
  "created_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "finance_contract_ipc_adjustments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fk_ipc_adjustment_item"
    FOREIGN KEY ("item_id")
    REFERENCES "finance"."finance_cashflow_items"("id")
    ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_ipc_adjustment_item_date"
  ON "finance"."finance_contract_ipc_adjustments"("item_id", "due_date");

CREATE INDEX IF NOT EXISTS "idx_ipc_adjustment_tenant_pending"
  ON "finance"."finance_contract_ipc_adjustments"("tenant_id", "status", "due_date")
  WHERE "status" = 'PENDING';

COMMENT ON TABLE "finance"."finance_contract_ipc_adjustments"
  IS 'Períodos de ajuste IPC de items de cashflow. Estado PENDING significa que toca aplicar (el cron lo crea cuando se acerca la fecha); APPLIED queda con applied_pct + new_amount; SKIPPED si el usuario decidió no ajustar.';
