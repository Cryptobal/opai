-- Congela el saldo de apertura de la semana en el cierre semanal. Un cierre debe
-- ser un HECHO INMUTABLE: sin esta columna el saldo de apertura se recalcula desde
-- los snapshots bancarios en cada lectura, así que corregir una cartola del pasado
-- cambia retroactivamente la varianza de un cierre ya sellado.
--
-- schema.prisma (model FinanceCashflowWeeklyClose -> openingBalanceClp) y el código
-- desplegado (listRecentCloses, computeWeeklyCloseSnapshot, persistWeeklyClose,
-- listWeekCloseStatus) YA referencian esta columna; el código se desplegó en #617
-- antes de aplicar el ALTER, dejando la app rota al entrar a Flujo de Caja
-- ("The column opening_balance_clp does not exist"). Esta migración cierra ese
-- desfase.
--
-- CAMBIO SEGURO: columna aditiva NULLABLE, sin backfill ni datos destructivos.
-- Los cierres previos a esta migración quedan en NULL y el código cae al valor
-- calculado (compatibilidad hacia atrás). No requiere ventana de mantención.
-- Precisión DECIMAL(14,2) para ser consistente con las demás columnas de dinero de
-- la tabla (bank_balance_clp, variance_clp, etc.).
ALTER TABLE "finance"."finance_cashflow_weekly_close"
  ADD COLUMN IF NOT EXISTS "opening_balance_clp" DECIMAL(14,2);
