-- Estado de Pago: periodo relativo a la fecha de emisión.
-- "PREVIOUS" = mes anterior (default — el EP cierra el mes de servicio:
-- p.ej. factura de junio por servicio de mayo); "CURRENT" = mes de emisión.
ALTER TABLE "finance_dtes"
  ADD COLUMN "estado_pago_periodo_mode" TEXT NOT NULL DEFAULT 'PREVIOUS';
