# Gamificación Fase 1 — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the gamification data layer, calculation engine, API routes, cron job, permissions, and seed data — NO UI.

**Architecture:** 10 new Prisma models in ops schema, a `src/lib/gamification/` service layer with 5 dimension calculators, event-driven points engine, cron job for daily consolidation, REST API routes for admin/portal, and permission integration into both v1/v2 systems.

**Tech Stack:** Prisma + PostgreSQL (multi-schema ops), Next.js 15 App Router API Routes, TypeScript, Zod validation.

**Key Conventions (from codebase):**
- PK: `id String @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid`
- All fields: `@map("snake_case")`
- DateTimes: `@db.Timestamptz(6)`
- FK to UUID tables: `@db.Uuid`
- tenantId: raw `String @map("tenant_id")` (no Tenant relation in ops models, except GamificacionConfig which needs @@unique)
- API: `requireAuth()` → `resolveApiPerms()` → `canView/canEdit` → Prisma query → `NextResponse.json({ success, data })`
- Portal API: no `requireAuth()`, validate query params, same response format
- Cron: GET handler, Bearer CRON_SECRET validation, batch processing with `take` limits
- Calculation services: pure functions, `Pick<>` typed inputs, structured breakdown outputs
- Seeds: `upsert` with `tenantId + slug`, sequential orchestration

---

## Task 1: Prisma Schema — New Gamification Models

**Files:**
- Modify: `prisma/schema.prisma`

### Step 1: Add GamificacionConfig model

Add at end of file, before any closing comments. Follow exact OpsRondaEjecucion patterns.

```prisma
// ══════════════════════════════════════════════════════════════════
//  GAMIFICACIÓN
// ══════════════════════════════════════════════════════════════════

model GamificacionConfig {
  id        String @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  tenantId  String @unique @map("tenant_id")

  // ── Pesos dimensiones Trust Score (suman 100) ──
  pesoRondas          Int @default(30) @map("peso_rondas")
  pesoAsistencia      Int @default(25) @map("peso_asistencia")
  pesoSistemaDigital  Int @default(15) @map("peso_sistema_digital")
  pesoSupervision     Int @default(20) @map("peso_supervision")
  pesoCapacitacion    Int @default(10) @map("peso_capacitacion")

  // ── Puntos por acción: Asistencia ──
  ptsEntradaPuntual        Int @default(10)   @map("pts_entrada_puntual")
  ptsSalidaCompleta        Int @default(10)   @map("pts_salida_completa")
  ptsTardanzaPenalizacion  Int @default(-20)  @map("pts_tardanza_penalizacion")
  ptsInasistenciaInjust    Int @default(-100) @map("pts_inasistencia_injust")
  ptsTurnoExtra            Int @default(80)   @map("pts_turno_extra")
  ptsAsistenciaPerfectaMes Int @default(200)  @map("pts_asistencia_perfecta_mes")

  // ── Puntos por acción: Rondas ──
  ptsRondaPerfecta      Int @default(20)  @map("pts_ronda_perfecta")
  ptsRondaCompletada    Int @default(10)  @map("pts_ronda_completada")
  ptsRondaNoRealizada   Int @default(-30) @map("pts_ronda_no_realizada")
  ptsIncidenteReportado Int @default(15)  @map("pts_incidente_reportado")
  ptsTareaCheckpoint    Int @default(5)   @map("pts_tarea_checkpoint")

  // ── Puntos por acción: Sistema digital ──
  ptsMarcacionDigital  Int @default(5)  @map("pts_marcacion_digital")
  ptsBonusConsistencia Int @default(30) @map("pts_bonus_consistencia")
  ptsReporteDigital    Int @default(5)  @map("pts_reporte_digital")

  // ── Puntos por acción: Supervisión ──
  ptsEvalSobresaliente Int @default(100) @map("pts_eval_sobresaliente")
  ptsEvalBuena         Int @default(50)  @map("pts_eval_buena")
  ptsHallazgoNegativo  Int @default(-25) @map("pts_hallazgo_negativo")

  // ── Puntos por acción: Capacitación ──
  ptsExamenAprobado  Int @default(50)  @map("pts_examen_aprobado")
  ptsExamenPerfecto  Int @default(100) @map("pts_examen_perfecto")

  // ── Puntos por acción: Social ──
  ptsReconocimientoRecibido Int @default(10) @map("pts_reconocimiento_recibido")
  ptsReconocimientoDado     Int @default(5)  @map("pts_reconocimiento_dado")
  ptsBadgeDesbloqueado      Int @default(50) @map("pts_badge_desbloqueado")

  // ── Puntos por acción: Rachas ──
  ptsBonusRacha7dias       Int @default(50)  @map("pts_bonus_racha_7dias")
  ptsBonusRacha30dias      Int @default(200) @map("pts_bonus_racha_30dias")
  ptsBonusRacha90dias      Int @default(500) @map("pts_bonus_racha_90dias")
  ptsBonusSemanalPerfecta  Int @default(40)  @map("pts_bonus_semanal_perfecta")

  // ── Umbrales de niveles ──
  nivel1Nombre String @default("Centinela")  @map("nivel_1_nombre")
  nivel1Puntos Int    @default(0)             @map("nivel_1_puntos")
  nivel2Nombre String @default("Vigía")       @map("nivel_2_nombre")
  nivel2Puntos Int    @default(500)           @map("nivel_2_puntos")
  nivel3Nombre String @default("Guardián")    @map("nivel_3_nombre")
  nivel3Puntos Int    @default(1500)          @map("nivel_3_puntos")
  nivel4Nombre String @default("Protector")   @map("nivel_4_nombre")
  nivel4Puntos Int    @default(3500)          @map("nivel_4_puntos")
  nivel5Nombre String @default("Comandante")  @map("nivel_5_nombre")
  nivel5Puntos Int    @default(7000)          @map("nivel_5_puntos")

  // ── Configuración general ──
  puntosPorClp          Float   @default(10)      @map("puntos_por_clp")
  maxPuntosDiarios      Int     @default(200)     @map("max_puntos_diarios")
  expiracionPuntosMeses Int     @default(12)      @map("expiracion_puntos_meses")
  rankingResetDia       String  @default("lunes") @map("ranking_reset_dia")
  bonosHabilitados      Boolean @default(false)   @map("bonos_habilitados")
  moduloActivo          Boolean @default(false)   @map("modulo_activo")

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt     @map("updated_at") @db.Timestamptz(6)

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@map("gamificacion_config")
  @@schema("ops")
}
```

### Step 2: Add GamificacionScoreGuardia model

```prisma
model GamificacionScoreGuardia {
  id             String @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  tenantId       String @map("tenant_id")
  guardiaId      String @map("guardia_id") @db.Uuid
  installationId String? @map("installation_id") @db.Uuid

  // ── Período ──
  periodo     String   @map("periodo")
  periodoTipo String   @map("periodo_tipo")
  fechaInicio DateTime @map("fecha_inicio") @db.Timestamptz(6)
  fechaFin    DateTime @map("fecha_fin")    @db.Timestamptz(6)

  // ── Trust Score compuesto (0-100) ──
  trustScore Float @default(0) @map("trust_score")

  // ── Scores por dimensión (0-100) ──
  scoreRondas         Float @default(0) @map("score_rondas")
  scoreAsistencia     Float @default(0) @map("score_asistencia")
  scoreSistemaDigital Float @default(0) @map("score_sistema_digital")
  scoreSupervision    Float @default(0) @map("score_supervision")
  scoreCapacitacion   Float @default(0) @map("score_capacitacion")

  // ── Desglose detallado ──
  detalleRondas         Json? @map("detalle_rondas")          @db.JsonB
  detalleAsistencia     Json? @map("detalle_asistencia")      @db.JsonB
  detalleSistemaDigital Json? @map("detalle_sistema_digital") @db.JsonB
  detalleSupervision    Json? @map("detalle_supervision")     @db.JsonB
  detalleCapacitacion   Json? @map("detalle_capacitacion")    @db.JsonB

  // ── Puntos ──
  puntosGanados  Int @default(0) @map("puntos_ganados")
  puntosPerdidos Int @default(0) @map("puntos_perdidos")
  puntosNetos    Int @default(0) @map("puntos_netos")

  // ── Ranking ──
  rankingInstalacion        Int? @map("ranking_instalacion")
  rankingGlobal             Int? @map("ranking_global")
  totalGuardiasInstalacion  Int? @map("total_guardias_instalacion")
  totalGuardiasGlobal       Int? @map("total_guardias_global")

  // ── Rachas ──
  rachaActual Int @default(0) @map("racha_actual")
  mejorRacha  Int @default(0) @map("mejor_racha")

  // ── Nivel ──
  nivelActual                String @default("Centinela") @map("nivel_actual")
  puntosAcumuladosHistorico  Int    @default(0)           @map("puntos_acumulados_historico")

  calculadoAt DateTime @default(now()) @map("calculado_at") @db.Timestamptz(6)
  createdAt   DateTime @default(now()) @map("created_at")   @db.Timestamptz(6)
  updatedAt   DateTime @updatedAt     @map("updated_at")   @db.Timestamptz(6)

  guardia      OpsGuardia       @relation(fields: [guardiaId], references: [id], onDelete: Cascade)
  installation CrmInstallation? @relation("gamificacion_score_installation", fields: [installationId], references: [id], onDelete: SetNull)

  @@unique([guardiaId, periodo, periodoTipo], map: "uq_gam_score_guardia_periodo")
  @@index([tenantId, periodo], map: "idx_gam_score_tenant_periodo")
  @@index([installationId, periodo], map: "idx_gam_score_installation_periodo")
  @@index([trustScore], map: "idx_gam_score_trust_score")
  @@index([rankingGlobal], map: "idx_gam_score_ranking_global")
  @@map("gamificacion_score_guardia")
  @@schema("ops")
}
```

### Step 3: Add GamificacionEvento model

```prisma
model GamificacionEvento {
  id             String  @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  tenantId       String  @map("tenant_id")
  guardiaId      String  @map("guardia_id") @db.Uuid
  installationId String? @map("installation_id") @db.Uuid

  tipo      String @map("tipo")
  dimension String @map("dimension")
  puntos    Int    @map("puntos")

  descripcion String @map("descripcion")

  referenciaModelo String? @map("referencia_modelo")
  referenciaId     String? @map("referencia_id")

  fecha     DateTime @default(now()) @map("fecha")     @db.Timestamptz(6)
  procesado Boolean  @default(false) @map("procesado")

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  guardia      OpsGuardia       @relation(fields: [guardiaId], references: [id], onDelete: Cascade)
  installation CrmInstallation? @relation("gamificacion_evento_installation", fields: [installationId], references: [id], onDelete: SetNull)

  @@index([guardiaId, fecha], map: "idx_gam_evento_guardia_fecha")
  @@index([tenantId, fecha], map: "idx_gam_evento_tenant_fecha")
  @@index([tipo], map: "idx_gam_evento_tipo")
  @@index([procesado], map: "idx_gam_evento_procesado")
  @@map("gamificacion_eventos")
  @@schema("ops")
}
```

### Step 4: Add GamificacionBadge and GamificacionGuardiaBadge models

```prisma
model GamificacionBadge {
  id       String @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  tenantId String @map("tenant_id")

  codigo      String @map("codigo")
  nombre      String @map("nombre")
  descripcion String @map("descripcion")

  categoria String  @map("categoria")
  icono     String? @map("icono")
  color     String? @map("color")

  condicionTipo  String @map("condicion_tipo")
  condicionValor Int    @map("condicion_valor")
  condicionExtra Json?  @map("condicion_extra") @db.JsonB

  esSecreto   Boolean @default(false) @map("es_secreto")
  esUnico     Boolean @default(true)  @map("es_unico")
  activo      Boolean @default(true)  @map("activo")
  orden       Int     @default(0)     @map("orden")
  puntosBonus Int     @default(50)    @map("puntos_bonus")

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt     @map("updated_at") @db.Timestamptz(6)

  guardiaBadges GamificacionGuardiaBadge[]

  @@unique([tenantId, codigo], map: "uq_gam_badge_tenant_codigo")
  @@index([tenantId, activo], map: "idx_gam_badge_tenant_activo")
  @@map("gamificacion_badges")
  @@schema("ops")
}

model GamificacionGuardiaBadge {
  id        String @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  tenantId  String @map("tenant_id")
  guardiaId String @map("guardia_id") @db.Uuid
  badgeId   String @map("badge_id")   @db.Uuid

  desbloqueadoAt DateTime @default(now()) @map("desbloqueado_at") @db.Timestamptz(6)
  contexto       Json?    @map("contexto") @db.JsonB
  notificado     Boolean  @default(false) @map("notificado")

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  guardia OpsGuardia        @relation(fields: [guardiaId], references: [id], onDelete: Cascade)
  badge   GamificacionBadge @relation(fields: [badgeId], references: [id], onDelete: Cascade)

  @@unique([guardiaId, badgeId], map: "uq_gam_guardia_badge")
  @@index([guardiaId], map: "idx_gam_guardia_badge_guardia")
  @@map("gamificacion_guardia_badges")
  @@schema("ops")
}
```

### Step 5: Add GamificacionReconocimiento model

```prisma
model GamificacionReconocimiento {
  id             String  @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  tenantId       String  @map("tenant_id")
  dadorId        String  @map("dador_id")    @db.Uuid
  receptorId     String  @map("receptor_id") @db.Uuid
  installationId String? @map("installation_id") @db.Uuid

  categoria String  @map("categoria")
  mensaje   String? @map("mensaje")

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  dadorGuardia    OpsGuardia       @relation("reconocimientosDados", fields: [dadorId], references: [id], onDelete: Cascade)
  receptorGuardia OpsGuardia       @relation("reconocimientosRecibidos", fields: [receptorId], references: [id], onDelete: Cascade)
  installation    CrmInstallation? @relation("gamificacion_reconocimiento_installation", fields: [installationId], references: [id], onDelete: SetNull)

  @@index([receptorId], map: "idx_gam_reconocimiento_receptor")
  @@index([dadorId], map: "idx_gam_reconocimiento_dador")
  @@index([tenantId, createdAt], map: "idx_gam_reconocimiento_tenant_fecha")
  @@map("gamificacion_reconocimientos")
  @@schema("ops")
}
```

### Step 6: Add GamificacionFondoPremio and GamificacionSugerenciaBono models

```prisma
model GamificacionFondoPremio {
  id             String  @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  tenantId       String  @map("tenant_id")
  installationId String? @map("installation_id") @db.Uuid

  nombre       String  @map("nombre")
  descripcion  String? @map("descripcion")
  tipo         String  @map("tipo")
  montoTotalClp Int    @map("monto_total_clp")

  fechaInicio  DateTime @map("fecha_inicio") @db.Timestamptz(6)
  fechaFin     DateTime @map("fecha_fin")    @db.Timestamptz(6)

  distribucion Json   @map("distribucion") @db.JsonB
  status       String @default("activo") @map("status")

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt     @map("updated_at") @db.Timestamptz(6)

  installation    CrmInstallation?          @relation("gamificacion_fondo_installation", fields: [installationId], references: [id], onDelete: SetNull)
  sugerenciasBono GamificacionSugerenciaBono[]

  @@index([tenantId, status], map: "idx_gam_fondo_tenant_status")
  @@map("gamificacion_fondos_premio")
  @@schema("ops")
}

model GamificacionSugerenciaBono {
  id        String @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  tenantId  String @map("tenant_id")
  fondoId   String @map("fondo_id")   @db.Uuid
  guardiaId String @map("guardia_id") @db.Uuid

  posicionRanking  Int @map("posicion_ranking")
  puntajePeriodo   Int @map("puntaje_periodo")
  montoSugeridoClp Int @map("monto_sugerido_clp")

  status        String    @default("pendiente") @map("status")
  aprobadoPor   String?   @map("aprobado_por")
  aprobadoAt    DateTime? @map("aprobado_at")    @db.Timestamptz(6)
  rechazadoPor  String?   @map("rechazado_por")
  rechazadoAt   DateTime? @map("rechazado_at")   @db.Timestamptz(6)
  motivoRechazo String?   @map("motivo_rechazo")
  pagadoAt      DateTime? @map("pagado_at")      @db.Timestamptz(6)
  payrollReferencia String? @map("payroll_referencia")

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt     @map("updated_at") @db.Timestamptz(6)

  fondo   GamificacionFondoPremio @relation(fields: [fondoId], references: [id], onDelete: Cascade)
  guardia OpsGuardia              @relation(fields: [guardiaId], references: [id], onDelete: Cascade)

  @@unique([fondoId, guardiaId], map: "uq_gam_sugerencia_fondo_guardia")
  @@index([tenantId, status], map: "idx_gam_sugerencia_tenant_status")
  @@map("gamificacion_sugerencias_bono")
  @@schema("ops")
}
```

### Step 7: Add GamificacionDesafio and GamificacionDesafioParticipacion models

```prisma
model GamificacionDesafio {
  id             String  @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  tenantId       String  @map("tenant_id")
  installationId String? @map("installation_id") @db.Uuid

  nombre       String @map("nombre")
  descripcion  String @map("descripcion")
  tipo         String @map("tipo")

  condicionTipo  String @map("condicion_tipo")
  condicionValor Int    @map("condicion_valor")
  condicionExtra Json?  @map("condicion_extra") @db.JsonB

  fechaInicio DateTime @map("fecha_inicio") @db.Timestamptz(6)
  fechaFin    DateTime @map("fecha_fin")    @db.Timestamptz(6)

  puntosRecompensa Int     @default(0) @map("puntos_recompensa")
  badgeId          String? @map("badge_id") @db.Uuid
  activo           Boolean @default(true) @map("activo")

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt     @map("updated_at") @db.Timestamptz(6)

  installation    CrmInstallation?                    @relation("gamificacion_desafio_installation", fields: [installationId], references: [id], onDelete: SetNull)
  participaciones GamificacionDesafioParticipacion[]

  @@index([tenantId, activo], map: "idx_gam_desafio_tenant_activo")
  @@map("gamificacion_desafios")
  @@schema("ops")
}

model GamificacionDesafioParticipacion {
  id        String @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  tenantId  String @map("tenant_id")
  desafioId String @map("desafio_id") @db.Uuid
  guardiaId String @map("guardia_id") @db.Uuid

  progreso            Float    @default(0) @map("progreso")
  completado          Boolean  @default(false) @map("completado")
  completadoAt        DateTime? @map("completado_at") @db.Timestamptz(6)
  recompensaEntregada Boolean  @default(false) @map("recompensa_entregada")

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt     @map("updated_at") @db.Timestamptz(6)

  desafio GamificacionDesafio @relation(fields: [desafioId], references: [id], onDelete: Cascade)
  guardia OpsGuardia          @relation(fields: [guardiaId], references: [id], onDelete: Cascade)

  @@unique([desafioId, guardiaId], map: "uq_gam_desafio_participacion")
  @@map("gamificacion_desafio_participaciones")
  @@schema("ops")
}
```

### Step 8: Add GamificacionBeneficio and GamificacionCanje models

```prisma
model GamificacionBeneficio {
  id       String @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  tenantId String @map("tenant_id")

  nombre      String  @map("nombre")
  descripcion String  @map("descripcion")
  categoria   String  @map("categoria")
  costoPuntos Int?    @map("costo_puntos")
  proveedor   String? @map("proveedor")
  imagenUrl   String? @map("imagen_url")

  stockDisponible Int?      @map("stock_disponible")
  fechaInicio     DateTime? @map("fecha_inicio") @db.Timestamptz(6)
  fechaFin        DateTime? @map("fecha_fin")    @db.Timestamptz(6)
  activo          Boolean   @default(true) @map("activo")

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt     @map("updated_at") @db.Timestamptz(6)

  canjes GamificacionCanje[]

  @@index([tenantId, activo], map: "idx_gam_beneficio_tenant_activo")
  @@map("gamificacion_beneficios")
  @@schema("ops")
}

model GamificacionCanje {
  id           String @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  tenantId     String @map("tenant_id")
  guardiaId    String @map("guardia_id")    @db.Uuid
  beneficioId  String @map("beneficio_id")  @db.Uuid

  puntosUsados Int    @map("puntos_usados")
  status       String @default("pendiente") @map("status")

  entregadoAt DateTime? @map("entregado_at") @db.Timestamptz(6)
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)

  guardia   OpsGuardia            @relation(fields: [guardiaId], references: [id], onDelete: Cascade)
  beneficio GamificacionBeneficio @relation(fields: [beneficioId], references: [id], onDelete: Cascade)

  @@index([guardiaId], map: "idx_gam_canje_guardia")
  @@map("gamificacion_canjes")
  @@schema("ops")
}
```

### Step 9: Add back-references on OpsGuardia

Find the `OpsGuardia` model (line ~2264, after `checkpointTaskResponses`) and add:

```prisma
  gamificacionScores           GamificacionScoreGuardia[]
  gamificacionEventos          GamificacionEvento[]
  gamificacionBadges           GamificacionGuardiaBadge[]
  reconocimientosDados         GamificacionReconocimiento[]          @relation("reconocimientosDados")
  reconocimientosRecibidos     GamificacionReconocimiento[]          @relation("reconocimientosRecibidos")
  gamificacionSugerenciasBono  GamificacionSugerenciaBono[]
  gamificacionDesafios         GamificacionDesafioParticipacion[]
  gamificacionCanjes           GamificacionCanje[]
```

### Step 10: Add back-references on CrmInstallation

Find `CrmInstallation` model (line ~1419, after `accessControlDevices`) and add:

```prisma
  gamificacionScores          GamificacionScoreGuardia[]    @relation("gamificacion_score_installation")
  gamificacionEventos         GamificacionEvento[]          @relation("gamificacion_evento_installation")
  gamificacionReconocimientos GamificacionReconocimiento[]  @relation("gamificacion_reconocimiento_installation")
  gamificacionFondosPremio    GamificacionFondoPremio[]     @relation("gamificacion_fondo_installation")
  gamificacionDesafios        GamificacionDesafio[]         @relation("gamificacion_desafio_installation")
```

### Step 11: Add back-reference on Tenant

Find `Tenant` model (line ~52, after `aiProviders`) and add:

```prisma
  gamificacionConfig GamificacionConfig?
```

### Step 12: Generate Prisma client and create migration

Run: `cd /Users/caco/Desktop/Cursor/opai.worktrees/gamificacion && npx prisma generate`
Expected: "Generated Prisma Client" success message

Run: `npx prisma migrate dev --name add_gamificacion_models --create-only`
Expected: Migration created without errors

### Step 13: Apply the migration

Run: `npx prisma migrate dev`
Expected: Migration applied successfully

### Step 14: Verify compilation

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors (or only pre-existing errors unrelated to gamificación)

### Step 15: Commit

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(gamificacion): add 12 Prisma models for gamification module

Models: GamificacionConfig, GamificacionScoreGuardia, GamificacionEvento,
GamificacionBadge, GamificacionGuardiaBadge, GamificacionReconocimiento,
GamificacionFondoPremio, GamificacionSugerenciaBono, GamificacionDesafio,
GamificacionDesafioParticipacion, GamificacionBeneficio, GamificacionCanje

Back-references added to OpsGuardia, CrmInstallation, and Tenant."
```

---

## Task 2: Gamification Service Layer — Config + Types

**Files:**
- Create: `src/lib/gamification/index.ts`
- Create: `src/lib/gamification/types.ts`
- Create: `src/lib/gamification/config.ts`

### Step 1: Create types file

```typescript
// src/lib/gamification/types.ts

import type { GamificacionConfig } from "@prisma/client";

// ── Dimension Score Result ──

export interface DimensionResult {
  score: number; // 0-100
  detalle: Record<string, unknown>;
}

// ── Trust Score Compuesto ──

export interface TrustScoreCompuesto {
  trustScore: number; // 0-100
  scoreRondas: number;
  scoreAsistencia: number;
  scoreSistemaDigital: number;
  scoreSupervision: number;
  scoreCapacitacion: number;
  detalleRondas: Record<string, unknown>;
  detalleAsistencia: Record<string, unknown>;
  detalleSistemaDigital: Record<string, unknown>;
  detalleSupervision: Record<string, unknown>;
  detalleCapacitacion: Record<string, unknown>;
}

// ── Evento Types ──

export type EventoTipo =
  | "ronda_perfecta"
  | "ronda_completada"
  | "ronda_no_realizada"
  | "entrada_puntual"
  | "salida_completa"
  | "tardanza"
  | "inasistencia"
  | "turno_extra"
  | "marcacion_digital"
  | "eval_sobresaliente"
  | "eval_buena"
  | "hallazgo_negativo"
  | "examen_aprobado"
  | "examen_perfecto"
  | "incidente_reportado"
  | "tarea_checkpoint"
  | "reconocimiento_recibido"
  | "reconocimiento_dado"
  | "badge_desbloqueado"
  | "racha_bonus"
  | "semana_perfecta"
  | "asistencia_perfecta_mes";

export type EventoDimension =
  | "rondas"
  | "asistencia"
  | "sistema_digital"
  | "supervision"
  | "capacitacion"
  | "social"
  | "bonus";

// ── Nivel ──

export interface NivelDefinition {
  nombre: string;
  puntosMinimos: number;
}

// ── Config helper type ──

export type GamificacionConfigData = GamificacionConfig;
```

### Step 2: Create config helper

```typescript
// src/lib/gamification/config.ts

import { prisma } from "@/lib/prisma";
import type { GamificacionConfig } from "@prisma/client";
import type { NivelDefinition } from "./types";

const configCache = new Map<string, { data: GamificacionConfig; fetchedAt: number }>();
const CACHE_TTL_MS = 60_000; // 1 minute

export async function getGamificacionConfig(tenantId: string): Promise<GamificacionConfig | null> {
  const cached = configCache.get(tenantId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  const config = await prisma.gamificacionConfig.findUnique({
    where: { tenantId },
  });

  if (config) {
    configCache.set(tenantId, { data: config, fetchedAt: Date.now() });
  }

  return config;
}

export function clearConfigCache(tenantId?: string): void {
  if (tenantId) {
    configCache.delete(tenantId);
  } else {
    configCache.clear();
  }
}

export function getNiveles(config: GamificacionConfig): NivelDefinition[] {
  return [
    { nombre: config.nivel1Nombre, puntosMinimos: config.nivel1Puntos },
    { nombre: config.nivel2Nombre, puntosMinimos: config.nivel2Puntos },
    { nombre: config.nivel3Nombre, puntosMinimos: config.nivel3Puntos },
    { nombre: config.nivel4Nombre, puntosMinimos: config.nivel4Puntos },
    { nombre: config.nivel5Nombre, puntosMinimos: config.nivel5Puntos },
  ].sort((a, b) => b.puntosMinimos - a.puntosMinimos); // highest first
}

export function getNivelActual(config: GamificacionConfig, puntosAcumulados: number): string {
  const niveles = getNiveles(config);
  for (const nivel of niveles) {
    if (puntosAcumulados >= nivel.puntosMinimos) {
      return nivel.nombre;
    }
  }
  return config.nivel1Nombre;
}

export function getNextNivel(
  config: GamificacionConfig,
  puntosAcumulados: number,
): { nombre: string; puntosRequeridos: number; puntosFaltantes: number } | null {
  const niveles = getNiveles(config).reverse(); // lowest first
  for (const nivel of niveles) {
    if (puntosAcumulados < nivel.puntosMinimos) {
      return {
        nombre: nivel.nombre,
        puntosRequeridos: nivel.puntosMinimos,
        puntosFaltantes: nivel.puntosMinimos - puntosAcumulados,
      };
    }
  }
  return null; // already at max level
}
```

### Step 3: Create index file

```typescript
// src/lib/gamification/index.ts

export { getGamificacionConfig, clearConfigCache, getNiveles, getNivelActual, getNextNivel } from "./config";
export type {
  DimensionResult,
  TrustScoreCompuesto,
  EventoTipo,
  EventoDimension,
  NivelDefinition,
} from "./types";
```

### Step 4: Verify compilation

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No new errors

### Step 5: Commit

```bash
git add src/lib/gamification/
git commit -m "feat(gamificacion): add service layer with types and config helper"
```

---

## Task 3: Dimension Calculators (5 dimensions)

**Files:**
- Create: `src/lib/gamification/dimensions/rondas.ts`
- Create: `src/lib/gamification/dimensions/asistencia.ts`
- Create: `src/lib/gamification/dimensions/sistema-digital.ts`
- Create: `src/lib/gamification/dimensions/supervision.ts`
- Create: `src/lib/gamification/dimensions/capacitacion.ts`

### Step 1: Create rondas dimension calculator

```typescript
// src/lib/gamification/dimensions/rondas.ts

import { prisma } from "@/lib/prisma";
import type { DimensionResult } from "../types";

export async function calcularScoreRondas(
  guardiaId: string,
  tenantId: string,
  fechaInicio: Date,
  fechaFin: Date,
): Promise<DimensionResult> {
  const ejecuciones = await prisma.opsRondaEjecucion.findMany({
    where: {
      tenantId,
      guardiaId,
      scheduledAt: { gte: fechaInicio, lte: fechaFin },
    },
    select: {
      status: true,
      trustScore: true,
    },
  });

  if (ejecuciones.length === 0) {
    return { score: -1, detalle: { sinDatos: true } }; // -1 = sin datos, redistribuir peso
  }

  const rondasProgramadas = ejecuciones.length;
  const rondasCompletadas = ejecuciones.filter(
    (e) => e.status === "completada" || e.status === "incompleta",
  ).length;
  const rondasPerfectas = ejecuciones.filter(
    (e) => e.status === "completada" && e.trustScore >= 90,
  ).length;

  const trustScoresCompletadas = ejecuciones
    .filter((e) => e.status === "completada" || e.status === "incompleta")
    .map((e) => e.trustScore);

  const promedioTrustScore =
    trustScoresCompletadas.length > 0
      ? trustScoresCompletadas.reduce((a, b) => a + b, 0) / trustScoresCompletadas.length
      : 0;

  const tasaCompletitud = rondasProgramadas > 0 ? rondasCompletadas / rondasProgramadas : 0;

  // Incidentes reportados (positivo)
  const incidentesCount = await prisma.opsRondaIncidente.count({
    where: {
      tenantId,
      guardiaId,
      createdAt: { gte: fechaInicio, lte: fechaFin },
    },
  });

  const bonusIncidentes = Math.min(incidentesCount * 0.02, 0.1);
  const score = Math.min(100, Math.max(0, Math.round(
    (tasaCompletitud * 0.5 + (promedioTrustScore / 100) * 0.4 + bonusIncidentes) * 100,
  )));

  return {
    score,
    detalle: {
      rondasProgramadas,
      rondasCompletadas,
      rondasPerfectas,
      promedioTrustScore: Math.round(promedioTrustScore * 10) / 10,
      tasaCompletitud: Math.round(tasaCompletitud * 100),
      incidentesReportados: incidentesCount,
    },
  };
}
```

### Step 2: Create asistencia dimension calculator

```typescript
// src/lib/gamification/dimensions/asistencia.ts

import { prisma } from "@/lib/prisma";
import type { DimensionResult } from "../types";

export async function calcularScoreAsistencia(
  guardiaId: string,
  tenantId: string,
  fechaInicio: Date,
  fechaFin: Date,
): Promise<DimensionResult> {
  const asistencias = await prisma.opsAsistenciaDiaria.findMany({
    where: {
      OR: [
        { actualGuardiaId: guardiaId },
        { plannedGuardiaId: guardiaId },
      ],
      date: { gte: fechaInicio, lte: fechaFin },
    },
    select: {
      attendanceStatus: true,
      checkInAt: true,
      checkOutAt: true,
      lateMinutes: true,
      workedMinutes: true,
      overtimeMinutes: true,
    },
  });

  if (asistencias.length === 0) {
    return { score: -1, detalle: { sinDatos: true } };
  }

  const diasProgramados = asistencias.length;
  const diasAsistidos = asistencias.filter(
    (a) => a.attendanceStatus !== "pendiente" && a.checkInAt != null,
  ).length;
  const tardanzas = asistencias.filter((a) => a.lateMinutes > 0).length;

  // Inasistencias injustificadas (via OpsGuardEvent)
  const inasistenciasInjust = await prisma.opsGuardEvent.count({
    where: {
      tenantId,
      guardiaId,
      category: "ausencia",
      subtype: { notIn: ["vacaciones", "licencia_medica", "permiso"] },
      startDate: { gte: fechaInicio, lte: fechaFin },
    },
  });

  // Turnos extra aprobados
  const turnosExtra = await prisma.opsTurnoExtra.count({
    where: {
      tenantId,
      guardiaId,
      status: "approved",
      date: { gte: fechaInicio, lte: fechaFin },
    },
  });

  const tasaAsistencia = diasProgramados > 0 ? diasAsistidos / diasProgramados : 0;
  const penalTardanza = diasProgramados > 0 ? (tardanzas / diasProgramados) * 0.3 : 0;
  const penalInasistencia = inasistenciasInjust * 0.15;
  const bonusTurnoExtra = Math.min(turnosExtra * 0.05, 0.15);

  const score = Math.min(100, Math.max(0, Math.round(
    (tasaAsistencia - penalTardanza - penalInasistencia + bonusTurnoExtra) * 100,
  )));

  return {
    score,
    detalle: {
      diasProgramados,
      diasAsistidos,
      tardanzas,
      inasistenciasInjustificadas: inasistenciasInjust,
      turnosExtra,
      tasaAsistencia: Math.round(tasaAsistencia * 100),
    },
  };
}
```

### Step 3: Create sistema-digital dimension calculator

```typescript
// src/lib/gamification/dimensions/sistema-digital.ts

import { prisma } from "@/lib/prisma";
import type { DimensionResult } from "../types";

export async function calcularScoreSistemaDigital(
  guardiaId: string,
  tenantId: string,
  fechaInicio: Date,
  fechaFin: Date,
): Promise<DimensionResult> {
  // Digital markings (via OPAI system: rut_pin, qr, facial)
  const marcacionesDigitales = await prisma.opsMarcacion.count({
    where: {
      tenantId,
      guardiaId,
      timestamp: { gte: fechaInicio, lte: fechaFin },
      metodoId: { in: ["rut_pin", "qr", "facial"] },
    },
  });

  // Total attendance entries with check-in (entries + exits = *2)
  const asistenciasConCheckin = await prisma.opsAsistenciaDiaria.count({
    where: {
      OR: [
        { actualGuardiaId: guardiaId },
        { plannedGuardiaId: guardiaId },
      ],
      date: { gte: fechaInicio, lte: fechaFin },
      checkInAt: { not: null },
    },
  });

  const marcacionesTotales = asistenciasConCheckin * 2; // entry + exit

  if (marcacionesTotales === 0) {
    return { score: -1, detalle: { sinDatos: true } };
  }

  const tasaDigital = marcacionesTotales > 0 ? Math.min(1, marcacionesDigitales / marcacionesTotales) : 0;

  // Consistency bonus: check if 7+ consecutive days all digital
  // Simplified: check if digital rate is very high over the period
  const bonusConsistencia = tasaDigital >= 0.95 ? 0.1 : 0;

  const score = Math.min(100, Math.max(0, Math.round(
    (tasaDigital + bonusConsistencia) * 100,
  )));

  return {
    score,
    detalle: {
      marcacionesDigitales,
      marcacionesTotales,
      tasaDigital: Math.round(tasaDigital * 100),
      bonusConsistencia: bonusConsistencia > 0,
    },
  };
}
```

### Step 4: Create supervision dimension calculator

```typescript
// src/lib/gamification/dimensions/supervision.ts

import { prisma } from "@/lib/prisma";
import type { DimensionResult } from "../types";

export async function calcularScoreSupervision(
  guardiaId: string,
  tenantId: string,
  fechaInicio: Date,
  fechaFin: Date,
): Promise<DimensionResult> {
  const evaluaciones = await prisma.opsSupervisionGuardEvaluation.findMany({
    where: {
      tenantId,
      guardId: guardiaId,
      createdAt: { gte: fechaInicio, lte: fechaFin },
    },
    select: {
      presentationScore: true,
      orderScore: true,
      protocolScore: true,
    },
  });

  if (evaluaciones.length === 0) {
    return { score: -1, detalle: { sinDatos: true } };
  }

  // Max score per dimension is assumed to be 5 (typical rating scale)
  const maxScore = 5;
  const avgPresentation = evaluaciones.reduce((s, e) => s + (e.presentationScore ?? 0), 0) / evaluaciones.length;
  const avgOrder = evaluaciones.reduce((s, e) => s + (e.orderScore ?? 0), 0) / evaluaciones.length;
  const avgProtocol = evaluaciones.reduce((s, e) => s + (e.protocolScore ?? 0), 0) / evaluaciones.length;

  const promedioNormalizado = ((avgPresentation + avgOrder + avgProtocol) / 3 / maxScore) * 100;

  // Penalty for open findings
  const hallazgosNegativos = await prisma.opsSupervisionFinding.count({
    where: {
      tenantId,
      guardId: guardiaId,
      status: "open",
      createdAt: { gte: fechaInicio, lte: fechaFin },
    },
  });

  const penalHallazgos = hallazgosNegativos * 5; // 5 points penalty per finding

  const score = Math.min(100, Math.max(0, Math.round(promedioNormalizado - penalHallazgos)));

  return {
    score,
    detalle: {
      evaluaciones: evaluaciones.length,
      promedioPresentation: Math.round(avgPresentation * 10) / 10,
      promedioOrder: Math.round(avgOrder * 10) / 10,
      promedioProtocol: Math.round(avgProtocol * 10) / 10,
      hallazgosNegativos,
    },
  };
}
```

### Step 5: Create capacitacion dimension calculator

```typescript
// src/lib/gamification/dimensions/capacitacion.ts

import { prisma } from "@/lib/prisma";
import type { DimensionResult } from "../types";

export async function calcularScoreCapacitacion(
  guardiaId: string,
  tenantId: string,
  fechaInicio: Date,
  fechaFin: Date,
): Promise<DimensionResult> {
  const examenes = await prisma.examAssignment.findMany({
    where: {
      guardId: guardiaId,
      status: "completed",
      completedAt: { gte: fechaInicio, lte: fechaFin },
    },
    select: {
      score: true,
    },
  });

  if (examenes.length === 0) {
    return { score: -1, detalle: { sinDatos: true } };
  }

  const scores = examenes.map((e) => e.score ?? 0);
  const promedioScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const aprobados = scores.filter((s) => s >= 60).length;
  const tasaAprobacion = aprobados / examenes.length;

  const score = Math.min(100, Math.max(0, Math.round(
    promedioScore * 0.6 + tasaAprobacion * 100 * 0.4,
  )));

  return {
    score,
    detalle: {
      examenesCompletados: examenes.length,
      promedioScore: Math.round(promedioScore * 10) / 10,
      aprobados,
      tasaAprobacion: Math.round(tasaAprobacion * 100),
    },
  };
}
```

### Step 6: Verify compilation

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No new errors

### Step 7: Commit

```bash
git add src/lib/gamification/dimensions/
git commit -m "feat(gamificacion): add 5 dimension calculators (rondas, asistencia, digital, supervision, capacitacion)"
```

---

## Task 4: Trust Score Calculator + Points Engine + Streak + Badge + Ranking

**Files:**
- Create: `src/lib/gamification/trust-score-calculator.ts`
- Create: `src/lib/gamification/points-engine.ts`
- Create: `src/lib/gamification/streak-tracker.ts`
- Create: `src/lib/gamification/badge-evaluator.ts`
- Create: `src/lib/gamification/ranking-calculator.ts`
- Create: `src/lib/gamification/bonus-generator.ts`
- Modify: `src/lib/gamification/index.ts` (add exports)

### Step 1: Create trust-score-calculator.ts

```typescript
// src/lib/gamification/trust-score-calculator.ts

import type { GamificacionConfig } from "@prisma/client";
import type { TrustScoreCompuesto, DimensionResult } from "./types";
import { calcularScoreRondas } from "./dimensions/rondas";
import { calcularScoreAsistencia } from "./dimensions/asistencia";
import { calcularScoreSistemaDigital } from "./dimensions/sistema-digital";
import { calcularScoreSupervision } from "./dimensions/supervision";
import { calcularScoreCapacitacion } from "./dimensions/capacitacion";

interface DimensionWeight {
  key: string;
  peso: number;
  result: DimensionResult;
}

export async function calcularTrustScoreCompuesto(
  guardiaId: string,
  tenantId: string,
  fechaInicio: Date,
  fechaFin: Date,
  config: GamificacionConfig,
): Promise<TrustScoreCompuesto> {
  // Calculate all 5 dimensions in parallel
  const [rondas, asistencia, sistemaDigital, supervision, capacitacion] =
    await Promise.all([
      calcularScoreRondas(guardiaId, tenantId, fechaInicio, fechaFin),
      calcularScoreAsistencia(guardiaId, tenantId, fechaInicio, fechaFin),
      calcularScoreSistemaDigital(guardiaId, tenantId, fechaInicio, fechaFin),
      calcularScoreSupervision(guardiaId, tenantId, fechaInicio, fechaFin),
      calcularScoreCapacitacion(guardiaId, tenantId, fechaInicio, fechaFin),
    ]);

  const dimensions: DimensionWeight[] = [
    { key: "rondas", peso: config.pesoRondas, result: rondas },
    { key: "asistencia", peso: config.pesoAsistencia, result: asistencia },
    { key: "sistemaDigital", peso: config.pesoSistemaDigital, result: sistemaDigital },
    { key: "supervision", peso: config.pesoSupervision, result: supervision },
    { key: "capacitacion", peso: config.pesoCapacitacion, result: capacitacion },
  ];

  // Redistribute weights for dimensions without data (score === -1)
  const withData = dimensions.filter((d) => d.result.score >= 0);
  const totalPesoConDatos = withData.reduce((s, d) => s + d.peso, 0);

  let trustScore = 0;
  if (totalPesoConDatos > 0) {
    trustScore = Math.min(100, Math.max(0, Math.round(
      withData.reduce((s, d) => s + d.result.score * (d.peso / totalPesoConDatos), 0),
    )));
  }

  return {
    trustScore,
    scoreRondas: Math.max(0, rondas.score),
    scoreAsistencia: Math.max(0, asistencia.score),
    scoreSistemaDigital: Math.max(0, sistemaDigital.score),
    scoreSupervision: Math.max(0, supervision.score),
    scoreCapacitacion: Math.max(0, capacitacion.score),
    detalleRondas: rondas.detalle,
    detalleAsistencia: asistencia.detalle,
    detalleSistemaDigital: sistemaDigital.detalle,
    detalleSupervision: supervision.detalle,
    detalleCapacitacion: capacitacion.detalle,
  };
}
```

### Step 2: Create points-engine.ts

```typescript
// src/lib/gamification/points-engine.ts

import { prisma } from "@/lib/prisma";
import type { GamificacionConfig } from "@prisma/client";
import type { EventoTipo, EventoDimension } from "./types";

interface EventoInput {
  guardiaId: string;
  tenantId: string;
  installationId?: string | null;
  tipo: EventoTipo;
  dimension: EventoDimension;
  descripcion: string;
  referenciaModelo?: string;
  referenciaId?: string;
  fecha?: Date;
}

const EVENT_POINTS: Record<EventoTipo, (config: GamificacionConfig) => number> = {
  ronda_perfecta: (c) => c.ptsRondaPerfecta,
  ronda_completada: (c) => c.ptsRondaCompletada,
  ronda_no_realizada: (c) => c.ptsRondaNoRealizada,
  entrada_puntual: (c) => c.ptsEntradaPuntual,
  salida_completa: (c) => c.ptsSalidaCompleta,
  tardanza: (c) => c.ptsTardanzaPenalizacion,
  inasistencia: (c) => c.ptsInasistenciaInjust,
  turno_extra: (c) => c.ptsTurnoExtra,
  marcacion_digital: (c) => c.ptsMarcacionDigital,
  eval_sobresaliente: (c) => c.ptsEvalSobresaliente,
  eval_buena: (c) => c.ptsEvalBuena,
  hallazgo_negativo: (c) => c.ptsHallazgoNegativo,
  examen_aprobado: (c) => c.ptsExamenAprobado,
  examen_perfecto: (c) => c.ptsExamenPerfecto,
  incidente_reportado: (c) => c.ptsIncidenteReportado,
  tarea_checkpoint: (c) => c.ptsTareaCheckpoint,
  reconocimiento_recibido: (c) => c.ptsReconocimientoRecibido,
  reconocimiento_dado: (c) => c.ptsReconocimientoDado,
  badge_desbloqueado: (c) => c.ptsBadgeDesbloqueado,
  racha_bonus: (c) => c.ptsBonusRacha7dias, // default, overridden by caller
  semana_perfecta: (c) => c.ptsBonusSemanalPerfecta,
  asistencia_perfecta_mes: (c) => c.ptsAsistenciaPerfectaMes,
};

export async function registrarEvento(
  input: EventoInput,
  config: GamificacionConfig,
  puntosOverride?: number,
): Promise<{ id: string; puntos: number }> {
  const puntos = puntosOverride ?? EVENT_POINTS[input.tipo](config);

  // Check daily cap
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const manana = new Date(hoy);
  manana.setDate(manana.getDate() + 1);

  if (puntos > 0) {
    const puntosHoy = await prisma.gamificacionEvento.aggregate({
      where: {
        guardiaId: input.guardiaId,
        tenantId: input.tenantId,
        fecha: { gte: hoy, lt: manana },
        puntos: { gt: 0 },
      },
      _sum: { puntos: true },
    });

    const acumuladoHoy = puntosHoy._sum.puntos ?? 0;
    if (acumuladoHoy >= config.maxPuntosDiarios) {
      // Still register the event but with 0 points (for tracking)
      const evento = await prisma.gamificacionEvento.create({
        data: {
          tenantId: input.tenantId,
          guardiaId: input.guardiaId,
          installationId: input.installationId ?? null,
          tipo: input.tipo,
          dimension: input.dimension,
          puntos: 0,
          descripcion: `${input.descripcion} (cap diario alcanzado)`,
          referenciaModelo: input.referenciaModelo ?? null,
          referenciaId: input.referenciaId ?? null,
          fecha: input.fecha ?? new Date(),
        },
      });
      return { id: evento.id, puntos: 0 };
    }
  }

  const evento = await prisma.gamificacionEvento.create({
    data: {
      tenantId: input.tenantId,
      guardiaId: input.guardiaId,
      installationId: input.installationId ?? null,
      tipo: input.tipo,
      dimension: input.dimension,
      puntos,
      descripcion: input.descripcion,
      referenciaModelo: input.referenciaModelo ?? null,
      referenciaId: input.referenciaId ?? null,
      fecha: input.fecha ?? new Date(),
    },
  });

  return { id: evento.id, puntos };
}
```

### Step 3: Create streak-tracker.ts

```typescript
// src/lib/gamification/streak-tracker.ts

import { prisma } from "@/lib/prisma";

export async function calcularRachaActual(
  guardiaId: string,
  tenantId: string,
  hasta: Date,
): Promise<{ rachaActual: number; mejorRachaHistorica: number }> {
  // Get last 120 days of daily scores to find streak
  const desde = new Date(hasta);
  desde.setDate(desde.getDate() - 120);

  const scoresDiarios = await prisma.gamificacionScoreGuardia.findMany({
    where: {
      guardiaId,
      tenantId,
      periodoTipo: "diario",
      fechaInicio: { gte: desde, lte: hasta },
    },
    select: { fechaInicio: true, trustScore: true },
    orderBy: { fechaInicio: "desc" },
  });

  // A "perfect day" = trustScore >= 80
  const UMBRAL_PERFECTO = 80;

  let rachaActual = 0;
  for (const score of scoresDiarios) {
    if (score.trustScore >= UMBRAL_PERFECTO) {
      rachaActual++;
    } else {
      break;
    }
  }

  // Find best historical streak
  let mejorRacha = 0;
  let rachaTemp = 0;
  // Process in chronological order for historical best
  const cronologico = [...scoresDiarios].reverse();
  for (const score of cronologico) {
    if (score.trustScore >= UMBRAL_PERFECTO) {
      rachaTemp++;
      mejorRacha = Math.max(mejorRacha, rachaTemp);
    } else {
      rachaTemp = 0;
    }
  }

  return { rachaActual, mejorRachaHistorica: Math.max(mejorRacha, rachaActual) };
}
```

### Step 4: Create badge-evaluator.ts

```typescript
// src/lib/gamification/badge-evaluator.ts

import { prisma } from "@/lib/prisma";
import type { GamificacionConfig } from "@prisma/client";
import { registrarEvento } from "./points-engine";

export async function evaluarBadges(
  guardiaId: string,
  tenantId: string,
  config: GamificacionConfig,
): Promise<string[]> {
  // Get all active badges not yet earned by this guard
  const badgesDisponibles = await prisma.gamificacionBadge.findMany({
    where: {
      tenantId,
      activo: true,
      guardiaBadges: { none: { guardiaId } },
    },
  });

  const desbloqueados: string[] = [];

  for (const badge of badgesDisponibles) {
    const cumple = await verificarCondicion(guardiaId, tenantId, badge.condicionTipo, badge.condicionValor);

    if (cumple) {
      await prisma.gamificacionGuardiaBadge.create({
        data: {
          tenantId,
          guardiaId,
          badgeId: badge.id,
        },
      });

      // Register badge event for points
      await registrarEvento(
        {
          guardiaId,
          tenantId,
          tipo: "badge_desbloqueado",
          dimension: "bonus",
          descripcion: `Badge desbloqueado: ${badge.nombre}`,
          referenciaModelo: "GamificacionBadge",
          referenciaId: badge.id,
        },
        config,
        badge.puntosBonus,
      );

      desbloqueados.push(badge.id);
    }
  }

  return desbloqueados;
}

async function verificarCondicion(
  guardiaId: string,
  tenantId: string,
  condicionTipo: string,
  condicionValor: number,
): Promise<boolean> {
  switch (condicionTipo) {
    case "racha_dias": {
      const ultimoScore = await prisma.gamificacionScoreGuardia.findFirst({
        where: { guardiaId, tenantId, periodoTipo: "diario" },
        orderBy: { fechaInicio: "desc" },
        select: { rachaActual: true },
      });
      return (ultimoScore?.rachaActual ?? 0) >= condicionValor;
    }

    case "rondas_perfectas_count": {
      const count = await prisma.opsRondaEjecucion.count({
        where: {
          guardiaId,
          tenantId,
          status: "completada",
          trustScore: { gte: 90 },
        },
      });
      return count >= condicionValor;
    }

    case "asistencia_perfecta_meses": {
      // Count months with 0 tardanzas and 0 inasistencias
      const scoresmensuales = await prisma.gamificacionScoreGuardia.findMany({
        where: { guardiaId, tenantId, periodoTipo: "mensual", scoreAsistencia: { gte: 95 } },
        select: { id: true },
      });
      return scoresmensuales.length >= condicionValor;
    }

    case "reconocimientos_recibidos": {
      const count = await prisma.gamificacionReconocimiento.count({
        where: { receptorId: guardiaId, tenantId },
      });
      return count >= condicionValor;
    }

    case "reconocimientos_dados": {
      const count = await prisma.gamificacionReconocimiento.count({
        where: { dadorId: guardiaId, tenantId },
      });
      return count >= condicionValor;
    }

    case "examen_perfecto": {
      const count = await prisma.examAssignment.count({
        where: { guardId: guardiaId, status: "completed", score: { gte: 90 } },
      });
      return count >= condicionValor;
    }

    default:
      return false;
  }
}
```

### Step 5: Create ranking-calculator.ts

```typescript
// src/lib/gamification/ranking-calculator.ts

import { prisma } from "@/lib/prisma";

export async function calcularRankings(
  tenantId: string,
  periodo: string,
  periodoTipo: string,
): Promise<void> {
  // Get all scores for this period
  const scores = await prisma.gamificacionScoreGuardia.findMany({
    where: { tenantId, periodo, periodoTipo },
    select: {
      id: true,
      guardiaId: true,
      installationId: true,
      trustScore: true,
    },
    orderBy: { trustScore: "desc" },
  });

  if (scores.length === 0) return;

  // Global ranking
  for (let i = 0; i < scores.length; i++) {
    const globalRank = i + 1;

    await prisma.gamificacionScoreGuardia.update({
      where: { id: scores[i].id },
      data: {
        rankingGlobal: globalRank,
        totalGuardiasGlobal: scores.length,
      },
    });
  }

  // Per-installation ranking
  const byInstallation = new Map<string, typeof scores>();
  for (const s of scores) {
    if (!s.installationId) continue;
    const arr = byInstallation.get(s.installationId) ?? [];
    arr.push(s);
    byInstallation.set(s.installationId, arr);
  }

  for (const [, instScores] of byInstallation) {
    // Already sorted by trustScore desc from the main query
    instScores.sort((a, b) => b.trustScore - a.trustScore);
    for (let i = 0; i < instScores.length; i++) {
      await prisma.gamificacionScoreGuardia.update({
        where: { id: instScores[i].id },
        data: {
          rankingInstalacion: i + 1,
          totalGuardiasInstalacion: instScores.length,
        },
      });
    }
  }
}
```

### Step 6: Create bonus-generator.ts

```typescript
// src/lib/gamification/bonus-generator.ts

import { prisma } from "@/lib/prisma";

export async function generarSugerenciasBono(
  tenantId: string,
  fondoId: string,
): Promise<number> {
  const fondo = await prisma.gamificacionFondoPremio.findUnique({
    where: { id: fondoId },
  });

  if (!fondo || fondo.status !== "activo") return 0;

  const periodo = `${fondo.fechaInicio.getFullYear()}-${String(fondo.fechaInicio.getMonth() + 1).padStart(2, "0")}`;

  // Get scores for the fund period
  const whereClause: Record<string, unknown> = {
    tenantId,
    periodo,
    periodoTipo: "mensual",
  };
  if (fondo.installationId) {
    whereClause.installationId = fondo.installationId;
  }

  const scores = await prisma.gamificacionScoreGuardia.findMany({
    where: whereClause,
    orderBy: { trustScore: "desc" },
    select: {
      guardiaId: true,
      puntosNetos: true,
      trustScore: true,
    },
  });

  if (scores.length === 0) return 0;

  const distribucion = (fondo.distribucion as Array<{ posicion: number; porcentaje: number }>) ?? [];

  const sugerencias = distribucion
    .filter((d) => d.posicion <= scores.length)
    .map((d) => {
      const guardia = scores[d.posicion - 1];
      return {
        tenantId,
        fondoId: fondo.id,
        guardiaId: guardia.guardiaId,
        posicionRanking: d.posicion,
        puntajePeriodo: guardia.puntosNetos,
        montoSugeridoClp: Math.round(fondo.montoTotalClp * (d.porcentaje / 100)),
      };
    });

  if (sugerencias.length > 0) {
    await prisma.gamificacionSugerenciaBono.createMany({
      data: sugerencias,
      skipDuplicates: true,
    });
  }

  return sugerencias.length;
}
```

### Step 7: Update index.ts with new exports

```typescript
// src/lib/gamification/index.ts

export { getGamificacionConfig, clearConfigCache, getNiveles, getNivelActual, getNextNivel } from "./config";
export { calcularTrustScoreCompuesto } from "./trust-score-calculator";
export { registrarEvento } from "./points-engine";
export { calcularRachaActual } from "./streak-tracker";
export { evaluarBadges } from "./badge-evaluator";
export { calcularRankings } from "./ranking-calculator";
export { generarSugerenciasBono } from "./bonus-generator";
export type {
  DimensionResult,
  TrustScoreCompuesto,
  EventoTipo,
  EventoDimension,
  NivelDefinition,
} from "./types";
```

### Step 8: Verify compilation

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No new errors

### Step 9: Commit

```bash
git add src/lib/gamification/
git commit -m "feat(gamificacion): add trust score calculator, points engine, streak tracker, badge evaluator, ranking calculator, bonus generator"
```

---

## Task 5: Cron Job — Daily Gamification Calculation

**Files:**
- Create: `src/app/api/cron/gamification-calculate/route.ts`

### Step 1: Create the cron job handler

```typescript
// src/app/api/cron/gamification-calculate/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getGamificacionConfig,
  calcularTrustScoreCompuesto,
  calcularRachaActual,
  evaluarBadges,
  calcularRankings,
  getNivelActual,
  generarSugerenciasBono,
} from "@/lib/gamification";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret && process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { success: false, error: "CRON_SECRET not configured" },
        { status: 500 },
      );
    }
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const now = new Date();
    const hoy = new Date(now);
    hoy.setHours(0, 0, 0, 0);

    // Yesterday as the calculation target
    const ayer = new Date(hoy);
    ayer.setDate(ayer.getDate() - 1);
    const ayerFin = new Date(hoy);
    ayerFin.setMilliseconds(-1);

    const esLunes = now.getDay() === 1;
    const esPrimeroDeMes = now.getDate() === 1;

    // Get all tenants with active gamification
    const configs = await prisma.gamificacionConfig.findMany({
      where: { moduloActivo: true },
    });

    let totalGuardias = 0;
    let totalScores = 0;
    let totalBadges = 0;

    for (const config of configs) {
      const guardias = await prisma.opsGuardia.findMany({
        where: { tenantId: config.tenantId, status: "active" },
        select: { id: true, currentInstallationId: true },
        take: 5000,
      });

      const periodoHoy = `${ayer.getFullYear()}-${String(ayer.getMonth() + 1).padStart(2, "0")}-${String(ayer.getDate()).padStart(2, "0")}`;

      for (const guardia of guardias) {
        try {
          // Daily score
          const score = await calcularTrustScoreCompuesto(
            guardia.id,
            config.tenantId,
            ayer,
            ayerFin,
            config,
          );

          // Streak
          const { rachaActual, mejorRachaHistorica } = await calcularRachaActual(
            guardia.id,
            config.tenantId,
            ayer,
          );

          // Lifetime points for level
          const puntosHistorico = await prisma.gamificacionEvento.aggregate({
            where: { guardiaId: guardia.id, tenantId: config.tenantId, puntos: { gt: 0 } },
            _sum: { puntos: true },
          });
          const puntosAcumulados = puntosHistorico._sum.puntos ?? 0;
          const nivel = getNivelActual(config, puntosAcumulados);

          // Points for yesterday
          const puntosAyer = await prisma.gamificacionEvento.aggregate({
            where: {
              guardiaId: guardia.id,
              tenantId: config.tenantId,
              fecha: { gte: ayer, lt: hoy },
            },
            _sum: { puntos: true },
          });
          const puntosGanados = (puntosAyer._sum.puntos ?? 0) > 0 ? puntosAyer._sum.puntos ?? 0 : 0;

          const puntosAyerNeg = await prisma.gamificacionEvento.aggregate({
            where: {
              guardiaId: guardia.id,
              tenantId: config.tenantId,
              fecha: { gte: ayer, lt: hoy },
              puntos: { lt: 0 },
            },
            _sum: { puntos: true },
          });
          const puntosPerdidos = Math.abs(puntosAyerNeg._sum.puntos ?? 0);

          await prisma.gamificacionScoreGuardia.upsert({
            where: {
              guardiaId_periodo_periodoTipo: {
                guardiaId: guardia.id,
                periodo: periodoHoy,
                periodoTipo: "diario",
              },
            },
            update: {
              trustScore: score.trustScore,
              scoreRondas: score.scoreRondas,
              scoreAsistencia: score.scoreAsistencia,
              scoreSistemaDigital: score.scoreSistemaDigital,
              scoreSupervision: score.scoreSupervision,
              scoreCapacitacion: score.scoreCapacitacion,
              detalleRondas: score.detalleRondas,
              detalleAsistencia: score.detalleAsistencia,
              detalleSistemaDigital: score.detalleSistemaDigital,
              detalleSupervision: score.detalleSupervision,
              detalleCapacitacion: score.detalleCapacitacion,
              puntosGanados,
              puntosPerdidos,
              puntosNetos: puntosGanados - puntosPerdidos,
              rachaActual,
              mejorRacha: mejorRachaHistorica,
              nivelActual: nivel,
              puntosAcumuladosHistorico: puntosAcumulados,
              calculadoAt: now,
            },
            create: {
              tenantId: config.tenantId,
              guardiaId: guardia.id,
              installationId: guardia.currentInstallationId,
              periodo: periodoHoy,
              periodoTipo: "diario",
              fechaInicio: ayer,
              fechaFin: ayerFin,
              trustScore: score.trustScore,
              scoreRondas: score.scoreRondas,
              scoreAsistencia: score.scoreAsistencia,
              scoreSistemaDigital: score.scoreSistemaDigital,
              scoreSupervision: score.scoreSupervision,
              scoreCapacitacion: score.scoreCapacitacion,
              detalleRondas: score.detalleRondas,
              detalleAsistencia: score.detalleAsistencia,
              detalleSistemaDigital: score.detalleSistemaDigital,
              detalleSupervision: score.detalleSupervision,
              detalleCapacitacion: score.detalleCapacitacion,
              puntosGanados,
              puntosPerdidos,
              puntosNetos: puntosGanados - puntosPerdidos,
              rachaActual,
              mejorRacha: mejorRachaHistorica,
              nivelActual: nivel,
              puntosAcumuladosHistorico: puntosAcumulados,
            },
          });

          totalScores++;

          // Evaluate badges
          const newBadges = await evaluarBadges(guardia.id, config.tenantId, config);
          totalBadges += newBadges.length;
        } catch (err) {
          console.error(`[CRON gamificacion] Error guardia ${guardia.id}:`, err);
        }
      }

      totalGuardias += guardias.length;

      // Calculate rankings for today
      await calcularRankings(config.tenantId, periodoHoy, "diario");

      // Weekly score (Monday)
      if (esLunes) {
        const lunesPasado = new Date(ayer);
        lunesPasado.setDate(lunesPasado.getDate() - 6);
        const semana = `${ayer.getFullYear()}-W${String(Math.ceil((ayer.getDate() + new Date(ayer.getFullYear(), ayer.getMonth(), 1).getDay()) / 7)).padStart(2, "0")}`;

        for (const guardia of guardias) {
          try {
            const score = await calcularTrustScoreCompuesto(
              guardia.id, config.tenantId, lunesPasado, ayerFin, config,
            );

            await prisma.gamificacionScoreGuardia.upsert({
              where: {
                guardiaId_periodo_periodoTipo: {
                  guardiaId: guardia.id, periodo: semana, periodoTipo: "semanal",
                },
              },
              update: { trustScore: score.trustScore, calculadoAt: now },
              create: {
                tenantId: config.tenantId,
                guardiaId: guardia.id,
                installationId: guardia.currentInstallationId,
                periodo: semana, periodoTipo: "semanal",
                fechaInicio: lunesPasado, fechaFin: ayerFin,
                trustScore: score.trustScore,
                scoreRondas: score.scoreRondas,
                scoreAsistencia: score.scoreAsistencia,
                scoreSistemaDigital: score.scoreSistemaDigital,
                scoreSupervision: score.scoreSupervision,
                scoreCapacitacion: score.scoreCapacitacion,
              },
            });
          } catch (err) {
            console.error(`[CRON gamificacion] Weekly error guardia ${guardia.id}:`, err);
          }
        }

        await calcularRankings(config.tenantId, semana, "semanal");
      }

      // Monthly score (1st of month)
      if (esPrimeroDeMes) {
        const mesAnteriorInicio = new Date(ayer.getFullYear(), ayer.getMonth(), 1);
        const mesPeriodo = `${mesAnteriorInicio.getFullYear()}-${String(mesAnteriorInicio.getMonth() + 1).padStart(2, "0")}`;

        for (const guardia of guardias) {
          try {
            const score = await calcularTrustScoreCompuesto(
              guardia.id, config.tenantId, mesAnteriorInicio, ayerFin, config,
            );

            await prisma.gamificacionScoreGuardia.upsert({
              where: {
                guardiaId_periodo_periodoTipo: {
                  guardiaId: guardia.id, periodo: mesPeriodo, periodoTipo: "mensual",
                },
              },
              update: { trustScore: score.trustScore, calculadoAt: now },
              create: {
                tenantId: config.tenantId,
                guardiaId: guardia.id,
                installationId: guardia.currentInstallationId,
                periodo: mesPeriodo, periodoTipo: "mensual",
                fechaInicio: mesAnteriorInicio, fechaFin: ayerFin,
                trustScore: score.trustScore,
                scoreRondas: score.scoreRondas,
                scoreAsistencia: score.scoreAsistencia,
                scoreSistemaDigital: score.scoreSistemaDigital,
                scoreSupervision: score.scoreSupervision,
                scoreCapacitacion: score.scoreCapacitacion,
              },
            });
          } catch (err) {
            console.error(`[CRON gamificacion] Monthly error guardia ${guardia.id}:`, err);
          }
        }

        await calcularRankings(config.tenantId, mesPeriodo, "mensual");

        // Generate bonus suggestions for active funds
        const fondosActivos = await prisma.gamificacionFondoPremio.findMany({
          where: { tenantId: config.tenantId, status: "activo", fechaFin: { lt: now } },
        });
        for (const fondo of fondosActivos) {
          await generarSugerenciasBono(config.tenantId, fondo.id);
        }
      }
    }

    // Mark all events as processed
    await prisma.gamificacionEvento.updateMany({
      where: { procesado: false, fecha: { lt: hoy } },
      data: { procesado: true },
    });

    console.log(`[CRON gamificacion] OK: ${configs.length} tenants, ${totalGuardias} guardias, ${totalScores} scores, ${totalBadges} badges`);

    return NextResponse.json({
      success: true,
      data: {
        tenants: configs.length,
        guardias: totalGuardias,
        scores: totalScores,
        badges: totalBadges,
        esLunes,
        esPrimeroDeMes,
        fecha: now.toISOString(),
      },
    });
  } catch (error) {
    console.error("[CRON gamificacion] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 },
    );
  }
}
```

### Step 2: Verify compilation

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No new errors

### Step 3: Commit

```bash
git add src/app/api/cron/gamification-calculate/
git commit -m "feat(gamificacion): add daily cron job for score calculation, rankings, badges, and bonus generation"
```

---

## Task 6: API Routes — Admin (OPAI)

**Files:**
- Create: `src/app/api/gamification/config/route.ts`
- Create: `src/app/api/gamification/guardia/[id]/route.ts`
- Create: `src/app/api/gamification/instalacion/[id]/route.ts`
- Create: `src/app/api/gamification/badges/route.ts`
- Create: `src/app/api/gamification/badges/[id]/route.ts`
- Create: `src/app/api/gamification/rankings/global/route.ts`
- Create: `src/app/api/gamification/rankings/instalacion/[id]/route.ts`

This task creates 7 route files. Each follows the exact admin API pattern: `requireAuth()` → `resolveApiPerms()` → `canView/canEdit(perms, "ops", "gamificacion")` → Prisma → JSON response.

See design doc for full route list. Implementation follows the exact pattern from `src/app/api/ops/rondas/programacion/route.ts`.

### Step 1: Create config route (GET + PUT)

Ref: `src/app/api/ops/rondas/programacion/route.ts` for exact pattern.

The GET handler reads `gamificacionConfig` by tenantId. If none exists, creates one with defaults.
The PUT handler updates the config. Both check `canEdit(perms, "ops", "gamificacion")`.

### Step 2: Create guardia/[id] route (GET)

Returns the guard's latest scores (last 6 monthly), current badges, recent events (last 20), streak, level, and next level info.

### Step 3: Create instalacion/[id] route (GET)

Returns the installation ranking for the latest period, average trust score, and guard count.

### Step 4: Create badges CRUD routes

GET: list all badges for tenant. POST: create new badge with Zod validation.
PUT [id]: update badge. DELETE [id]: soft delete (activo = false).

### Step 5: Create ranking routes

GET global: paginated ranking (page, limit params). Returns guards sorted by trustScore desc for the latest period.
GET instalacion/[id]: same but filtered by installationId.

### Step 6: Verify compilation

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`

### Step 7: Commit

```bash
git add src/app/api/gamification/
git commit -m "feat(gamificacion): add admin API routes (config, guardia, instalacion, badges, rankings)"
```

---

## Task 7: API Routes — Portal del Guardia

**Files:**
- Create: `src/app/api/portal/guardia/gamification/scorecard/route.ts`
- Create: `src/app/api/portal/guardia/gamification/historial/route.ts`
- Create: `src/app/api/portal/guardia/gamification/ranking/route.ts`
- Create: `src/app/api/portal/guardia/gamification/badges/route.ts`
- Create: `src/app/api/portal/guardia/gamification/desafios/route.ts`
- Create: `src/app/api/portal/guardia/gamification/beneficios/route.ts`
- Create: `src/app/api/portal/guardia/gamification/reconocimiento/route.ts`
- Create: `src/app/api/portal/guardia/gamification/feed/route.ts`
- Create: `src/app/api/portal/guardia/gamification/canjear/route.ts`
- Create: `src/app/api/portal/guardia/gamification/tendencia/route.ts`

All follow portal pattern: no requireAuth, validate guardiaId from query params, same JSON response format.

### Step 1: Create scorecard route

GET: Returns current score, level, streak, monthly points, progress to next level. Uses `guardiaId` query param.

### Step 2: Create historial route

GET: Paginated list of `GamificacionEvento` for the guard. Params: guardiaId, page, limit.

### Step 3: Create ranking route

GET: Returns guard's position in their installation ranking. Shows 5 above and 5 below. Never shows bottom performers publicly — only shows top N and the guard's own position.

### Step 4: Create badges route

GET: Returns earned badges + visible unearned badges (excludes secret badges not yet earned).

### Step 5: Create desafios, beneficios, feed, tendencia routes

Follow same pattern. Each is a focused GET endpoint.

### Step 6: Create reconocimiento route (POST)

POST: Send recognition. Validates: not self, max 3/day, not same receptor in 24h.

### Step 7: Create canjear route (POST)

POST: Redeem points for benefit. Validates: enough points, benefit active, stock available.

### Step 8: Verify compilation

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`

### Step 9: Commit

```bash
git add src/app/api/portal/guardia/gamification/
git commit -m "feat(gamificacion): add portal guardia API routes (scorecard, historial, ranking, badges, desafios, reconocimiento, canjear, feed, tendencia, beneficios)"
```

---

## Task 8: Seed Data

**Files:**
- Create: `prisma/seeds/gamification-seed.ts`
- Modify: `prisma/seed.ts` (add import and call)

### Step 1: Create gamification seed file

Creates the default `GamificacionConfig` and 15-20 predefined badges using upsert pattern.

Badge list:
- Rachas: "Racha de Fuego" (7d), "Imparable" (30d), "Leyenda" (90d)
- Asistencia: "Puntualidad de Reloj" (1 mes), "Guerrero" (3 meses), "Inquebrantable" (6 meses)
- Rondas: "Halcón Nocturno" (50 perfectas), "Ojo de Águila" (10 incidentes), "Ruta Perfecta" (100 perfectas)
- Equipo: "Pilar del Equipo" (20 reconocimientos recibidos), "Motivador" (50 dados)
- Capacitación: "Estudiante Estrella" (3 exámenes perfectos)
- Secretos: "Sincronía Perfecta" (custom), "Madrugador" (custom)

### Step 2: Add seed call to orchestrator

In `prisma/seed.ts`, add import and call after `seedGroupsAndTicketTypes`:

```typescript
import { seedGamification } from "./seeds/gamification-seed";
// ... in main():
await seedGamification(tenant.id);
```

### Step 3: Verify seed runs

Run: `npx prisma db seed`
Expected: Seed completes without errors

### Step 4: Commit

```bash
git add prisma/seeds/gamification-seed.ts prisma/seed.ts
git commit -m "feat(gamificacion): add seed data with default config and 15 predefined badges"
```

---

## Task 9: Permissions Integration

**Files:**
- Modify: `src/lib/permissions.ts`
- Modify: `src/lib/role-policy.ts`

### Step 1: Add gamificacion to SUBMODULE_KEYS in permissions.ts

In `SUBMODULE_KEYS.ops` array (line ~54-68), add `"gamificacion"` after `"eventos_laborales"`.

### Step 2: Add gamificacion_bonos_aprobar to CAPABILITY_KEYS

In `CAPABILITY_KEYS` array (line ~109-133), add `"gamificacion_bonos_aprobar"`.

### Step 3: Add SUBMODULE_META entry

Add to `SUBMODULE_META` array after the ops.eventos_laborales entry:

```typescript
{ key: "ops.gamificacion", module: "ops", submodule: "gamificacion", label: "Gamificación", href: "/ops/gamificacion" },
```

### Step 4: Add CAPABILITY_META entry

Add to `CAPABILITY_META` array:

```typescript
{ key: "gamificacion_bonos_aprobar", label: "Aprobar bonos gamificación", description: "Puede aprobar o rechazar sugerencias de bono generadas por gamificación", moduleKey: "ops", submoduleKey: "gamificacion" },
```

### Step 5: Update DEFAULT_ROLE_PERMISSIONS

Add `"ops.gamificacion"` submodule overrides for roles that need specific access:

- In `supervisor` submodules: add `"ops.gamificacion": "edit"`
- In `rrhh` submodules: add `"ops.gamificacion": "edit"` and capability `gamificacion_bonos_aprobar: true`
- In `operaciones` capabilities: add `gamificacion_bonos_aprobar: true`

### Step 6: Update role-policy.ts (v1 legacy)

No structural changes needed — the legacy system delegates to permissions.ts for granular checks. The `ops` module access already covers gamificación at the module level.

### Step 7: Verify compilation

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors

### Step 8: Commit

```bash
git add src/lib/permissions.ts src/lib/role-policy.ts
git commit -m "feat(gamificacion): add gamificacion submodule and bonos capability to permission system"
```

---

## Final Verification

### Step 1: Full TypeScript check

Run: `npx tsc --noEmit --pretty`
Expected: No new errors

### Step 2: Prisma generate check

Run: `npx prisma generate`
Expected: Success

### Step 3: Review all commits

Run: `git log --oneline -10`
Expected: 9 commits in logical order

---

## Summary of Deliverables

| # | Deliverable | Files |
|---|------------|-------|
| 1 | Prisma models (12 new) | `prisma/schema.prisma` |
| 2 | Service types + config | `src/lib/gamification/{index,types,config}.ts` |
| 3 | 5 dimension calculators | `src/lib/gamification/dimensions/*.ts` |
| 4 | Core engines (6 files) | `src/lib/gamification/{trust-score-calculator,points-engine,streak-tracker,badge-evaluator,ranking-calculator,bonus-generator}.ts` |
| 5 | Cron job | `src/app/api/cron/gamification-calculate/route.ts` |
| 6 | Admin API routes (~7) | `src/app/api/gamification/**` |
| 7 | Portal guardia routes (~10) | `src/app/api/portal/guardia/gamification/**` |
| 8 | Seed data | `prisma/seeds/gamification-seed.ts` |
| 9 | Permissions | `src/lib/permissions.ts`, `src/lib/role-policy.ts` |
