# Gamificación OPAI — Fase 1: Modelos + Motor de Cálculo + APIs

**Fecha**: 2026-03-06
**Branch**: `gamificacion`
**Status**: Design approved

## Resumen

Sistema de gamificación transversal para OPAI que incentiva el buen desempeño de guardias con puntos, niveles, rankings, badges y bonos económicos. Fase 1 cubre: modelos de datos Prisma, motor de cálculo del Trust Score compuesto, APIs admin/portal, cron job de consolidación, y sistema de permisos. NO incluye UI.

## Principios de Diseño

- 80% de personas son Socializers → mecánicas de equipo y reconocimiento entre pares
- SDT → puntos comunican competencia, no control
- Fogg → diseño radicalmente simple, mobile-first
- Nunca mostrar bottom performers públicamente
- Rankings con reset semanal, segmentados por instalación y turno
- Puntos con valor real canjeable (configurable CLP)
- Rachas como mecánica principal de retención
- Badges secretos para momentos colectivos

## Ajustes vs Spec Original (Validación contra codebase)

### PK Strategy
- Spec usaba `@default(uuid())` — codebase usa `@default(dbgenerated("uuid_generate_v4()")) @db.Uuid`
- Todos los modelos usan UUIDs nativos de PostgreSQL

### Column Mapping
- Todos los campos camelCase llevan `@map("snake_case")`
- DateTimes usan `@db.Timestamptz(6)`
- FKs a OpsGuardia/CrmInstallation llevan `@db.Uuid`

### Tenant Relations
- Patrón ligero: `tenantId String @map("tenant_id")` sin relación formal en Tenant
- Seguir patrón de OpsMarcacion, OpsGuardEvent, etc. que NO tienen back-ref en Tenant
- Solo GamificacionConfig tendrá `@@unique([tenantId])` con relación formal

### Permission System
- Actualizar AMBOS sistemas: `permissions.ts` (v2) y `role-policy.ts` (v1 legacy)

## Modelos de Datos (10 modelos + 2 sub-modelos)

### 1. GamificacionConfig
Configuración de reglas por tenant. Campos:
- Pesos de dimensiones Trust Score (5 campos, suman 100)
- Puntos por acción (~25 campos configurables)
- Umbrales de niveles (5 niveles default)
- Config general (tasa CLP, cap diario, expiración, reset)
- Kill switch (`moduloActivo`)

### 2. GamificacionScoreGuardia
Score consolidado por guardia por período (diario/semanal/mensual).
- Trust Score compuesto (0-100)
- 5 scores por dimensión (0-100)
- Desglose detallado en JSON por dimensión
- Puntos ganados/perdidos/netos
- Ranking instalación + global
- Racha actual + mejor racha
- Nivel actual + puntos acumulados histórico

### 3. GamificacionEvento
Log inmutable de cada acción que suma/resta puntos.
- Tipo de evento (~18 tipos)
- Dimensión (7 dimensiones)
- Puntos (positivo o negativo)
- Referencia polimórfica al objeto fuente
- Flag `procesado` para batch nocturno

### 4. GamificacionBadge + GamificacionGuardiaBadge
Catálogo de badges definibles + asignaciones.
- 6 categorías: racha, asistencia, rondas, equipo, secreto, capacitacion, especial
- Condiciones de desbloqueo configurables
- Soporte para badges secretos
- Puntos bonus al desbloquear

### 5. GamificacionReconocimiento
Reconocimiento peer-to-peer entre guardias.
- 5 categorías: compañerismo, puntualidad, profesionalismo, liderazgo, iniciativa
- Anti-spam: máx 3/día, no auto, no repetir mismo receptor en 24h

### 6. GamificacionFondoPremio + GamificacionSugerenciaBono
Fondos de premio con distribución automática.
- Tipos: mensual, evento especial, por instalación
- Distribución configurable por posición de ranking
- Flujo de aprobación (pendiente → aprobado → pagado)

### 7. GamificacionDesafio + GamificacionDesafioParticipacion
Desafíos semanales/especiales con tracking de progreso.
- Condiciones configurables
- Recompensa en puntos + badge opcional
- Progreso 0.0-1.0

### 8. GamificacionBeneficio + GamificacionCanje
Catálogo de beneficios canjeables por puntos.
- Categorías: convenio, tiempo_libre, producto, experiencia
- Stock opcional + fechas de disponibilidad

## Motor de Cálculo

### 5 Dimensiones del Trust Score

| Dimensión | Peso Default | Fuente |
|-----------|-------------|--------|
| Rondas | 30% | OpsRondaEjecucion (trustScore existente) |
| Asistencia | 25% | OpsAsistenciaDiaria, OpsTurnoExtra, OpsGuardEvent |
| Sistema Digital | 15% | OpsMarcacion (metodoId) |
| Supervisión | 20% | OpsSupervisionGuardEvaluation, OpsSupervisionFinding |
| Capacitación | 10% | ExamAssignment |

### Redistribución de pesos
Si una dimensión no tiene datos (ej: sin evaluaciones de supervisión), su peso se redistribuye proporcionalmente entre las demás.

### Fórmulas por dimensión
Ver spec original para fórmulas detalladas.

## Estructura de Código

```
src/lib/gamification/
├── index.ts
├── config.ts
├── trust-score-calculator.ts
├── dimensions/
│   ├── rondas.ts
│   ├── asistencia.ts
│   ├── sistema-digital.ts
│   ├── supervision.ts
│   └── capacitacion.ts
├── points-engine.ts
├── streak-tracker.ts
├── badge-evaluator.ts
├── ranking-calculator.ts
└── bonus-generator.ts
```

## API Routes

### Admin (OPAI) — `/api/gamification/`
- `GET/PUT config` — configuración
- `GET guardia/[id]` — score completo + historial + badges
- `GET instalacion/[id]` — ranking instalación
- `CRUD badges`, `CRUD desafios`, `CRUD fondos`, `CRUD beneficios`
- `GET rankings/global`, `rankings/instalacion/[id]`, `rankings/top-movers`
- `PUT fondos/[id]/sugerencias/[sugId]` — aprobar/rechazar bono

### Portal Guardia — `/api/portal/guardia/gamification/`
- `GET scorecard` — score actual, nivel, racha, progreso
- `GET historial` — eventos de puntos paginado
- `GET ranking` — ranking instalación (sin bottom performers)
- `GET badges` — ganados + bloqueados visibles
- `GET desafios` — activos + progreso
- `GET beneficios` — catálogo canjeable
- `POST reconocimiento` — enviar reconocimiento peer
- `GET feed` — feed social de instalación
- `POST canjear` — canjear puntos
- `GET tendencia` — gráfico 6 meses

### Portal Cliente — `/api/portal/cliente/gamification/`
- `GET instalacion/[id]` — ranking con nombres, trust score promedio
- `GET comparativa` — instalación vs promedio Gard

## Cron Job

`/api/cron/gamification-calculate` — ejecución diaria 2:00 AM Chile.
- Calcular scores diarios para todos los guardias activos
- Generar eventos de puntos por acciones del día anterior
- Actualizar rachas
- Evaluar condiciones de badges
- Calcular rankings
- Lunes: score semanal
- Día 1: score mensual + sugerencias de bono

## Permisos

- Submódulo `"gamificacion"` en `SUBMODULE_KEYS.ops`
- Capability `"gamificacion_bonos_aprobar"`
- Defaults: owner/admin=full, operaciones/supervisor=edit, rrhh=edit, viewer/solo_ops=view

## Seeds

`prisma/seeds/gamification-seed.ts`:
- GamificacionConfig con defaults
- 15-20 badges predefinidos (rachas, asistencia, rondas, equipo, capacitación, secretos)

## Orden de Implementación

1. Modelos Prisma + migración
2. Estructura `src/lib/gamification/`
3. Trust Score Calculator (5 dimensiones)
4. Points Engine (event-driven)
5. Cron job consolidación
6. API routes admin
7. API routes portal guardia
8. Seed badges + config
9. Permisos (ambos sistemas)
