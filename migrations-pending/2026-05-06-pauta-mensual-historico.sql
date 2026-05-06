-- Migration: agregar campos para preservar histórico de desasignaciones en pauta mensual
-- Tabla destino: ops.pauta_mensual (model OpsPautaMensual)
-- Generado: 2026-05-06
-- Acción manual: revisa y ejecuta antes de desplegar el código que usa estos campos.

ALTER TABLE ops.pauta_mensual
  ADD COLUMN IF NOT EXISTS previous_guardia_id UUID REFERENCES ops.guardias(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unassigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS unassigned_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_ops_pauta_previous_guardia ON ops.pauta_mensual(previous_guardia_id);
CREATE INDEX IF NOT EXISTS idx_ops_pauta_unassigned_at ON ops.pauta_mensual(unassigned_at);
