-- Reemplaza el "ensure column" que corría en runtime (prisma.ts) por una
-- migración idempotente. La columna ya está en el schema; ADD COLUMN IF NOT
-- EXISTS la crea sólo si algún entorno quedó atrás. Aditiva.
ALTER TABLE "crm"."deals" ADD COLUMN IF NOT EXISTS "active_quotation_id" UUID;
