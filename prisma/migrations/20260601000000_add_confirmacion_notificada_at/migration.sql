-- Agregar campo para evitar notificaciones duplicadas de confirmación en el cron
ALTER TABLE "ops"."alertas_cobertura"
ADD COLUMN "confirmacion_notificada_at" TIMESTAMPTZ(6);
