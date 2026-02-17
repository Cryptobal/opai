-- ============================================
-- PAYROLL: Holidays (Feriados)
-- ============================================

CREATE TABLE "payroll"."holidays" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'normal',
  "year" INTEGER NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_payroll_holiday_tenant_date" ON "payroll"."holidays" ("tenant_id", "date");
CREATE INDEX "idx_payroll_holiday_tenant" ON "payroll"."holidays" ("tenant_id");
CREATE INDEX "idx_payroll_holiday_year" ON "payroll"."holidays" ("year");

-- ============================================
-- Seed: Feriados Chile 2026 (tenant genérico)
-- Se insertan con tenant_id del primer tenant existente
-- ============================================

INSERT INTO "payroll"."holidays" ("tenant_id", "date", "name", "type", "year") VALUES
  ((SELECT "id" FROM "public"."Tenant" LIMIT 1), '2026-01-01', 'Año Nuevo', 'irrenunciable', 2026),
  ((SELECT "id" FROM "public"."Tenant" LIMIT 1), '2026-04-03', 'Viernes Santo', 'normal', 2026),
  ((SELECT "id" FROM "public"."Tenant" LIMIT 1), '2026-04-04', 'Sábado Santo', 'normal', 2026),
  ((SELECT "id" FROM "public"."Tenant" LIMIT 1), '2026-05-01', 'Día del Trabajo', 'irrenunciable', 2026),
  ((SELECT "id" FROM "public"."Tenant" LIMIT 1), '2026-05-21', 'Día de las Glorias Navales', 'normal', 2026),
  ((SELECT "id" FROM "public"."Tenant" LIMIT 1), '2026-06-21', 'Día Nacional de los Pueblos Indígenas', 'normal', 2026),
  ((SELECT "id" FROM "public"."Tenant" LIMIT 1), '2026-06-29', 'San Pedro y San Pablo', 'normal', 2026),
  ((SELECT "id" FROM "public"."Tenant" LIMIT 1), '2026-07-16', 'Día de la Virgen del Carmen', 'normal', 2026),
  ((SELECT "id" FROM "public"."Tenant" LIMIT 1), '2026-08-15', 'Asunción de la Virgen', 'normal', 2026),
  ((SELECT "id" FROM "public"."Tenant" LIMIT 1), '2026-09-18', 'Fiestas Patrias', 'irrenunciable', 2026),
  ((SELECT "id" FROM "public"."Tenant" LIMIT 1), '2026-09-19', 'Día de las Glorias del Ejército', 'normal', 2026),
  ((SELECT "id" FROM "public"."Tenant" LIMIT 1), '2026-10-12', 'Día del Encuentro de Dos Mundos', 'normal', 2026),
  ((SELECT "id" FROM "public"."Tenant" LIMIT 1), '2026-10-31', 'Día de las Iglesias Evangélicas y Protestantes', 'normal', 2026),
  ((SELECT "id" FROM "public"."Tenant" LIMIT 1), '2026-11-01', 'Día de Todos los Santos', 'normal', 2026),
  ((SELECT "id" FROM "public"."Tenant" LIMIT 1), '2026-12-08', 'Inmaculada Concepción', 'normal', 2026),
  ((SELECT "id" FROM "public"."Tenant" LIMIT 1), '2026-12-25', 'Navidad', 'irrenunciable', 2026);
