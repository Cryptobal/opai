-- CpqServiceGroup: agrupador visual/semántico de puestos.
-- Cada quote puede tener N grupos; cada position pertenece a 0 o 1 grupo.
-- ON DELETE SET NULL en positions preserva las posiciones huérfanas si se borra el grupo.

CREATE TABLE "cpq"."service_groups" (
  "id"               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "tenant_id"        TEXT NOT NULL,
  "quote_id"         UUID NOT NULL,
  "name"             TEXT NOT NULL,
  "coverage_pattern" TEXT NOT NULL DEFAULT 'custom',
  "icon_name"        TEXT,
  "color_hex"        TEXT,
  "notes"            TEXT,
  "display_order"    INTEGER NOT NULL DEFAULT 0,
  "created_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updated_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

  CONSTRAINT "service_groups_quote_id_fkey"
    FOREIGN KEY ("quote_id") REFERENCES "cpq"."quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "idx_cpq_service_groups_tenant" ON "cpq"."service_groups"("tenant_id");
CREATE INDEX "idx_cpq_service_groups_quote_order" ON "cpq"."service_groups"("quote_id", "display_order");

-- Columna nullable en positions
ALTER TABLE "cpq"."positions" ADD COLUMN "service_group_id" UUID;

CREATE INDEX "idx_cpq_positions_service_group" ON "cpq"."positions"("service_group_id");

ALTER TABLE "cpq"."positions" ADD CONSTRAINT "positions_service_group_id_fkey"
  FOREIGN KEY ("service_group_id") REFERENCES "cpq"."service_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
