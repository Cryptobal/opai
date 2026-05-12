-- Agrega valor AJUSTE al enum FinanceCashflowItemSource para soportar líneas
-- de ajuste de conciliación bancaria (cierre de drift entre saldo proyectado
-- y saldo real del banco).
ALTER TYPE "finance"."FinanceCashflowItemSource" ADD VALUE IF NOT EXISTS 'AJUSTE';
