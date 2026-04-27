-- Speed-to-lead tracking: cuándo un comercial vio el lead, cuándo lo contactó
-- por primera vez (y por qué canal), y si fue escalado por inactividad.
ALTER TABLE "crm"."leads"
  ADD COLUMN "first_viewed_at"       TIMESTAMPTZ(6),
  ADD COLUMN "first_viewed_by"       TEXT,
  ADD COLUMN "first_contact_at"      TIMESTAMPTZ(6),
  ADD COLUMN "first_contact_by"      TEXT,
  ADD COLUMN "first_contact_channel" VARCHAR(20),
  ADD COLUMN "escalated_at"          TIMESTAMPTZ(6);

-- Índice compuesto para el barrido del cron de escalación: filtra
-- leads pending sin contactar en una ventana temporal.
CREATE INDEX "idx_crm_leads_escalation_scan"
  ON "crm"."leads" ("status", "first_contact_at", "escalated_at", "created_at");
