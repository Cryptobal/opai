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
| `GET` | `/api/portal/cliente/conocimiento?installationId=…` | Para portal cliente. Anonimiza por defecto (iniciales + `opaqueId` sha256 truncado a 12 chars con `tenantId` como salt). Respeta `PortalConfig.canSeeGuardNames` y `PortalConfig.conocimiento`. |
| `GET` | `/api/installations/[id]/protocol/client-report/pdf` | PDF white/print-friendly del reporte cliente. Audita la descarga. |
| `POST` | `/api/cron/exam-recurring` | Cron diario 03:00 UTC; genera `ExamAssignment` para guardias activos cuando el último intento es más antiguo que `recurringMonths`. |

## Modelos Prisma reutilizados

- `crm.protocol_sections` (`ProtocolSection`), `crm.protocol_items` (`ProtocolItem`)
- `crm.protocol_versions` (`ProtocolVersion`)
- `crm.exams` (`Exam`), `crm.exam_questions` (`ExamQuestion`), `crm.exam_assignments` (`ExamAssignment`)
- `ops.asignacion_guardias` (`OpsAsignacionGuardia`) y `ops.guardias` (`OpsGuardia`)

No hay nuevos modelos. Toda la agregación vive en `src/lib/protocols/knowledge-aggregator.ts`.

## Configurabilidad por tenant

`PortalConfig` (en `src/lib/portal-cliente-types.ts`) ahora soporta:

- `conocimiento?: boolean` — default `true`. Si está en `false`, la sub-tab "Conocimiento del equipo" no se muestra y `GET /api/portal/cliente/conocimiento` responde 403.
- `canSeeGuardNames?: boolean` — default `false`. Cuando `true` el portal cliente recibe los nombres completos de guardia en lugar de iniciales.

## Auto-flow exámenes

- **`scheduleType: "manual"`** — operador envía manualmente desde el CRM. Notifica al guardia por email (Resend).
- **`scheduleType: "on_assignment"`** — al crear un `OpsAsignacionGuardia` activo, se invoca `assignOnAssignmentExams` (best-effort; nunca rompe la transacción padre). Crea un `ExamAssignment` salvo que ya exista uno `sent | opened` para ese par.
- **`scheduleType: "recurring"`** — el cron `/api/cron/exam-recurring` recorre los exámenes activos y para cada guardia activo crea un `ExamAssignment` si la última evaluación es más antigua que `recurringMonths`.

Los tres caminos comparten `notifyGuardOfExam` (email Resend). Si el guardia no tiene email o `RESEND_API_KEY` no está configurada, se loguea y omite — nunca rompe el flujo.

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
