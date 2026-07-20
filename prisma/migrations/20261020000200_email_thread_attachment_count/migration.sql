-- Contador de adjuntos por hilo (badge "📎 N" y heurística "posible lead" en la
-- bandeja Correos). Aditiva, default 0; se puebla en el sync hacia adelante.
ALTER TABLE "crm"."email_threads" ADD COLUMN IF NOT EXISTS "attachment_count" INTEGER NOT NULL DEFAULT 0;

-- Lead creado desde el hilo (badge "✓ Lead creado" y filtro "Leads creados").
-- La escritura la implementa el flujo de creación de leads con IA (aditiva).
ALTER TABLE "crm"."email_threads" ADD COLUMN IF NOT EXISTS "lead_id" UUID;
CREATE INDEX IF NOT EXISTS "idx_crm_email_threads_lead" ON "crm"."email_threads" ("lead_id");
