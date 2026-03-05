-- Ejecutar en la base de datos de producción si falla el auth del portal de clientes
-- con: "The column contacts.portal_login_attempts does not exist"
--
-- Uso (ejemplo con psql):
--   psql "$DIRECT_DATABASE_URL" -f prisma/scripts/fix-portal-cliente-auth-columns.sql
-- O desde Prisma:
--   npx prisma db execute --file prisma/scripts/fix-portal-cliente-auth-columns.sql

-- Columnas en crm.accounts (portal_config por si se usa)
ALTER TABLE "crm"."accounts" ADD COLUMN IF NOT EXISTS "portal_config" JSONB;

-- Columnas en crm.contacts necesarias para auth del portal (intentos fallidos y bloqueo)
ALTER TABLE "crm"."contacts" ADD COLUMN IF NOT EXISTS "portal_magic_token" TEXT;
ALTER TABLE "crm"."contacts" ADD COLUMN IF NOT EXISTS "portal_magic_token_exp" TIMESTAMPTZ;
ALTER TABLE "crm"."contacts" ADD COLUMN IF NOT EXISTS "portal_login_attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "crm"."contacts" ADD COLUMN IF NOT EXISTS "portal_locked_until" TIMESTAMPTZ;
