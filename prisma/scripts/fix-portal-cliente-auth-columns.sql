-- Ejecutar en la base de datos de producción si aparecen errores como:
--   "The column accounts.portal_config does not exist"
--   "The column contacts.portal_login_attempts does not exist"
--
-- Uso:
--   npx prisma db execute --file prisma/scripts/fix-portal-cliente-auth-columns.sql
-- (con DIRECT_DATABASE_URL en .env para producción)
--
-- O con psql:
--   psql "$DIRECT_DATABASE_URL" -f prisma/scripts/fix-portal-cliente-auth-columns.sql

-- 1) crm.accounts — sin esto fallan listado de cuentas y detalle de cuenta
ALTER TABLE "crm"."accounts" ADD COLUMN IF NOT EXISTS "portal_config" JSONB;

-- 2) crm.contacts — sin esto fallan auth portal cliente, detalle de contacto y de cuenta
ALTER TABLE "crm"."contacts" ADD COLUMN IF NOT EXISTS "portal_magic_token" TEXT;
ALTER TABLE "crm"."contacts" ADD COLUMN IF NOT EXISTS "portal_magic_token_exp" TIMESTAMPTZ;
ALTER TABLE "crm"."contacts" ADD COLUMN IF NOT EXISTS "portal_login_attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "crm"."contacts" ADD COLUMN IF NOT EXISTS "portal_locked_until" TIMESTAMPTZ;
