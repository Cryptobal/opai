## REPORTE DE AUDITORIA — Gamificacion OPAI

### Resumen Ejecutivo

OPAI es un ERP multi-modulo para Gard Security construido con Next.js App Router + Prisma + PostgreSQL (multi-schema: public, ops, crm, payroll, fx, cpq, docs, finance, inventory, notes, chat, access_control). El sistema ya cuenta con una base de datos operativa muy rica para alimentar un modulo de gamificacion. Los modelos clave del guardia (`OpsGuardia`), instalacion (`CrmInstallation`), rondas (`OpsRondaEjecucion` con `trustScore`), asistencia diaria (`OpsAsistenciaDiaria` con `lateMinutes`), marcacion digital (`OpsMarcacion`), visitas de supervision con evaluacion numerica por guardia (`OpsSupervisionGuardEvaluation`), turnos extra (`OpsTurnoExtra`), y examenes (`Exam`/`ExamAssignment`) ya existen y tienen campos cuantitativos que pueden alimentar directamente un sistema de puntuacion.

El mayor hallazgo es que **ya existe un campo `trustScore` (Int) en `OpsRondaEjecucion`** con un `trustBreakdown` (JSON), lo que indica que ya hay logica de scoring para rondas. Tambien existe `OpsInstallationHealthScore` que calcula un score de salud por instalacion. Sin embargo, **no existe ningun modelo de gamificacion** (puntos, badges, niveles, rankings, leaderboard) ni tabla de configuracion de reglas de puntaje.

El sistema tiene portales funcionales (guardia, cliente, supervisor, rondas) con APIs dedicadas, un sistema de roles granular (13 roles con permisos por modulo/submodulo), configuracion via tabla `Setting` (key/value por tenant), y 9 cron jobs existentes. La arquitectura es clara y consistente para integrar un nuevo modulo.

---

### Modelos Encontrados

#### Guardia

- **Modelo persona**: `OpsPersona` (schema `ops`, tabla `personas`)
  - Campos clave: `id` (UUID), `tenantId`, `firstName`, `lastName`, `rut`, `email`, `phone`, `phoneMobile`, `birthDate`, `sex`, `nacionalidad`, `afp`, `healthSystem`, `status` (default "active")
  - Datos previsionales: `regimenPrevisional`, `tipoPension`, `isJubilado`, `cotizaAFP`, `cotizaAFC`, `cotizaSalud`
  - Direccion: `addressFormatted`, `commune`, `city`, `region`, `lat`, `lng`
  - Relacion: `guardia OpsGuardia?` (1:1)

- **Modelo guardia**: `OpsGuardia` (schema `ops`, tabla `guardias`)
  - Campos clave: `id` (UUID), `tenantId`, `personaId` (unique, FK a OpsPersona), `code`, `status` (default "active"), `lifecycleStatus` (default "postulante"), `hiredAt`, `terminatedAt`, `terminationReason`
  - Blacklist: `isBlacklisted`, `blacklistReason`, `blacklistedAt`
  - Instalacion actual: `currentInstallationId` (FK a CrmInstallation) — **SI tiene relacion directa con instalacion**
  - Disponibilidad TE: `availableExtraShifts`
  - Marcacion: `marcacionPin` (hash bcrypt), `marcacionPinVisible`
  - Contrato: `contractType` ("plazo_fijo" | "indefinido"), `contractStartDate`, `contractPeriod1End`...`contractPeriod3End`, `contractCurrentPeriod`, `contractBecameIndefinidoAt`
  - Evaluacion TE: `estadoUniforme` ("completo"|"incompleto"), `notaEvaluacion` ("bueno"|"regular"|"malo"), `comentarioEvaluacion`
  - Salario: `salaryStructureId`, `montoAnticipo`, `recibeAnticipo`
  - OS10: `os10` (Boolean)
  - **Campos de scoring existentes**: `notaEvaluacion` (cualitativo, no numerico)
  - Relaciones clave (26 relaciones):
    - `persona` → OpsPersona
    - `currentInstallation` → CrmInstallation
    - `salaryStructure` → PayrollSalaryStructure
    - `asignaciones` → OpsAsignacionGuardia[]
    - `pautas` / `pautasReemplazo` → OpsPautaMensual[]
    - `asistenciasPlanificadas` / `asistenciasReales` / `asistenciasReemplazo` → OpsAsistenciaDiaria[]
    - `turnosExtra` → OpsTurnoExtra[]
    - `marcaciones` → OpsMarcacion[]
    - `rondaEjecuciones` → OpsRondaEjecucion[]
    - `rondaMarcaciones` → OpsMarcacionCheckpoint[]
    - `rondaIncidentes` → OpsRondaIncidente[]
    - `supervisionEvaluations` → OpsSupervisionGuardEvaluation[]
    - `supervisionFindings` → OpsSupervisionFinding[]
    - `examAssignments` → ExamAssignment[]
    - `tickets` → OpsTicket[]
    - `inventoryGuardiaAssignments` → InventoryGuardiaAssignment[]
    - `patrolSessions` → OpsPatrullajeSesion[]
    - `checkpointTaskResponses` → OpsCheckpointTaskResponse[]
    - `flags` → OpsGuardiaFlag[]
    - `comments` → OpsComentarioGuardia[]
    - `documents` → OpsDocumentoPersona[]
    - `historyEvents` → OpsGuardiaHistory[]
    - `guardEvents` → OpsGuardEvent[]

- **Tabla intermedia de asignacion**: `OpsAsignacionGuardia` (tabla `asignacion_guardias`)
  - Campos: `guardiaId`, `puestoId`, `slotNumber`, `installationId`, `startDate`, `endDate`, `isActive`, `reason`
  - Vincula guardia → puesto operativo → instalacion

- **Flags del guardia**: `OpsGuardiaFlag` (tabla `guardia_flags`)
  - Campos: `type`, `label`, `severity` (default "info"), `notes`, `active`

- **NO tiene relacion directa con usuario del sistema (Admin)**. Los guardias se autentican por separado (RUT+PIN en portales).

---

#### Instalacion

- **Modelo**: `CrmInstallation` (schema `crm`, tabla `installations`)
  - Campos clave: `id` (UUID), `tenantId`, `accountId` (FK → CrmAccount), `leadId`, `name`, `address`, `city`, `commune`, `lat`, `lng`, `isActive`, `geoRadiusM` (default 100), `marcacionCode` (unique, 8 chars para QR), `teMontoClp`, `nocturnoEnabled`, `chatEnabled`, `startDate`, `endDate`, `notes`, `metadata` (JSON)
  - **Vinculo con cliente**: via `accountId` → `CrmAccount`
  - **CrmAccount** tiene campos: `name`, `rut`, `status` ("prospect"|"client_active"|"client_inactive"), `portalConfig`, `portalEjecutivoId`
  - Relaciones con guardias:
    - `guardiasActuales` → OpsGuardia[] (guardias con currentInstallationId apuntando aqui)
    - `opsAsignacionGuardias` → OpsAsignacionGuardia[]
    - `opsPuestos` → OpsPuestoOperativo[]
  - Relaciones operativas: `opsPautas`, `opsAsistencias`, `opsTurnosExtra`, `opsMarcaciones`, `opsCheckpoints`, `opsRondaTemplates`, `opsRondaEjecuciones`, `rondaIncidentes`, `opsRondaAlertas`, `supervisorAssignments`, `supervisionVisits`, `supervisionFindings`, `encuestasCliente`, `installationHealthScore`

- **Health Score existente**: `OpsInstallationHealthScore` (tabla `installation_health_scores`)
  - `score` (Int, default 0), `avgRating`, `daysSinceLastVisit`, `openFindingsCount`, `overdueFindingsCount`, `lastDotationCompliance`, `lastChecklistCompliance`, `bookUpToDate`, `calculatedAt`
  - **Ya es un scoring automatico por instalacion**

---

#### Rondas

##### OpsRondaTemplate (tabla `ronda_templates`)
- Template de ronda por instalacion
- Campos: `installationId`, `name`, `description`, `orderMode` ("strict"|"flexible"), `estimatedDurationMin`, `qrRequerido`, `isActive`
- Relaciones: `checkpoints` → OpsRondaCheckpoint[], `programaciones` → OpsRondaProgramacion[], `ejecuciones` → OpsRondaEjecucion[]

##### OpsRondaCheckpoint (tabla `ronda_checkpoints`)
- Liga template de ronda con checkpoint
- Campos: `rondaTemplateId`, `checkpointId`, `orderIndex`, `isRequired`, `maxTimeMinutes`
- **SI se puede saber cuales checkpoints eran requeridos** (`isRequired`) y cuales fueron visitados

##### OpsCheckpoint (tabla `checkpoints`)
- Checkpoints fisicos por instalacion
- Campos: `installationId`, `name`, `description`, `instrucciones`, `qrCode`, `lat`, `lng`, `geoRadiusM`, `verificationType` ("GEOFENCE"), `isCritical`, `sortOrder`, `isActive`

##### OpsCheckpointTask (tabla `checkpoint_tasks`)
- Tareas asignadas a checkpoints
- Campos: `checkpointId`, `label`, `type` ("boolean"|"checklist"|"select"|"text"|"number"|"photo"), `required`, `options` (JSON), `config` (JSON con min, max, alertOnValue), `isActive`

##### OpsCheckpointTaskResponse (tabla `checkpoint_task_responses`)
- Respuestas individuales a tareas
- Campos: `taskId`, `marcacionId`, `guardiaId`, `value` (JSON), `photoUrls` (JSON), `respondedAt`, `lat`, `lng`
- **SI se registra completacion individual de tareas**

##### OpsRondaProgramacion (tabla `ronda_programaciones`)
- Programacion de rondas (horarios)
- Campos: `rondaTemplateId`, `diasSemana` (JSON), `horaInicio`, `horaFin`, `frecuenciaMinutos`, `toleranciaMinutos`, `isActive`

##### OpsRondaEjecucion (tabla `ronda_ejecuciones`) — **MODELO CRITICO**
- Campos:
  - `rondaTemplateId`, `programacionId`, `guardiaId`, `installationId`
  - `status`: "pendiente" | "en_curso" | "completada" | "incompleta" | "no_realizada"
  - `scheduledAt`, `startedAt`, `completedAt` — **SI tiene timestamps de inicio/fin**
  - `checkpointsTotal`, `checkpointsCompletados`, `porcentajeCompletado` (Float)
  - **`trustScore` (Int, default 0)** — **YA EXISTE UN SCORE**
  - **`trustBreakdown` (JSON)** — desglose del score
  - `durationMinutes`
  - `isOfflineSync`, `syncedAt`, `deviceInfo` (JSON), `alertas` (JSON, DEPRECATED), `notes`
- Relaciones: `guardia` → OpsGuardia, `installation` → CrmInstallation, `marcaciones` → OpsMarcacionCheckpoint[], `alertasRows` → OpsAlertaRonda[], `incidentes` → OpsRondaIncidente[]

##### OpsMarcacionCheckpoint (tabla `marcacion_checkpoints`)
- Registro de cada checkpoint marcado durante una ronda
- Campos: `ejecucionId`, `checkpointId`, `guardiaId`, `timestamp`, `lat`, `lng`, `geoValidada`, `geoDistanciaM`, `batteryLevel`, `motionData` (JSON), `speedFromPrevKmh`, `timeFromPrevSec`, `fotoEvidenciaUrl`, `audioUrl`, `note`, `hashIntegridad`, `anomalias` (JSON), `status` (default "COMPLETED"), `verificationMethod` (default "QR"), `isOfflineSync`
- **Datos anti-fraude ricos**: velocidad, datos de movimiento, anomalias, hash de integridad

##### OpsAlertaRonda (tabla `alertas_ronda`)
- Alertas generadas durante rondas
- Campos: `ejecucionId`, `installationId`, `guardiaId`, `tipo`, `severidad` ("info"|"warning"|"critical"), `mensaje`, `data` (JSON), `resuelta`, `isAcknowledged`

##### OpsRondaIncidente (tabla `ronda_incidentes`)
- Incidentes reportados durante rondas
- Campos: `ejecucionId`, `rondaTemplateId`, `checkpointId`, `guardiaId`, `installationId`, `tipo`, `descripcion`, `fotoUrl`, `lat`, `lng`, `status` (default "abierto")
- **SI tiene relacion con guardia, instalacion y ronda**

---

#### Asistencia

##### OpsAsistenciaDiaria (tabla `asistencia_diaria`)
- Registro diario de asistencia por puesto/slot/fecha
- Campos:
  - `installationId`, `puestoId`, `slotNumber`, `date`
  - `plannedGuardiaId`, `actualGuardiaId`, `replacementGuardiaId`
  - `attendanceStatus` (default "pendiente")
  - `checkInAt`, `checkOutAt` — **timestamps de entrada/salida**
  - `checkInSource`, `checkOutSource` (default "none") — **distingue fuente de marcacion**
  - `plannedShiftStart`, `plannedShiftEnd`, `plannedMinutes`
  - `workedMinutes`, `overtimeMinutes`, **`lateMinutes`** (default 0) — **SI registra tardanzas**
  - `hoursCalculatedAt`
  - `teGenerated`, `lockedAt`, `lockedBy`, `correctionReason`
- **SI existe modelo de turno programado** contra el cual comparar (via `OpsPuestoOperativo` con `shiftStart`/`shiftEnd` y `OpsPautaMensual`)
- Relacion con turno extra: `turnosExtra` → OpsTurnoExtra[]

##### OpsMarcacion (tabla `marcaciones`)
- Marcacion digital individual
- Campos: `guardiaId`, `installationId`, `puestoId`, `slotNumber`, `tipo` ("entrada"|"salida"), `timestamp`, `lat`, `lng`, `geoValidada`, `geoDistanciaM`, **`metodoId`** (default "rut_pin") — **SI distingue tipo de marcacion**, `fotoEvidenciaUrl`, `ipAddress`, `userAgent`, `hashIntegridad`, **`atrasoMinutos`** (cuando tipo=entrada)
- **NO hay campo explicito de digital vs manual/papel**, pero `metodoId` indica el metodo y `checkInSource`/`checkOutSource` en AsistenciaDiaria distingue la fuente

##### PayrollAttendanceRecord (tabla `attendance_records`, schema `payroll`)
- Consolidado mensual de asistencia para nomina
- Campos: `guardiaId`, `year`, `month`, `daysWorked`, `daysAbsent`, `daysMedicalLeave`, `daysVacation`, `daysUnpaidLeave`, `totalDaysMonth`, `scheduledDays`, `sundaysWorked`, `sundaysScheduled`, `normalHours`, `overtimeHours50`, `overtimeHours100`, `lateHours`, `dailyDetail` (JSON)
- **Inasistencias**: se registran como `daysAbsent` pero NO hay distincion justificada vs injustificada en este modelo (eso se maneja en `OpsGuardEvent`)

---

#### Visitas de Supervision

##### OpsVisitaSupervision (tabla `visitas_supervision`)
- Visita de supervisor a instalacion
- Campos principales:
  - `supervisorId` (FK → Admin), `installationId`
  - Check-in/out: `checkInAt`, `checkInLat/Lng`, `checkInGeoValidada`, `checkInDistanciaM`, `checkOutAt`, `checkOutLat/Lng`
  - `status` (default "in_progress"), `generalComments`
  - Dotacion: `guardsExpected`, `guardsFound`, `guardsCounted`
  - Libro: `bookUpToDate`, `bookLastEntryDate`, `bookPhotoUrl`, `bookNotes`
  - Cliente: `clientContacted`, `clientContactName`, `clientSatisfaction` (Int), `clientComment`, `clientValidationUrl`
  - `installationState`, `installationStateNotes`
  - **`healthScore` (Int)** — puntaje de salud calculado
  - `ratings` (JSON), `documentChecklist` (JSON)
  - `durationMinutes`, `wizardStep`, `isExpressFlagged`, `draftData` (JSON)
- Relaciones: `images`, `guardEvaluations`, `findings`, `checklistResults`, `photos`, `encuestaCliente`

##### OpsSupervisionGuardEvaluation (tabla `supervision_guard_evaluations`)
- **Evaluacion numerica individual por guardia**
- Campos: `visitId`, `guardId` (FK → OpsGuardia), `guardName`
  - **`presentationScore` (Int)** — presentacion personal
  - **`orderScore` (Int)** — orden
  - **`protocolScore` (Int)** — protocolo
  - `observation` (Text)
  - `isReinforcement` (Boolean)
- **SI tiene puntuacion numerica y relacion directa con guardia**

##### OpsSupervisionFinding (tabla `supervision_findings`)
- Hallazgos/observaciones
- Campos: `visitId`, `installationId`, `guardId`, `category`, `severity` ("minor"|...), `description`, `photoUrl`, `ticketId`, `status` (default "open"), `resolvedAt`, `verifiedInVisitId`
- **Los hallazgos negativos se asocian directamente al guardia**

##### OpsEncuestaCliente (tabla `encuestas_cliente`)
- Encuesta de satisfaccion del cliente en visita
- Campos numericos: `serviceQuality`, `scheduleCompliance`, `personalPresentation`, `professionalism`, `supervisionPresence`, `incidentResponse`, `npsScore`, `averageScore` (Float)
- `hasUrgentRisk`, `signatureUrl`, `clientPhotoUrl`

##### OpsInstallationChecklistItem + OpsSupervisionChecklistResult
- Checklist configurable por instalacion con resultados por visita

---

#### Turnos/Programacion

##### OpsPuestoOperativo (tabla `puestos_operativos`)
- Define puestos de trabajo en instalaciones
- Campos: `installationId`, `name`, `puestoTrabajoId`, `cargoId`, `rolId`, `shiftStart`, `shiftEnd`, `weekdays`, `requiredGuards`, `baseSalary`, `teMontoClp`, `salaryStructureId`, `active`, `activeFrom`, `activeUntil`
- **Este es el "turno programado"**: define horarios y dias de trabajo

##### OpsPautaMensual (tabla `pauta_mensual`)
- Pauta mensual: asignacion de guardia a puesto por dia
- Campos: `installationId`, `puestoId`, `slotNumber`, `date`, `plannedGuardiaId`, `shiftCode`, `status` (default "planificado"), `replacementGuardiaId`, `replacementReason` ("vacaciones"|"licencia_medica"|"permiso"), `guardEventId`

##### OpsSerieAsignacion (tabla `serie_asignaciones`)
- Patrones de turnos rotativos (ej: 4x4, 5x2)
- Campos: `puestoId`, `slotNumber`, `guardiaId`, `patternCode`, `patternWork`, `patternOff`, `startDate`, `startPosition`, `isRotativo`, `rotatePuestoId`, `startShift` ("day"|"night"), `linkedSerieId`

##### OpsTurnoExtra (tabla `turnos_extra`)
- **Turnos extra bonificables**
- Campos: `asistenciaId`, `installationId`, `puestoId`, `guardiaId`, `date`, `status` (default "pending"), `tipo` ("turno_extra"|"hora_extra"), `isManual`, `horasExtra`, `amountClp`, `approvedBy`, `approvedAt`, `rejectedBy`, `rejectedAt`, `paidAt`
- **SI existe concepto de turno extra que podemos bonificar**

##### OpsRefuerzoSolicitud (tabla `refuerzo_solicitudes`)
- Solicitudes de refuerzo (guardias adicionales por demanda del cliente)
- Campos: `installationId`, `accountId`, `guardiaId`, `turnoExtraId`, `startAt`, `endAt`, `guardsCount`, `rateClp`, `estimatedTotalClp`, `guardPaymentClp`, `status`, `invoiceNumber`
- **SI existe concepto de refuerzo**

---

#### Incidentes/Reportes

##### OpsRondaIncidente (tabla `ronda_incidentes`)
- Incidentes reportados durante rondas (ya documentado arriba)
- **SI los guardias pueden reportar incidentes** (con tipo, descripcion, foto, GPS)
- Relacion: guardia, instalacion, ronda, checkpoint

##### OpsTicket (tabla `ops_tickets`)
- Sistema general de tickets/requerimientos
- Campos: `code`, `ticketTypeId`, `status`, `priority` (p1-p4), `title`, `description`, `assignedTeam`, `assignedTo`, `installationId`, `source`, `guardiaId`, `slaDueAt`, `slaBreached`, `resolvedAt`, `closedAt`, `tags`, `approvalStatus`
- Relaciones: `ticketType`, `guardia`, `approvals`, `comments`, `supervisionFindings`
- **Los guardias estan vinculados a tickets**

##### OpsTicketType (tabla `ops_ticket_types`)
- Tipos de ticket configurables: `slug`, `name`, `origin`, `requiresApproval`, `slaHours`, `defaultPriority`
- Con `OpsTicketTypeApprovalStep` para flujos de aprobacion

---

#### Capacitacion

##### Exam (tabla `exams`, schema `crm`)
- Examenes por instalacion
- Campos: `installationId`, `title`, `type` ("protocol"|"security_general"), `status` ("draft"|"active"|"archived"), `scheduleType` ("manual"|"on_assignment"|"recurring"), `recurringMonths`, `passingScore` (default 60)

##### ExamQuestion (tabla `exam_questions`)
- Preguntas: `questionText`, `questionType` ("multiple_choice"|"true_false"), `options` (JSON), `correctAnswer`, `source` ("manual"|"ai_generated")

##### ExamAssignment (tabla `exam_assignments`)
- Asignacion de examen a guardia
- Campos: `examId`, `guardId` (FK → OpsGuardia), `status` ("sent"|"opened"|"completed"|"expired"), `score` (Float), `answers` (JSON), `timeTakenSecs`, `attemptNumber`
- **SI existe capacitacion con puntaje numerico por guardia**

---

#### Gamificacion existente

**No existe ningun modelo de gamificacion.** No hay tablas de puntos, badges, niveles, rankings, ni leaderboard.

**Campos de scoring/performance existentes dispersos en otros modelos:**

| Modelo | Campo | Tipo | Descripcion |
|--------|-------|------|-------------|
| `OpsRondaEjecucion` | `trustScore` | Int | Score de confianza de ronda |
| `OpsRondaEjecucion` | `trustBreakdown` | JSON | Desglose del trust score |
| `OpsRondaEjecucion` | `porcentajeCompletado` | Float | % completitud de ronda |
| `OpsVisitaSupervision` | `healthScore` | Int | Score de salud de la visita |
| `OpsSupervisionGuardEvaluation` | `presentationScore` | Int | Evaluacion presentacion |
| `OpsSupervisionGuardEvaluation` | `orderScore` | Int | Evaluacion orden |
| `OpsSupervisionGuardEvaluation` | `protocolScore` | Int | Evaluacion protocolo |
| `OpsEncuestaCliente` | `serviceQuality` | Int | Calidad servicio (encuesta) |
| `OpsEncuestaCliente` | `npsScore` | Int | NPS del cliente |
| `OpsEncuestaCliente` | `averageScore` | Float | Promedio encuesta |
| `OpsInstallationHealthScore` | `score` | Int | Health score instalacion |
| `ExamAssignment` | `score` | Float | Nota del examen |
| `OpsGuardia` | `notaEvaluacion` | String | "bueno"\|"regular"\|"malo" |
| `OpsAsistenciaDiaria` | `lateMinutes` | Int | Minutos de atraso |
| `OpsMarcacion` | `atrasoMinutos` | Int | Atraso en marcacion |
| `OpsMarcacionCheckpoint` | `anomalias` | JSON | Anomalias detectadas |

---

### Eventos Laborales

##### OpsGuardEvent (tabla `guard_events`)
- Eventos laborales del guardia: ausencias, finiquitos, amonestaciones
- `category`: "ausencia" | "finiquito" | "amonestacion"
- `subtype`: "vacaciones" | "licencia_medica" | "finiquito" | "amonestacion_verbal" | etc.
- Fechas, montos de liquidacion, workflow de aprobacion
- **Util para gamificacion**: amonestaciones como penalizacion, asistencia perfecta como bonus

---

### Portales

- **Portal del Guardia**: `/src/app/portal/guardia/` — EXISTE
  - Paginas: `page.tsx`, `layout.tsx` (basico)
  - API dedicada: `/api/portal/guardia/` con endpoints para:
    - `auth` (autenticacion RUT+PIN)
    - `profile` (perfil del guardia)
    - `attendance` (asistencia)
    - `schedule` (horarios)
    - `documents` (documentos)
    - `exams` / `exams/[id]` (examenes con open/submit/retake)
    - `extra-shifts` (turnos extra)
    - `liquidaciones` (liquidaciones de sueldo)
    - `marcaciones` (marcaciones)
    - `protocol` / `protocol/pdf` (protocolo de instalacion)
    - `results` (resultados)
    - `tickets` / `tickets/[id]` (tickets con appeal/accept-rejection)
    - `chat` (chat con canales)

- **Portal del Cliente**: `/src/app/portal/cliente/` — EXISTE (mas desarrollado)
  - Paginas: `page.tsx`, `layout.tsx`, `PortalClienteClient.tsx`, `forgot-pin/`, `setup/`
  - API dedicada: `/api/portal/cliente/` con endpoints para:
    - `auth`, `logout`, `forgot-pin`, `setup`
    - `summary` (resumen general)
    - `activity`, `audit`
    - `alertas` / `alertas/config`
    - `compliance`, `comparativa`
    - `personal`, `guards` (guardias de su cuenta)
    - `rondas` / `rondas/[id]` (rondas de sus instalaciones)
    - `tickets` / `tickets/[id]/comments`
    - `reportes` / `reportes/[id]/download`
    - `cotizaciones` (con approve/reject/accept-proposal)
    - `empresa` (contactos, instalaciones, personeria, representantes)
    - `contract-data`, `contracts`
    - `encuestas`
    - `access-control` (control de acceso por instalacion)
    - `chat`, `posta`
    - `demo` / `demo/data` / `demo/generate`
    - `tour`

- **Portal del Supervisor**: `/src/app/portal/supervisor/` — EXISTE
  - Paginas: `page.tsx`, `layout.tsx`
  - API: `/api/portal/supervisor/`
    - `session`
    - `mi-equipo`
    - `novedades`
    - `turnos-extra` / `turnos-extra/[id]`
    - `visitas-tecnicas` / `visitas-tecnicas/[id]`

- **Portal de Rondas**: `/src/app/portal/rondas/` — EXISTE
  - API: `/api/portal/rondas/`
    - `auth`, `mis-rondas`
    - `marcar`, `completar`
    - `incidente`
    - `sync`, `upload`

- **Portal de Acceso**: `/src/app/portal/acceso/` — EXISTE
  - Control de acceso a instalaciones con componentes, hooks, tabs

- **Autenticacion separada por rol**: SI
  - Admin: NextAuth con email/password (modelo `Admin`)
  - Guardias: RUT+PIN (`marcacionPin` en OpsGuardia) via `/api/portal/guardia/auth`
  - Clientes: PIN/setup via `/api/portal/cliente/auth`
  - Supervisor: session via `/api/portal/supervisor/session`

---

### Arquitectura

#### Patron de API
- **Next.js App Router** con API Routes (`/src/app/api/...`)
- REST puro (no tRPC)
- Patron tipico:
  ```typescript
  import { NextRequest, NextResponse } from "next/server";
  import { prisma } from "@/lib/prisma";
  import { requireAuth, unauthorized } from "@/lib/api-auth";
  import { ensureOpsAccess } from "@/lib/ops";
  // GET/POST/PUT/DELETE exportados como funciones async
  ```
- Autenticacion via `requireAuth()` que retorna session con tenantId
- Acceso a modulos via helpers como `ensureOpsAccess()`

#### Sistema de Roles
- **13 roles** definidos en `src/lib/role-policy.ts`:
  - `owner`, `admin`, `editor`, `rrhh`, `operaciones`, `finanzas`, `reclutamiento`, `solo_ops`, `solo_crm`, `solo_documentos`, `solo_payroll`, `solo_finanzas`, `supervisor`, `viewer`
- Roles almacenados como string en `Admin.role` (default "admin") con `roleTemplateId` opcional
- **Permisos granulares v2** en `src/lib/permissions.ts`:
  - 4 niveles: `none` | `view` | `edit` | `full`
  - 8 modulos: `hub`, `ops`, `crm`, `docs`, `payroll`, `cpq`, `config`, `finance`
  - Submodulos por modulo (ops tiene: puestos, pauta_mensual, pauta_diaria, turnos_extra, marcaciones, ppc, guardias, rondas, control_nocturno, tickets, supervision, inventario, eventos_laborales)
  - Capabilities especiales: `invite_users`, `te_approve`, `te_pay`, `rondas_configure`, `rondas_resolve_alerts`, etc.
- **RoleTemplate** (tabla `role_templates`): permisos como JSON, permite templates personalizados
- Acceso por rol controlado en: `src/lib/rbac.ts`, `src/lib/ops-rbac.ts`, `src/lib/api-auth.ts`

#### Sistema de Configuracion
- **Modelo `Setting`** (schema `public`): key/value por tenant
  - Campos: `key` (unique), `value` (String), `type` (String), `category` (String?), `tenantId`
  - Patron establecido: settings se leen con helpers como `getTenantCompanyConfig()`
  - Para agregar nueva seccion: crear keys con prefijo (ej: "gamification.xxx") y helper de lectura
- **Configuracion de empresa**: via `src/lib/tenant-config.ts` — lee de Settings con cache de 5 min

#### Jobs/Cron
- **9 cron jobs** existentes en `/src/app/api/cron/`:
  1. `contract-alerts` — Alertas de vencimiento de contratos
  2. `document-alerts` — Alertas de documentos por vencer
  3. `finance-alerts` — Alertas financieras
  4. `followup-emails` — Emails de seguimiento CRM
  5. `marcacion-emails` — Emails de marcacion
  6. `portal-reportes` — Generacion de reportes para portal cliente
  7. `rondas/generar` — Generacion automatica de rondas programadas
  8. `signature-reminders` — Recordatorios de firma
  9. `sla-monitor` — Monitor de SLA de tickets
- Patron: API routes con GET handler, probablemente invocados por Vercel Cron o similar

#### Estructura de Carpetas (resumida)
```
/home/user/opai/
├── prisma/
│   ├── schema.prisma          # Schema unico (274KB, ~6000 lineas)
│   ├── seed.ts                # Orquestador de seeds
│   ├── seeds/                 # 8 archivos de seed
│   └── migrations/            # 115 migraciones
├── src/
│   ├── app/
│   │   ├── (app)/             # App principal autenticada
│   │   │   ├── chat/
│   │   │   ├── cpq/
│   │   │   ├── crm/
│   │   │   ├── finanzas/
│   │   │   ├── hub/
│   │   │   ├── opai/
│   │   │   ├── ops/
│   │   │   ├── payroll/
│   │   │   ├── personas/
│   │   │   ├── portales/      # Admin de portales
│   │   │   └── te/
│   │   ├── api/               # 35+ grupos de API routes
│   │   │   ├── access-control/
│   │   │   ├── auth/
│   │   │   ├── config/
│   │   │   ├── configuracion/
│   │   │   ├── cron/          # 9 cron jobs
│   │   │   ├── ops/
│   │   │   ├── portal/        # APIs de portales
│   │   │   └── ...
│   │   ├── portal/            # Portales publicos
│   │   │   ├── acceso/
│   │   │   ├── cliente/
│   │   │   ├── guardia/
│   │   │   ├── rondas/
│   │   │   └── supervisor/
│   │   ├── marcar/            # Marcacion publica
│   │   ├── ronda/             # Rondas publica
│   │   └── postulacion/       # Postulacion publica
│   └── lib/                   # ~90+ archivos de utilidades y servicios
│       ├── prisma.ts
│       ├── auth.ts / api-auth.ts
│       ├── permissions.ts / rbac.ts / role-policy.ts
│       ├── ops.ts / ops-rbac.ts / ops-attendance.ts
│       ├── rondas/            # Directorio dedicado a rondas
│       ├── portal/            # Logica de portales
│       ├── payroll/           # Logica de nomina
│       ├── configuracion/     # Logica de configuracion
│       ├── guard-portal.ts
│       ├── portal-cliente.ts / portal-supervisor.ts
│       ├── notification-service.ts
│       ├── tickets.ts
│       └── ...
```

---

### Datos Disponibles

| Metrica | Estado |
|---------|--------|
| Guardias en seed | 0 (solo templates de documentos laborales, no instancias) |
| Instalaciones en seed | 0 (solo referenciadas en templates) |
| Rondas ejecutadas en seed | 0 |
| Datos de asistencia en seed | 0 |
| Datos de catalogo (CPQ) | 23 items (uniformes, examenes, sistemas, comidas) |
| Cargos seed | 5 (Guardia, Supervisor, Inspector, Jefe de Turno, Operador CCTV) |
| Roles/Turnos seed | 6 (4x4, 5x2, 2x5, 6x1, 7x7, Turno Especial) |
| Puestos seed | 8 (Porteria, Control Acceso, CCTV, Ronda, Supervision, Recepcion, Estacionamiento, Otro) |
| Total migraciones | 115 (todas ejecutadas, ninguna pendiente) |
| Migraciones recientes | Access Control (abril 2026), CPQ/Payroll (febrero 2026) |

**Nota**: Los seeds son de datos de referencia/catalogo. Los datos operativos (guardias, rondas, asistencia) se generan en produccion.

---

### Gaps Identificados

1. **No existe modelo de Puntos/Score de Guardia** — No hay tabla para acumular puntos, ni historico de puntaje, ni snapshot de ranking
2. **No existe modelo de Badges/Logros** — No hay definicion de insignias ni registro de cuales ha obtenido cada guardia
3. **No existe modelo de Niveles** — No hay sistema de niveles o rangos progresivos
4. **No existe modelo de Leaderboard/Ranking** — No hay tabla de rankings precalculados
5. **No existe modelo de Reglas de Puntaje** — No hay configuracion de cuantos puntos otorga cada accion
6. **No existe tabla de Configuracion de Gamificacion** — No hay parametros de configuracion del modulo
7. **No existe historico de Trust Score del guardia** — El `trustScore` vive en cada ejecucion de ronda pero no hay consolidado mensual/anual por guardia
8. **No existe consolidado de performance del guardia** — No hay vista materializada ni tabla resumen que combine: asistencia + rondas + evaluacion + examenes + incidentes
9. **No existe modelo de Recompensas/Incentivos** — No hay registro de recompensas canjeadas
10. **No existe integracion entre scoring de rondas y scoring de supervision** — Son sistemas independientes
11. **No hay inasistencia justificada vs injustificada en asistencia diaria** — Se infiere de `OpsGuardEvent.category == "ausencia"` + subtype, pero no es campo directo
12. **No hay campo de "marcacion digital vs papel"** en AsistenciaDiaria — `checkInSource` puede inferirlo pero no es explicito
13. **No hay notificaciones push configuradas para gamificacion** — Hay `PortalNotificationPreference` pero sin categoria de gamificacion
14. **No hay datos de seed operativos** — Para desarrollo se necesitaran guardias, instalaciones y datos de rondas de ejemplo

---

### Recomendaciones

1. **Nueva carpeta de modulo**: Crear `src/lib/gamification/` para la logica de negocio, siguiendo el patron de `src/lib/rondas/`, `src/lib/payroll/`, etc.

2. **API Routes**: Crear `src/app/api/gamification/` para endpoints del modulo y extender `src/app/api/portal/guardia/` con endpoints de gamificacion para el guardia.

3. **Nuevos modelos en schema ops**: Agregar al schema `ops` (o crear schema `gamification`):
   - `GamificationConfig` — configuracion por tenant (reglas de puntaje, pesos, umbrales)
   - `GamificationGuardScore` — score consolidado por guardia (periodo mensual/semanal)
   - `GamificationScoreEvent` — historico de eventos de puntaje (cada accion que suma/resta puntos)
   - `GamificationBadge` — catalogo de badges definibles
   - `GamificationGuardBadge` — badges obtenidos por guardia
   - `GamificationLevel` — definicion de niveles
   - `GamificationLeaderboard` — snapshot de rankings por periodo

4. **Reutilizar scores existentes**: Integrar directamente `trustScore` de `OpsRondaEjecucion`, los scores de `OpsSupervisionGuardEvaluation`, `ExamAssignment.score`, y `OpsAsistenciaDiaria.lateMinutes` como inputs del motor de gamificacion.

5. **Cron job nuevo**: Agregar `/api/cron/gamification-calculate` para consolidar scores periodicamente, siguiendo el patron de los 9 crons existentes.

6. **Permisos**: Agregar submodulo `"gamificacion"` a los `SUBMODULE_KEYS.ops` en `src/lib/permissions.ts`.

7. **Settings**: Usar tabla `Setting` existente con keys prefijadas `gamification.*` para parametros ajustables.

8. **Portal del Guardia**: Agregar seccion de gamificacion al portal existente (`/portal/guardia`) — ya tiene la infraestructura de auth y API.

9. **Seeds operativos**: Sera necesario crear un seed de datos operativos (guardias de prueba con rondas, asistencia, evaluaciones) para desarrollo del modulo.
