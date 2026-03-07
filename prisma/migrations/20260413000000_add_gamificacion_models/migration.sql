-- ══════════════════════════════════════════════════════════════════
--  GAMIFICACIÓN — 12 new models
-- ══════════════════════════════════════════════════════════════════

-- 1. GamificacionConfig
CREATE TABLE IF NOT EXISTS ops."gamificacion_config" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,

    -- Pesos dimensiones Trust Score (suman 100)
    "peso_rondas" INTEGER NOT NULL DEFAULT 30,
    "peso_asistencia" INTEGER NOT NULL DEFAULT 25,
    "peso_sistema_digital" INTEGER NOT NULL DEFAULT 15,
    "peso_supervision" INTEGER NOT NULL DEFAULT 20,
    "peso_capacitacion" INTEGER NOT NULL DEFAULT 10,

    -- Puntos por acción: Asistencia
    "pts_entrada_puntual" INTEGER NOT NULL DEFAULT 10,
    "pts_salida_completa" INTEGER NOT NULL DEFAULT 10,
    "pts_tardanza_penalizacion" INTEGER NOT NULL DEFAULT -20,
    "pts_inasistencia_injust" INTEGER NOT NULL DEFAULT -100,
    "pts_turno_extra" INTEGER NOT NULL DEFAULT 80,
    "pts_asistencia_perfecta_mes" INTEGER NOT NULL DEFAULT 200,

    -- Puntos por acción: Rondas
    "pts_ronda_perfecta" INTEGER NOT NULL DEFAULT 20,
    "pts_ronda_completada" INTEGER NOT NULL DEFAULT 10,
    "pts_ronda_no_realizada" INTEGER NOT NULL DEFAULT -30,
    "pts_incidente_reportado" INTEGER NOT NULL DEFAULT 15,
    "pts_tarea_checkpoint" INTEGER NOT NULL DEFAULT 5,

    -- Puntos por acción: Sistema digital
    "pts_marcacion_digital" INTEGER NOT NULL DEFAULT 5,
    "pts_bonus_consistencia" INTEGER NOT NULL DEFAULT 30,
    "pts_reporte_digital" INTEGER NOT NULL DEFAULT 5,

    -- Puntos por acción: Supervisión
    "pts_eval_sobresaliente" INTEGER NOT NULL DEFAULT 100,
    "pts_eval_buena" INTEGER NOT NULL DEFAULT 50,
    "pts_hallazgo_negativo" INTEGER NOT NULL DEFAULT -25,

    -- Puntos por acción: Capacitación
    "pts_examen_aprobado" INTEGER NOT NULL DEFAULT 50,
    "pts_examen_perfecto" INTEGER NOT NULL DEFAULT 100,

    -- Puntos por acción: Social
    "pts_reconocimiento_recibido" INTEGER NOT NULL DEFAULT 10,
    "pts_reconocimiento_dado" INTEGER NOT NULL DEFAULT 5,
    "pts_badge_desbloqueado" INTEGER NOT NULL DEFAULT 50,

    -- Puntos por acción: Rachas
    "pts_bonus_racha_7dias" INTEGER NOT NULL DEFAULT 50,
    "pts_bonus_racha_30dias" INTEGER NOT NULL DEFAULT 200,
    "pts_bonus_racha_90dias" INTEGER NOT NULL DEFAULT 500,
    "pts_bonus_semanal_perfecta" INTEGER NOT NULL DEFAULT 40,

    -- Umbrales de niveles
    "nivel_1_nombre" TEXT NOT NULL DEFAULT 'Centinela',
    "nivel_1_puntos" INTEGER NOT NULL DEFAULT 0,
    "nivel_2_nombre" TEXT NOT NULL DEFAULT 'Vigía',
    "nivel_2_puntos" INTEGER NOT NULL DEFAULT 500,
    "nivel_3_nombre" TEXT NOT NULL DEFAULT 'Guardián',
    "nivel_3_puntos" INTEGER NOT NULL DEFAULT 1500,
    "nivel_4_nombre" TEXT NOT NULL DEFAULT 'Protector',
    "nivel_4_puntos" INTEGER NOT NULL DEFAULT 3500,
    "nivel_5_nombre" TEXT NOT NULL DEFAULT 'Comandante',
    "nivel_5_puntos" INTEGER NOT NULL DEFAULT 7000,

    -- Configuración general
    "puntos_por_clp" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "max_puntos_diarios" INTEGER NOT NULL DEFAULT 200,
    "expiracion_puntos_meses" INTEGER NOT NULL DEFAULT 12,
    "ranking_reset_dia" TEXT NOT NULL DEFAULT 'lunes',
    "bonos_habilitados" BOOLEAN NOT NULL DEFAULT false,
    "modulo_activo" BOOLEAN NOT NULL DEFAULT false,

    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "gamificacion_config_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "gamificacion_config_tenant_id_key" ON ops."gamificacion_config"("tenant_id");

-- 2. GamificacionScoreGuardia
CREATE TABLE IF NOT EXISTS ops."gamificacion_score_guardia" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "guardia_id" UUID NOT NULL,
    "installation_id" UUID,

    "periodo" TEXT NOT NULL,
    "periodo_tipo" TEXT NOT NULL,
    "fecha_inicio" TIMESTAMPTZ(6) NOT NULL,
    "fecha_fin" TIMESTAMPTZ(6) NOT NULL,

    "trust_score" DOUBLE PRECISION NOT NULL DEFAULT 0,

    "score_rondas" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "score_asistencia" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "score_sistema_digital" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "score_supervision" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "score_capacitacion" DOUBLE PRECISION NOT NULL DEFAULT 0,

    "detalle_rondas" JSONB,
    "detalle_asistencia" JSONB,
    "detalle_sistema_digital" JSONB,
    "detalle_supervision" JSONB,
    "detalle_capacitacion" JSONB,

    "puntos_ganados" INTEGER NOT NULL DEFAULT 0,
    "puntos_perdidos" INTEGER NOT NULL DEFAULT 0,
    "puntos_netos" INTEGER NOT NULL DEFAULT 0,

    "ranking_instalacion" INTEGER,
    "ranking_global" INTEGER,
    "total_guardias_instalacion" INTEGER,
    "total_guardias_global" INTEGER,

    "racha_actual" INTEGER NOT NULL DEFAULT 0,
    "mejor_racha" INTEGER NOT NULL DEFAULT 0,

    "nivel_actual" TEXT NOT NULL DEFAULT 'Centinela',
    "puntos_acumulados_historico" INTEGER NOT NULL DEFAULT 0,

    "calculado_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "gamificacion_score_guardia_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_gam_score_guardia_periodo" ON ops."gamificacion_score_guardia"("guardia_id", "periodo", "periodo_tipo");
CREATE INDEX IF NOT EXISTS "idx_gam_score_tenant_periodo" ON ops."gamificacion_score_guardia"("tenant_id", "periodo");
CREATE INDEX IF NOT EXISTS "idx_gam_score_installation_periodo" ON ops."gamificacion_score_guardia"("installation_id", "periodo");
CREATE INDEX IF NOT EXISTS "idx_gam_score_trust_score" ON ops."gamificacion_score_guardia"("trust_score");
CREATE INDEX IF NOT EXISTS "idx_gam_score_ranking_global" ON ops."gamificacion_score_guardia"("ranking_global");

-- 3. GamificacionEvento
CREATE TABLE IF NOT EXISTS ops."gamificacion_eventos" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "guardia_id" UUID NOT NULL,
    "installation_id" UUID,

    "tipo" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "puntos" INTEGER NOT NULL,

    "descripcion" TEXT NOT NULL,

    "referencia_modelo" TEXT,
    "referencia_id" TEXT,

    "fecha" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "procesado" BOOLEAN NOT NULL DEFAULT false,

    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gamificacion_eventos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_gam_evento_guardia_fecha" ON ops."gamificacion_eventos"("guardia_id", "fecha");
CREATE INDEX IF NOT EXISTS "idx_gam_evento_tenant_fecha" ON ops."gamificacion_eventos"("tenant_id", "fecha");
CREATE INDEX IF NOT EXISTS "idx_gam_evento_tipo" ON ops."gamificacion_eventos"("tipo");
CREATE INDEX IF NOT EXISTS "idx_gam_evento_procesado" ON ops."gamificacion_eventos"("procesado");

-- 4. GamificacionBadge
CREATE TABLE IF NOT EXISTS ops."gamificacion_badges" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,

    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,

    "categoria" TEXT NOT NULL,
    "icono" TEXT,
    "color" TEXT,

    "condicion_tipo" TEXT NOT NULL,
    "condicion_valor" INTEGER NOT NULL,
    "condicion_extra" JSONB,

    "es_secreto" BOOLEAN NOT NULL DEFAULT false,
    "es_unico" BOOLEAN NOT NULL DEFAULT true,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "puntos_bonus" INTEGER NOT NULL DEFAULT 50,

    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "gamificacion_badges_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_gam_badge_tenant_codigo" ON ops."gamificacion_badges"("tenant_id", "codigo");
CREATE INDEX IF NOT EXISTS "idx_gam_badge_tenant_activo" ON ops."gamificacion_badges"("tenant_id", "activo");

-- 5. GamificacionGuardiaBadge
CREATE TABLE IF NOT EXISTS ops."gamificacion_guardia_badges" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "guardia_id" UUID NOT NULL,
    "badge_id" UUID NOT NULL,

    "desbloqueado_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contexto" JSONB,
    "notificado" BOOLEAN NOT NULL DEFAULT false,

    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gamificacion_guardia_badges_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_gam_guardia_badge" ON ops."gamificacion_guardia_badges"("guardia_id", "badge_id");
CREATE INDEX IF NOT EXISTS "idx_gam_guardia_badge_guardia" ON ops."gamificacion_guardia_badges"("guardia_id");

-- 6. GamificacionReconocimiento
CREATE TABLE IF NOT EXISTS ops."gamificacion_reconocimientos" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "dador_id" UUID NOT NULL,
    "receptor_id" UUID NOT NULL,
    "installation_id" UUID,

    "categoria" TEXT NOT NULL,
    "mensaje" TEXT,

    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gamificacion_reconocimientos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_gam_reconocimiento_receptor" ON ops."gamificacion_reconocimientos"("receptor_id");
CREATE INDEX IF NOT EXISTS "idx_gam_reconocimiento_dador" ON ops."gamificacion_reconocimientos"("dador_id");
CREATE INDEX IF NOT EXISTS "idx_gam_reconocimiento_tenant_fecha" ON ops."gamificacion_reconocimientos"("tenant_id", "created_at");

-- 7. GamificacionFondoPremio
CREATE TABLE IF NOT EXISTS ops."gamificacion_fondos_premio" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "installation_id" UUID,

    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "tipo" TEXT NOT NULL,
    "monto_total_clp" INTEGER NOT NULL,

    "fecha_inicio" TIMESTAMPTZ(6) NOT NULL,
    "fecha_fin" TIMESTAMPTZ(6) NOT NULL,

    "distribucion" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'activo',

    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "gamificacion_fondos_premio_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_gam_fondo_tenant_status" ON ops."gamificacion_fondos_premio"("tenant_id", "status");

-- 8. GamificacionSugerenciaBono
CREATE TABLE IF NOT EXISTS ops."gamificacion_sugerencias_bono" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "fondo_id" UUID NOT NULL,
    "guardia_id" UUID NOT NULL,

    "posicion_ranking" INTEGER NOT NULL,
    "puntaje_periodo" INTEGER NOT NULL,
    "monto_sugerido_clp" INTEGER NOT NULL,

    "status" TEXT NOT NULL DEFAULT 'pendiente',
    "aprobado_por" TEXT,
    "aprobado_at" TIMESTAMPTZ(6),
    "rechazado_por" TEXT,
    "rechazado_at" TIMESTAMPTZ(6),
    "motivo_rechazo" TEXT,
    "pagado_at" TIMESTAMPTZ(6),
    "payroll_referencia" TEXT,

    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "gamificacion_sugerencias_bono_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_gam_sugerencia_fondo_guardia" ON ops."gamificacion_sugerencias_bono"("fondo_id", "guardia_id");
CREATE INDEX IF NOT EXISTS "idx_gam_sugerencia_tenant_status" ON ops."gamificacion_sugerencias_bono"("tenant_id", "status");

-- 9. GamificacionDesafio
CREATE TABLE IF NOT EXISTS ops."gamificacion_desafios" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "installation_id" UUID,

    "nombre" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,

    "condicion_tipo" TEXT NOT NULL,
    "condicion_valor" INTEGER NOT NULL,
    "condicion_extra" JSONB,

    "fecha_inicio" TIMESTAMPTZ(6) NOT NULL,
    "fecha_fin" TIMESTAMPTZ(6) NOT NULL,

    "puntos_recompensa" INTEGER NOT NULL DEFAULT 0,
    "badge_id" UUID,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "gamificacion_desafios_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_gam_desafio_tenant_activo" ON ops."gamificacion_desafios"("tenant_id", "activo");

-- 10. GamificacionDesafioParticipacion
CREATE TABLE IF NOT EXISTS ops."gamificacion_desafio_participaciones" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "desafio_id" UUID NOT NULL,
    "guardia_id" UUID NOT NULL,

    "progreso" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "completado" BOOLEAN NOT NULL DEFAULT false,
    "completado_at" TIMESTAMPTZ(6),
    "recompensa_entregada" BOOLEAN NOT NULL DEFAULT false,

    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "gamificacion_desafio_participaciones_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_gam_desafio_participacion" ON ops."gamificacion_desafio_participaciones"("desafio_id", "guardia_id");

-- 11. GamificacionBeneficio
CREATE TABLE IF NOT EXISTS ops."gamificacion_beneficios" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,

    "nombre" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "costo_puntos" INTEGER,
    "proveedor" TEXT,
    "imagen_url" TEXT,

    "stock_disponible" INTEGER,
    "fecha_inicio" TIMESTAMPTZ(6),
    "fecha_fin" TIMESTAMPTZ(6),
    "activo" BOOLEAN NOT NULL DEFAULT true,

    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "gamificacion_beneficios_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_gam_beneficio_tenant_activo" ON ops."gamificacion_beneficios"("tenant_id", "activo");

-- 12. GamificacionCanje
CREATE TABLE IF NOT EXISTS ops."gamificacion_canjes" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "guardia_id" UUID NOT NULL,
    "beneficio_id" UUID NOT NULL,

    "puntos_usados" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendiente',

    "entregado_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gamificacion_canjes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_gam_canje_guardia" ON ops."gamificacion_canjes"("guardia_id");

-- ══════════════════════════════════════════════════════════════════
--  Foreign Keys
-- ══════════════════════════════════════════════════════════════════

-- GamificacionConfig → Tenant
ALTER TABLE ops."gamificacion_config"
    ADD CONSTRAINT "gamificacion_config_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES public."Tenant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- GamificacionScoreGuardia → OpsGuardia
ALTER TABLE ops."gamificacion_score_guardia"
    ADD CONSTRAINT "gamificacion_score_guardia_guardia_id_fkey"
    FOREIGN KEY ("guardia_id") REFERENCES ops."guardias"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- GamificacionScoreGuardia → CrmInstallation
ALTER TABLE ops."gamificacion_score_guardia"
    ADD CONSTRAINT "gamificacion_score_guardia_installation_id_fkey"
    FOREIGN KEY ("installation_id") REFERENCES crm."installations"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- GamificacionEvento → OpsGuardia
ALTER TABLE ops."gamificacion_eventos"
    ADD CONSTRAINT "gamificacion_eventos_guardia_id_fkey"
    FOREIGN KEY ("guardia_id") REFERENCES ops."guardias"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- GamificacionEvento → CrmInstallation
ALTER TABLE ops."gamificacion_eventos"
    ADD CONSTRAINT "gamificacion_eventos_installation_id_fkey"
    FOREIGN KEY ("installation_id") REFERENCES crm."installations"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- GamificacionGuardiaBadge → OpsGuardia
ALTER TABLE ops."gamificacion_guardia_badges"
    ADD CONSTRAINT "gamificacion_guardia_badges_guardia_id_fkey"
    FOREIGN KEY ("guardia_id") REFERENCES ops."guardias"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- GamificacionGuardiaBadge → GamificacionBadge
ALTER TABLE ops."gamificacion_guardia_badges"
    ADD CONSTRAINT "gamificacion_guardia_badges_badge_id_fkey"
    FOREIGN KEY ("badge_id") REFERENCES ops."gamificacion_badges"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- GamificacionReconocimiento → OpsGuardia (dador)
ALTER TABLE ops."gamificacion_reconocimientos"
    ADD CONSTRAINT "gamificacion_reconocimientos_dador_id_fkey"
    FOREIGN KEY ("dador_id") REFERENCES ops."guardias"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- GamificacionReconocimiento → OpsGuardia (receptor)
ALTER TABLE ops."gamificacion_reconocimientos"
    ADD CONSTRAINT "gamificacion_reconocimientos_receptor_id_fkey"
    FOREIGN KEY ("receptor_id") REFERENCES ops."guardias"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- GamificacionReconocimiento → CrmInstallation
ALTER TABLE ops."gamificacion_reconocimientos"
    ADD CONSTRAINT "gamificacion_reconocimientos_installation_id_fkey"
    FOREIGN KEY ("installation_id") REFERENCES crm."installations"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- GamificacionFondoPremio → CrmInstallation
ALTER TABLE ops."gamificacion_fondos_premio"
    ADD CONSTRAINT "gamificacion_fondos_premio_installation_id_fkey"
    FOREIGN KEY ("installation_id") REFERENCES crm."installations"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- GamificacionSugerenciaBono → GamificacionFondoPremio
ALTER TABLE ops."gamificacion_sugerencias_bono"
    ADD CONSTRAINT "gamificacion_sugerencias_bono_fondo_id_fkey"
    FOREIGN KEY ("fondo_id") REFERENCES ops."gamificacion_fondos_premio"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- GamificacionSugerenciaBono → OpsGuardia
ALTER TABLE ops."gamificacion_sugerencias_bono"
    ADD CONSTRAINT "gamificacion_sugerencias_bono_guardia_id_fkey"
    FOREIGN KEY ("guardia_id") REFERENCES ops."guardias"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- GamificacionDesafio → CrmInstallation
ALTER TABLE ops."gamificacion_desafios"
    ADD CONSTRAINT "gamificacion_desafios_installation_id_fkey"
    FOREIGN KEY ("installation_id") REFERENCES crm."installations"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- GamificacionDesafioParticipacion → GamificacionDesafio
ALTER TABLE ops."gamificacion_desafio_participaciones"
    ADD CONSTRAINT "gamificacion_desafio_participaciones_desafio_id_fkey"
    FOREIGN KEY ("desafio_id") REFERENCES ops."gamificacion_desafios"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- GamificacionDesafioParticipacion → OpsGuardia
ALTER TABLE ops."gamificacion_desafio_participaciones"
    ADD CONSTRAINT "gamificacion_desafio_participaciones_guardia_id_fkey"
    FOREIGN KEY ("guardia_id") REFERENCES ops."guardias"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- GamificacionCanje → OpsGuardia
ALTER TABLE ops."gamificacion_canjes"
    ADD CONSTRAINT "gamificacion_canjes_guardia_id_fkey"
    FOREIGN KEY ("guardia_id") REFERENCES ops."guardias"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- GamificacionCanje → GamificacionBeneficio
ALTER TABLE ops."gamificacion_canjes"
    ADD CONSTRAINT "gamificacion_canjes_beneficio_id_fkey"
    FOREIGN KEY ("beneficio_id") REFERENCES ops."gamificacion_beneficios"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
