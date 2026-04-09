-- Admin phone (mobile) — para enviar WhatsApp a los admins directamente.
-- Usado por alertas-cobertura para notificar al creador de la alerta cuando
-- un guardia acepta el turno.

ALTER TABLE "Admin"
  ADD COLUMN IF NOT EXISTS "phone" TEXT;
