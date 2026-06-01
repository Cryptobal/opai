-- Estado de Pago: periodo relativo a la fecha de emisión.
-- "PREVIOUS" = mes anterior (default — el EP cierra el mes de servicio:
-- p.ej. factura de junio por servicio de mayo); "CURRENT" = mes de emisión.
-- NOTA: las tablas de facturación viven en el schema Postgres `finance`.
ALTER TABLE "finance"."finance_dtes"
  ADD COLUMN IF NOT EXISTS "estado_pago_periodo_mode" TEXT NOT NULL DEFAULT 'PREVIOUS';
