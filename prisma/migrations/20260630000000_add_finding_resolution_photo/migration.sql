-- Bloque 1: foto de prueba de resolución para hallazgos de supervisión.
-- Separada de `photo_url` (foto del descubrimiento). Se llena cuando un
-- supervisor cierra el hallazgo desde la visita (ver POST /findings/[id]/resolve).

ALTER TABLE "ops"."supervision_findings"
  ADD COLUMN IF NOT EXISTS "resolution_photo_url" text,
  ADD COLUMN IF NOT EXISTS "resolution_note" text;
