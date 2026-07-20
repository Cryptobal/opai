-- Espejo Drive de cualquier mime (no solo PDF): guardar el mime original del
-- documento para que el worker suba con el Content-Type correcto. Aditiva.
ALTER TABLE "public"."drive_export_outbox" ADD COLUMN IF NOT EXISTS "mime_type" TEXT;
