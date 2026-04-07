-- BNE (Bolsa Nacional de Empleo) per-tenant integration.
-- Stores OAuth2 client credentials and a cached access token, plus per-tenant
-- defaults for the BNE Ofertas Publicas API payload.

CREATE TABLE IF NOT EXISTS "ops"."ats_bne_integrations" (
  "id"                          UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id"                   TEXT NOT NULL,

  "consumer_key"                TEXT,
  "consumer_secret_enc"         TEXT,
  "environment"                 TEXT NOT NULL DEFAULT 'prod',

  "rut_empleador"               TEXT,
  "id_empleador"                INTEGER,
  "id_usuario_publicador"       INTEGER,
  "mostrar_nombre_empresa"      BOOLEAN NOT NULL DEFAULT TRUE,

  "access_token"                TEXT,
  "token_expires_at"            TIMESTAMPTZ(6),

  "default_jornada_trabajo"     INTEGER,
  "default_relacion_contractual" INTEGER,
  "default_rango_salarios"      INTEGER,
  "default_ocupacion"           INTEGER,
  "default_nivel_cargo"         INTEGER,
  "default_dias_publicacion"    INTEGER NOT NULL DEFAULT 30,

  "catalog_cache"               JSONB,
  "catalog_cache_at"            TIMESTAMPTZ(6),

  "status"                      TEXT NOT NULL DEFAULT 'pending',
  "last_sync_at"                TIMESTAMPTZ(6),
  "last_error_at"               TIMESTAMPTZ(6),
  "last_error"                  TEXT,
  "job_count"                   INTEGER NOT NULL DEFAULT 0,

  "created_at"                  TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"                  TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "ats_bne_integrations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ats_bne_integrations_tenant_id_key"
  ON "ops"."ats_bne_integrations"("tenant_id");

ALTER TABLE "ops"."ats_bne_integrations"
  ADD CONSTRAINT "ats_bne_integrations_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
