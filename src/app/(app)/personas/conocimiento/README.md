# Personas → Conocimiento

Vista cross-instalación que muestra el estado de protocolos y el cumplimiento (vía exámenes) de cada equipo de guardias. Forma parte del módulo Personas y reusa los modelos de protocolos y exámenes del CRM (no se duplica nada).

## Páginas

- `/personas/conocimiento` — grilla cross-instalación (KPIs, búsqueda, filtros por estado, ordenar, lista de `InstallationCard`).
- `/personas/conocimiento/[installationId]` — detalle: KPIs, sección de cumplimiento por área, heatmap por guardia × sección, lista de guardias y acciones rápidas (editar protocolo en CRM, descargar reporte cliente).

Ambos exigen `canView(perms, "ops", "guardias")` (mismo permiso que `/personas/guardias`).

## Endpoints

| Método | Path | Notas |
|--------|------|-------|
| `GET` | `/api/personas/conocimiento/overview` | Querystring opcional: `search`, `status` (`ok`, `warning`, `critical`, `no_protocol`, `no_evaluated`, `all`), `order` (`score_asc`, `score_desc`, `name`, `lastExam`). Cache en memoria de 60s por `tenantId`. |
| `GET` | `/api/personas/conocimiento/installations/[id]` | Devuelve detalle con guardias, scores por sección y trend mensual. Multi-tenant guard. |
| `GET` | `/api/personas/conocimiento/installations/[id]/dispatch-history` | Lista de próximos envíos recurrentes estimados (por examen × guardia activo) y últimas 50 corridas del cron. Mismo gate `canView(ops.guardias)`. |
| `GET` | `/api/portal/cliente/conocimiento?installationId=…` | Para portal cliente. Anonimiza por defecto (iniciales + `opaqueId` sha256 truncado a 12 chars con `tenantId` como salt). Respeta `PortalConfig.canSeeGuardNames` y `PortalConfig.conocimiento`. |
| `GET` | `/api/installations/[id]/protocol/client-report/pdf` | PDF white/print-friendly del reporte cliente. Audita la descarga. |
| `GET/PUT` | `/api/configuracion/knowledge` | Lee/actualiza `KnowledgeConfig` tenant-wide (días, deadline, recordatorios, email_enabled). PUT audita en `AuditLog`. Permiso: `config.conocimiento`. |
| `POST` | `/api/cron/exam-recurring` | Cron diario 03:00 UTC. Por cada examen activo `recurring`: resuelve frecuencia (override de examen → legacy `recurringMonths × 30` → default tenant) y crea `ExamAssignment` con tracking completo (`trigger`, `dueAt`, `notificationStatus`). Persiste un `ExamRecurringDispatchRun` por tenant para auditoría Ley 21.719. |
| `POST` | `/api/cron/exam-reminders` | Cron horario. (A) marca como `expired` lo vencido (`dueAt < now`); (B) envía recordatorio a asignaciones con `reminderSentAt: null` cuando `sentAt + reminderDays < now`. `reminderDays` viene de `KnowledgeConfig`; 0 = desactivado. |

## Modelos Prisma reutilizados

- `crm.protocol_sections` (`ProtocolSection`), `crm.protocol_items` (`ProtocolItem`)
- `crm.protocol_versions` (`ProtocolVersion`)
- `crm.exams` (`Exam`), `crm.exam_questions` (`ExamQuestion`), `crm.exam_assignments` (`ExamAssignment`)
- `crm.exam_recurring_dispatch_runs` (`ExamRecurringDispatchRun`) — auditoría por corrida del cron
- `ops.asignacion_guardias` (`OpsAsignacionGuardia`) y `ops.guardias` (`OpsGuardia`)

`Exam.recurringDays` (Int?) reemplaza a `Exam.recurringMonths` como fuente de verdad. `recurringMonths` queda deprecado pero leído como fallback (`recurringMonths × 30`) para no romper exámenes existentes. `ExamAssignment` además trackea `trigger` (manual | on_assignment | recurring), `triggeredByUserId`, `dueAt`, `notificationStatus`, `notificationError`, `notificationSentAt`, `reminderSentAt`, `dispatchRunId`. La agregación cross-instalación vive en `src/lib/protocols/knowledge-aggregator.ts`; los helpers tenant-wide en `src/lib/knowledge/{config,dispatch-helpers}.ts`.

## Configurabilidad por tenant

### Portal Cliente

`PortalConfig` (en `src/lib/portal-cliente-types.ts`) soporta:

- `conocimiento?: boolean` — default `true`. Si está en `false`, la sub-tab "Conocimiento del equipo" no se muestra y `GET /api/portal/cliente/conocimiento` responde 403.
- `canSeeGuardNames?: boolean` — default `false`. Cuando `true` el portal cliente recibe los nombres completos de guardia en lugar de iniciales.

### Knowledge / Exámenes recurrentes

`KnowledgeConfig` (en `src/lib/knowledge/config.ts`, persistido en `Setting` con `category: "knowledge"`, cache 5min por tenantId):

| Setting | Default | Rango | Descripción |
|--------|---------|-------|-------------|
| `recurringDefaultDays` | 90 | 1–365 | Días entre envíos recurrentes cuando un `Exam.recurringDays` es `null`. |
| `dispatchHourCl` | 9 | 0–23 | Hora referencial Chile (informativa: el cron corre 03:00 UTC). |
| `deadlineDays` | 14 | 1–365 | Días para responder antes de marcar `expired`. |
| `reminderDays` | 7 | 0–365 | Días sin abrir antes de mandar recordatorio. 0 desactiva. |
| `emailEnabled` | `true` | bool | Si `false`, los crons crean `ExamAssignment` pero no envían email; `notificationStatus` queda en `skipped_disabled`. |

UI en `/opai/configuracion/conocimiento` (permiso `config.conocimiento`). Cada examen puede sobreescribir vía `Exam.recurringDays` desde el editor del CRM (`ExamsSubTab` step 3).

## Auto-flow exámenes

Los tres caminos pasan por `createAssignmentAndNotify` (`src/lib/knowledge/dispatch-helpers.ts`), que es el único punto donde se crea un `ExamAssignment`. Persiste tracking completo (`trigger`, `dueAt`, `notificationStatus`, `notificationError`, `notificationSentAt`) y propaga `triggeredByUserId` cuando aplica.

- **`scheduleType: "manual"`** — operador envía manualmente desde `POST /api/installations/[id]/exams/[examId]/send`. `attemptNumber` se calcula del último intento por guardia (`groupBy + _max`). El examen pasa de `draft` a `active` automáticamente.
- **`scheduleType: "on_assignment"`** — al crear un `OpsAsignacionGuardia` activo, se invoca `assignOnAssignmentExams` (best-effort; nunca rompe la transacción padre).
- **`scheduleType: "recurring"`** — `/api/cron/exam-recurring` resuelve la frecuencia con prioridad `Exam.recurringDays > Exam.recurringMonths × 30 > KnowledgeConfig.recurringDefaultDays`. Crea asignaciones agrupadas por tenant en un `ExamRecurringDispatchRun` con contadores y errores serializados (Ley 21.719: prueba de entrega).

Los tres usan `notifyGuardOfExam` para enviar (Resend). El retorno es `Promise<NotifyResult>` con `{ status: "sent" | "failed" | "skipped_no_email" | "skipped_no_resend" | "skipped_disabled", error? }`. El status se persiste en `ExamAssignment.notificationStatus` para auditoría.

Recordatorios + expiración corren en `/api/cron/exam-reminders` cada hora.

## Telemetría (GTM)

Eventos disparados a `dataLayer`:

- `knowledge_overview_viewed`
- `knowledge_installation_viewed` (con `installation_id_hash` calculado en cliente)
- `client_knowledge_viewed`
- `client_knowledge_pdf_downloaded`

## Audit log

`logAudit({ action: "EXPORT_DATA", entity: "ProtocolClientReport", details: { kind: "knowledge_report_downloaded", installationId } })` cada vez que un operador descarga el PDF del reporte cliente.

## Cómo correr los tests

```bash
npx vitest run src/lib/protocols
```

Tests del aggregator: `src/lib/protocols/__tests__/knowledge-aggregator.test.ts`.

## Mockup de referencia

Este módulo sigue al pie de la letra `opai-conocimiento-mockups.html` (vistas A operador, B detalle, C portal cliente). Las primitivas de UI viven en `src/components/opai/conocimiento/_primitives.tsx` y replican los estilos del mockup (`card-mock`, `pill-mock`, `bar-mock`, `hm-cell`, `tap-mock`, `grain-overlay`, `blob-mock`).
