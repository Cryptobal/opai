-- Vincular movimiento bancario directamente a OpsTurnoExtra (TE aprobado
-- pendiente de pago, sin fila aún en planilla TE).
ALTER TYPE "finance"."FinanceLinkTarget" ADD VALUE IF NOT EXISTS 'TE_TURNO';
