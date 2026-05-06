-- Soporte multi-email en envío de DTE (Feature 2 facturacion):
-- Array de emails CC adicionales para que OPAI mande copia del PDF/XML
-- a más de un destinatario vía Resend. El XML del SII solo lleva UN
-- <CorreoRecep> (campo receiver_email); estos son solo para envío externo.

-- AlterTable
ALTER TABLE "finance"."finance_dtes"
  ADD COLUMN "receiver_email_cc" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
