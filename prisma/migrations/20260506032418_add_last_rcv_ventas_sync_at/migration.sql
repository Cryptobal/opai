-- Sync de RCV Ventas (Feature: importar facturas emitidas históricas):
-- Nuevo campo para tracking del último sync de DTEs emitidos. Permite
-- traer al sistema todas las facturas que el tenant emitió en su SII
-- (incluso las anteriores a OPAI) usando rcv/ventas/{mes}/{anio}.

-- AlterTable
ALTER TABLE "public"."tenant_dte_configs"
  ADD COLUMN "last_rcv_ventas_sync_at" TIMESTAMP(3);
