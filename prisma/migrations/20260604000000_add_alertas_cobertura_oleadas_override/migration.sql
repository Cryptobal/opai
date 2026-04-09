-- Alertas de Cobertura — override de oleadas por alerta
--
-- Permite que al crear una alerta se sobreescriba la config de oleadas del
-- tenant con valores custom (radios, tiempos de espera, TTL). Si el campo
-- está null, se usa la config del tenant como antes (backward compatible).

ALTER TABLE "ops"."alertas_cobertura"
  ADD COLUMN IF NOT EXISTS "oleadas_override" JSONB;
