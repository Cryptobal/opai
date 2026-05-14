-- ──────────────────────────────────────────────────────────────────────────
--  Hub personalizable — preferencias de UI por usuario.
--
--  Un único modelo `AdminPreference` para todas las prefs del usuario
--  (orden del Hub, secciones ocultas, futuras prefs de theme/colapsado
--  vía columna `data` JSONB). Relación 1:1 con `Admin`. Borrado en
--  cascada con el admin.
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE "public"."admin_preference" (
    "id" TEXT NOT NULL,
    "admin_id" TEXT NOT NULL,
    "hub_order" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hub_hidden" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_preference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "admin_preference_admin_id_key" ON "public"."admin_preference"("admin_id");

CREATE INDEX "admin_preference_admin_id_idx" ON "public"."admin_preference"("admin_id");

ALTER TABLE "public"."admin_preference"
  ADD CONSTRAINT "admin_preference_admin_id_fkey"
  FOREIGN KEY ("admin_id") REFERENCES "public"."Admin"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
