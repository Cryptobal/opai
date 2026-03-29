-- Alertas de Cobertura Nacional
-- Sprint 1: Modelo, State Machine, Config, Permisos

-- Enums
CREATE TYPE "ops"."OpsAlertaCoberturaEstado" AS ENUM (
  'BORRADOR',
  'ACTIVA',
  'ACEPTADA',
  'CONFIRMADA',
  'ASIGNADA_PAUTA',
  'CANCELADA',
  'EXPIRADA'
);

CREATE TYPE "ops"."OpsAlertaCoberturaModalidad" AS ENUM (
  'GGSS',
  'CCTV',
  'TACTICO'
);

-- Tabla principal de alertas
CREATE TABLE "ops"."alertas_cobertura" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" TEXT NOT NULL,
  "creada_por_id" TEXT NOT NULL,
  "installation_id" UUID NOT NULL,
  "puesto_id" UUID,
  "radio_km" DOUBLE PRECISION NOT NULL DEFAULT 30,
  "genero" TEXT,
  "modalidad" "ops"."OpsAlertaCoberturaModalidad" NOT NULL,
  "requiere_os10" BOOLEAN NOT NULL DEFAULT true,
  "solo_dealer" BOOLEAN NOT NULL DEFAULT false,
  "solo_con_movilizacion" BOOLEAN NOT NULL DEFAULT false,
  "fecha_inicio" TIMESTAMPTZ(6) NOT NULL,
  "fecha_fin" TIMESTAMPTZ(6) NOT NULL,
  "monto_ofrecido" INTEGER NOT NULL,
  "funciones" TEXT NOT NULL,
  "urgencia" TEXT,
  "notas_internas" TEXT,
  "estado" "ops"."OpsAlertaCoberturaEstado" NOT NULL DEFAULT 'ACTIVA',
  "oleada_actual" INTEGER NOT NULL DEFAULT 0,
  "oleadas_config" JSONB NOT NULL DEFAULT '[]',
  "proxima_oleada_at" TIMESTAMPTZ(6) NOT NULL,
  "aceptada_por_guardia_id" UUID,
  "aceptada_at" TIMESTAMPTZ(6),
  "es_interno_aceptacion" BOOLEAN,
  "confirmada_at" TIMESTAMPTZ(6),
  "confirmada_por_id" TEXT,
  "asignacion_pauta" TEXT,
  "turno_extra_id" UUID,
  "re_alerta_count" INTEGER NOT NULL DEFAULT 0,
  "re_alerta_motivo" TEXT,
  "expira_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "cancelada_at" TIMESTAMPTZ(6),
  "cancelada_por_id" TEXT,
  "cancel_motivo" TEXT,

  CONSTRAINT "alertas_cobertura_pkey" PRIMARY KEY ("id")
);

-- Tabla de intentos de aceptación
CREATE TABLE "ops"."alerta_aceptaciones" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "alerta_id" UUID NOT NULL,
  "guardia_id" UUID NOT NULL,
  "oleada_numero" INTEGER NOT NULL,
  "es_interno" BOOLEAN NOT NULL,
  "exito" BOOLEAN NOT NULL,
  "distancia_km" DOUBLE PRECISION,
  "intento_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "alerta_aceptaciones_pkey" PRIMARY KEY ("id")
);

-- Tabla de notificaciones enviadas
CREATE TABLE "ops"."alerta_notificaciones" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "alerta_id" UUID NOT NULL,
  "guardia_id" UUID NOT NULL,
  "oleada_numero" INTEGER NOT NULL,
  "canal" TEXT NOT NULL,
  "enviada_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "entregada" BOOLEAN NOT NULL DEFAULT false,
  "leida" BOOLEAN NOT NULL DEFAULT false,
  "leida_at" TIMESTAMPTZ(6),
  "error_detalle" TEXT,

  CONSTRAINT "alerta_notificaciones_pkey" PRIMARY KEY ("id")
);

-- Tabla de log de oleadas
CREATE TABLE "ops"."alerta_oleada_log" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "alerta_id" UUID NOT NULL,
  "oleada_numero" INTEGER NOT NULL,
  "tipo" TEXT NOT NULL,
  "radio_min_km" DOUBLE PRECISION,
  "radio_max_km" DOUBLE PRECISION,
  "guardias_notificados" INTEGER NOT NULL DEFAULT 0,
  "iniciada_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "alerta_oleada_log_pkey" PRIMARY KEY ("id")
);

-- Unique constraints
CREATE UNIQUE INDEX "uq_alerta_aceptacion_alerta_guardia"
  ON "ops"."alerta_aceptaciones"("alerta_id", "guardia_id");

ALTER TABLE "ops"."alertas_cobertura"
  ADD CONSTRAINT "alertas_cobertura_turno_extra_id_key" UNIQUE ("turno_extra_id");

-- Indexes
CREATE INDEX "idx_alertas_cobertura_tenant_estado"
  ON "ops"."alertas_cobertura"("tenant_id", "estado");

CREATE INDEX "idx_alertas_cobertura_installation"
  ON "ops"."alertas_cobertura"("installation_id");

CREATE INDEX "idx_alertas_cobertura_tenant_created"
  ON "ops"."alertas_cobertura"("tenant_id", "created_at");

CREATE INDEX "idx_alerta_notificaciones_alerta_oleada"
  ON "ops"."alerta_notificaciones"("alerta_id", "oleada_numero");

-- Foreign keys
ALTER TABLE "ops"."alertas_cobertura"
  ADD CONSTRAINT "alertas_cobertura_creada_por_id_fkey"
    FOREIGN KEY ("creada_por_id") REFERENCES "public"."Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ops"."alertas_cobertura"
  ADD CONSTRAINT "alertas_cobertura_installation_id_fkey"
    FOREIGN KEY ("installation_id") REFERENCES "crm"."installations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ops"."alertas_cobertura"
  ADD CONSTRAINT "alertas_cobertura_puesto_id_fkey"
    FOREIGN KEY ("puesto_id") REFERENCES "ops"."puestos_operativos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ops"."alertas_cobertura"
  ADD CONSTRAINT "alertas_cobertura_aceptada_por_guardia_id_fkey"
    FOREIGN KEY ("aceptada_por_guardia_id") REFERENCES "ops"."guardias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ops"."alertas_cobertura"
  ADD CONSTRAINT "alertas_cobertura_turno_extra_id_fkey"
    FOREIGN KEY ("turno_extra_id") REFERENCES "ops"."turnos_extra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ops"."alerta_aceptaciones"
  ADD CONSTRAINT "alerta_aceptaciones_alerta_id_fkey"
    FOREIGN KEY ("alerta_id") REFERENCES "ops"."alertas_cobertura"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ops"."alerta_aceptaciones"
  ADD CONSTRAINT "alerta_aceptaciones_guardia_id_fkey"
    FOREIGN KEY ("guardia_id") REFERENCES "ops"."guardias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ops"."alerta_notificaciones"
  ADD CONSTRAINT "alerta_notificaciones_alerta_id_fkey"
    FOREIGN KEY ("alerta_id") REFERENCES "ops"."alertas_cobertura"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ops"."alerta_oleada_log"
  ADD CONSTRAINT "alerta_oleada_log_alerta_id_fkey"
    FOREIGN KEY ("alerta_id") REFERENCES "ops"."alertas_cobertura"("id") ON DELETE CASCADE ON UPDATE CASCADE;
