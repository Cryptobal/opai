-- Aditiva: fecha del primer envío de cotización (portal / licitación).
-- Sin DROP, sin ALTER COLUMN destructivo.

ALTER TABLE "cpq"."quotes"
  ADD COLUMN IF NOT EXISTS "sent_at" TIMESTAMPTZ(6);
