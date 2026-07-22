-- Tareas nacidas de un correo: enlace opcional a cuenta, contacto y al hilo
-- de origen, para poder agendar follow-ups desde la bandeja y volver al correo.
ALTER TABLE "crm"."tasks"
  ADD COLUMN IF NOT EXISTS "account_id" UUID,
  ADD COLUMN IF NOT EXISTS "contact_id" UUID,
  ADD COLUMN IF NOT EXISTS "email_thread_id" UUID;

CREATE INDEX IF NOT EXISTS "idx_crm_tasks_account" ON "crm"."tasks"("account_id");
CREATE INDEX IF NOT EXISTS "idx_crm_tasks_email_thread" ON "crm"."tasks"("email_thread_id");
