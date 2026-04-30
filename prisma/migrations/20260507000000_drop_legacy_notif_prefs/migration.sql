-- IRREVERSIBLE: drop de tablas legacy de prefs de notificaciones.
-- Datos ya migrados a public.notification_preferences en migración
-- 20260701120000_unified_notification_prefs.
-- Antes de aplicar: backup obligatorio (ver bloque 8.4 del refactor).
-- Recovery: restaurar tablas con pg_restore desde el backup correspondiente,
-- luego revertir el commit que removió los models del schema.prisma.

-- 1. Drop tabla admin (CASCADE para limpiar FKs si las hubiera)
DROP TABLE IF EXISTS "crm"."user_notification_preferences" CASCADE;

-- 2. Drop tabla portal (CASCADE para limpiar FKs si las hubiera)
DROP TABLE IF EXISTS "public"."portal_notification_preferences" CASCADE;
