-- Add signing_mode column to doc_signature_requests.
-- "sequential" = comportamiento histórico (email al firmante N solo cuando
--                el firmante N-1 firma).
-- "parallel"   = todos reciben el link al crear la solicitud; el documento
--                queda completado cuando TODOS firmaron, sin orden.
-- Las solicitudes existentes (anteriores a esta migración) quedan en
-- "sequential", que es el comportamiento que ya tenían.
ALTER TABLE "docs"."doc_signature_requests"
  ADD COLUMN IF NOT EXISTS "signing_mode" TEXT NOT NULL DEFAULT 'sequential';
