-- ──────────────────────────────────────────────────────────────────────────
--  DTE Emitidos · Fase 1.B — Overrides per-tenant del email outbound del DTE.
--
--  Hoy el BCC al admin se toma del env EMAIL_REPLY_TO global (single-tenant).
--  Estos campos lo trasladan a BD por tenant:
--    - always_bcc: BCC permanente en cada envío (al receptor o backoffice).
--    - from_name:  override del nombre del remitente.
--    - reply_to:   override del Reply-To.
--
--  Fallback al env EMAIL_REPLY_TO se mantiene en código cuando los campos
--  están vacíos (compat hacia atrás).
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE "public"."tenant_dte_configs"
  ADD COLUMN "always_bcc" TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN "from_name"  TEXT,
  ADD COLUMN "reply_to"   TEXT;
