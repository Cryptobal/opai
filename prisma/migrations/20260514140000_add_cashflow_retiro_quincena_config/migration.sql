-- ════════════════════════════════════════════════════════════════
--  Cashflow · retiro de socios y quincena/anticipo de guardias
-- ════════════════════════════════════════════════════════════════
--
-- 1. Nuevos valores en enum FinanceCashflowItemSource:
--    - QUINCENA      → anticipo mensual a guardias (quincena-sync.ts)
--    - RETIRO_SOCIO  → retiro/dividendo proyectado como % de ventas
--                       netas mensuales (retiro-socios-sync.ts)
--
-- 2. Nuevo enum FinanceQuincenaMode (FICHA | PCT_LIQUIDO) — estrategia
--    de proyección de la quincena.
--
-- 3. Campos nuevos en finance_cashflow_config:
--    - retiro_socio_pct_ventas (0 = no proyectar)
--    - retiro_socio_pay_day
--    - quincena_mode (default FICHA)
--    - quincena_pct_liquido (default 10%)
--    - quincena_pay_day (default 15)
--
-- Postgres requiere ALTER TYPE ADD VALUE fuera de transacción explícita;
-- Prisma migrate deploy ejecuta cada statement en su propia conexión.

ALTER TYPE "finance"."FinanceCashflowItemSource" ADD VALUE IF NOT EXISTS 'QUINCENA';

ALTER TYPE "finance"."FinanceCashflowItemSource" ADD VALUE IF NOT EXISTS 'RETIRO_SOCIO';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'finance' AND t.typname = 'FinanceQuincenaMode'
  ) THEN
    CREATE TYPE "finance"."FinanceQuincenaMode" AS ENUM ('FICHA', 'PCT_LIQUIDO');
  END IF;
END
$$;

ALTER TABLE "finance"."finance_cashflow_config"
  ADD COLUMN IF NOT EXISTS "retiro_socio_pct_ventas" numeric(6, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "retiro_socio_pay_day"    integer       NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS "quincena_mode"           "finance"."FinanceQuincenaMode" NOT NULL DEFAULT 'FICHA',
  ADD COLUMN IF NOT EXISTS "quincena_pct_liquido"    numeric(6, 4) NOT NULL DEFAULT 0.10,
  ADD COLUMN IF NOT EXISTS "quincena_pay_day"        integer       NOT NULL DEFAULT 15;
