-- Destino explícito en planilla de flujo al emitir factura puntual.
-- Aditiva: enum + columna nullable sin default ni backfill.
CREATE TYPE "finance"."FinanceDteFlowRouting" AS ENUM ('OWN_ROW', 'OTHER_INCOME');
ALTER TABLE "finance"."finance_dtes"
  ADD COLUMN "flow_routing" "finance"."FinanceDteFlowRouting";
