-- Próximo paso comercial en pipeline (texto corto, nullable).
ALTER TABLE "crm"."deals" ADD COLUMN IF NOT EXISTS "proximo_paso" TEXT;
