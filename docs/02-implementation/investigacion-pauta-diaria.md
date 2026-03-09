# Investigación: Pauta Diaria (Asistencia Diaria)

## 1. Modelos principales en el schema

### 1.1 `OpsPautaMensual` — Planificación mensual
> `prisma/schema.prisma:2461` · Tabla: `ops.pauta_mensual`

Es la **fuente de verdad de la planificación**. Cada fila representa **1 puesto + 1 slot + 1 fecha**.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | UUID (PK) | Identificador único |
| `tenantId` | String | Tenant |
| `installationId` | UUID (FK) | → `CrmInstallation` |
| `puestoId` | UUID (FK) | → `OpsPuestoOperativo` |
| `slotNumber` | Int (default 1) | Slot dentro del puesto (S1, S2, etc.) |
| `date` | Date | Fecha del día planificado |
| `plannedGuardiaId` | UUID? (FK) | → `OpsGuardia` — guardia planificado original |
| `shiftCode` | String? | `"T"` = día de trabajo, `"-"` = día libre |
| `status` | String (default `"planificado"`) | Estado de la celda |
| `replacementGuardiaId` | UUID? (FK) | → `OpsGuardia` — reemplazo transitorio |
| `replacementReason` | String? | `"vacaciones"` \| `"licencia_medica"` \| `"permiso"` |
| `guardEventId` | UUID? (FK) | → `OpsGuardEvent` — evento que originó el reemplazo |
| `notes` | String? | Notas libres |
| `createdBy` | String? | Usuario creador |

**Constraint único:** `(puestoId, slotNumber, date)` — una sola celda por puesto/slot/fecha.

**Índices clave:**
- `idx_ops_pauta_installation_date` → `(installationId, date)`
- `idx_ops_pauta_guardia` → `(plannedGuardiaId)`

---

### 1.2 `OpsAsistenciaDiaria` — Materialización operacional diaria
> `prisma/schema.prisma:2973` · Tabla: `ops.asistencia_diaria`

Se **auto-crea** desde la pauta mensual al consultar el endpoint. Agrega campos operacionales de asistencia real.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | UUID (PK) | Identificador único |
| `tenantId` | String | Tenant |
| `installationId` | UUID (FK) | → `CrmInstallation` |
| `puestoId` | UUID (FK) | → `OpsPuestoOperativo` |
| `slotNumber` | Int (default 1) | Slot dentro del puesto |
| `date` | Date | Fecha |
| `plannedGuardiaId` | UUID? (FK) | Guardia planificado (sincronizado desde pauta) |
| `actualGuardiaId` | UUID? (FK) | Guardia que realmente asistió |
| `replacementGuardiaId` | UUID? (FK) | Guardia de reemplazo/turno extra |
| `attendanceStatus` | String (default `"pendiente"`) | `"pendiente"` \| `"ppc"` \| `"asistio"` \| `"reemplazo"` \| etc. |
| `checkInAt` | Timestamptz? | Hora de entrada (marcación) |
| `checkOutAt` | Timestamptz? | Hora de salida (marcación) |
| `checkInSource` | String? (default `"none"`) | Fuente del check-in |
| `checkOutSource` | String? (default `"none"`) | Fuente del check-out |
| `plannedShiftStart` | String? | Hora inicio turno planificado (e.g. `"07:00"`) |
| `plannedShiftEnd` | String? | Hora fin turno planificado (e.g. `"19:00"`) |
| `plannedMinutes` | Int (default 0) | Minutos planificados del turno |
| `workedMinutes` | Int (default 0) | Minutos efectivamente trabajados |
| `overtimeMinutes` | Int (default 0) | Minutos extras |
| `lateMinutes` | Int (default 0) | Minutos de atraso |
| `hoursCalculatedAt` | Timestamptz? | Última vez que se calcularon horas |
| `notes` | String? | Notas |
| `teGenerated` | Boolean (default false) | Si se generó turno extra |
| `lockedAt` | Timestamptz? | Fecha de bloqueo (no editable) |
| `lockedBy` | String? | Usuario que bloqueó |
| `correctionReason` | String? | Razón de corrección |

**Constraint único:** `(puestoId, slotNumber, date)`

**Relaciones:**
- `plannedGuardia` → `OpsGuardia` (rel: `ops_asistencia_planificada_guardia`)
- `actualGuardia` → `OpsGuardia` (rel: `ops_asistencia_real_guardia`)
- `replacementGuardia` → `OpsGuardia` (rel: `ops_asistencia_reemplazo_guardia`)
- `turnosExtra` → `OpsTurnoExtra[]`

---

### 1.3 `OpsPuestoOperativo` — Puesto operativo en una instalación
> `prisma/schema.prisma:2419` · Tabla: `ops.puestos_operativos`

Define un puesto de trabajo dentro de una instalación, con horarios y configuración.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | UUID (PK) | Identificador único |
| `tenantId` | String | Tenant |
| `installationId` | UUID (FK) | → `CrmInstallation` |
| `name` | String | Nombre del puesto (e.g. `"S1"`, `"S2"`) |
| `puestoTrabajoId` | UUID? (FK) | → `CpqPuestoTrabajo` — tipo de puesto (**"GGSS"**) |
| `cargoId` | UUID? (FK) | → `CpqCargo` — cargo |
| `rolId` | UUID? (FK) | → `CpqRol` — rol/modalidad (**"4×4"**, con `patternWork`/`patternOff`) |
| `shiftStart` | String | Hora inicio turno (e.g. `"07:00"`) |
| `shiftEnd` | String | Hora fin turno (e.g. `"19:00"`) |
| `weekdays` | String[] | Días de la semana activos |
| `requiredGuards` | Int (default 1) | Guardias requeridos en el puesto |
| `baseSalary` | Decimal? | Sueldo base |
| `teMontoClp` | Decimal? | Monto turno extra en CLP |
| `active` | Boolean (default true) | Si el puesto está activo |
| `activeFrom` | Date? | Fecha desde que está activo |
| `activeUntil` | Date? | Fecha hasta que está activo |

---

### 1.4 Catálogos CPQ relacionados

**`CpqPuestoTrabajo`** (`prisma/schema.prisma:946` · Tabla: `cpq.puestos_trabajo`):
- `id`, `name` (unique, e.g. `"GGSS"`), `colorHex`, `active`
- Corresponde al **tipo de puesto** en el screenshot.

**`CpqCargo`** (`prisma/schema.prisma:962` · Tabla: `cpq.cargos`):
- `id`, `name` (unique), `description`, `colorHex`, `active`

**`CpqRol`** (`prisma/schema.prisma:979` · Tabla: `cpq.roles`):
- `id`, `name` (unique, e.g. `"4×4"`), `patternWork` (Int), `patternOff` (Int), `colorHex`, `active`
- Corresponde a la **modalidad/patrón rotativo** en el screenshot.

---

### 1.5 `OpsGuardia` — Guardia de seguridad
> `prisma/schema.prisma:2217` · Tabla: `ops.guardias`

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | UUID (PK) | Identificador único |
| `tenantId` | String | Tenant |
| `personaId` | UUID (FK, unique) | → `Persona` (nombre, apellido, rut) |
| `code` | String? | Código del guardia (e.g. `"G-000371"`) |
| `status` | String (default `"active"`) | Estado |
| `lifecycleStatus` | String (default `"postulante"`) | `"postulante"` \| `"contratado"` \| `"te"` \| `"desvinculado"` |
| `hiredAt` | Date? | Fecha de contratación |
| `isBlacklisted` | Boolean | Si está en lista negra |

---

### 1.6 `OpsSerieAsignacion` — Serie/patrón rotativo
> `prisma/schema.prisma:2855` · Tabla: `ops.serie_asignaciones`

Define el patrón cíclico que genera las celdas en la pauta mensual.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | UUID (PK) | Identificador único |
| `puestoId` | UUID (FK) | → `OpsPuestoOperativo` |
| `slotNumber` | Int | Slot dentro del puesto |
| `guardiaId` | UUID? (FK) | → `OpsGuardia` asignado a la serie |
| `patternCode` | String | Código del patrón (e.g. `"4x4"`) |
| `patternWork` | Int | Días de trabajo (e.g. `4`) |
| `patternOff` | Int | Días libres (e.g. `4`) |
| `startDate` | Date | Fecha de inicio de la serie |
| `startPosition` | Int (default 1) | Posición inicial en el ciclo |
| `endDate` | Date? | Fecha fin (null = indefinida) |
| `isActive` | Boolean | Si la serie está activa |
| `isRotativo` | Boolean | Si es rotativo (día/noche) |
| `rotatePuestoId` | UUID? | Puesto al que rota |
| `rotateSlotNumber` | Int? | Slot al que rota |
| `startShift` | String? | `"day"` \| `"night"` — turno inicial |
| `linkedSerieId` | UUID? | Serie vinculada (rotación) |

---

### 1.7 `OpsAsignacionGuardia` — Asignación base permanente
> `prisma/schema.prisma:2515` · Tabla: `ops.asignacion_guardias`

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | UUID (PK) | Identificador único |
| `guardiaId` | UUID (FK) | → `OpsGuardia` |
| `puestoId` | UUID (FK) | → `OpsPuestoOperativo` |
| `slotNumber` | Int | Slot |
| `installationId` | UUID (FK) | → `CrmInstallation` |
| `startDate` | Date | Desde cuándo está asignado |
| `endDate` | Date? | Hasta cuándo (null = vigente) |
| `isActive` | Boolean | Si está activa |

---

## 2. Cadena de relaciones completa

```
CrmInstallation (instalación física)
  │
  ├─ OpsPuestoOperativo (puesto dentro de la instalación)
  │    ├─ puestoTrabajoId → CpqPuestoTrabajo.name  ("GGSS")
  │    ├─ rolId → CpqRol.name  ("4×4", patternWork=4, patternOff=4)
  │    ├─ cargoId → CpqCargo.name
  │    ├─ shiftStart / shiftEnd  ("07:00" / "19:00")
  │    │
  │    ├─ OpsAsignacionGuardia (asignación permanente guardia↔puesto↔slot)
  │    │    └─ guardiaId → OpsGuardia
  │    │
  │    ├─ OpsSerieAsignacion (patrón rotativo que genera la pauta)
  │    │    ├─ guardiaId → OpsGuardia
  │    │    ├─ patternCode ("4x4"), patternWork (4), patternOff (4)
  │    │    └─ Al "pintar serie" → genera filas en OpsPautaMensual
  │    │
  │    ├─ OpsPautaMensual (planificación día a día)
  │    │    ├─ date, slotNumber
  │    │    ├─ plannedGuardiaId → OpsGuardia (planificado original)
  │    │    ├─ replacementGuardiaId → OpsGuardia (reemplazo transitorio)
  │    │    ├─ shiftCode: "T" (trabajo) | "-" (libre)
  │    │    └─ guardEventId → OpsGuardEvent (evento que originó reemplazo)
  │    │
  │    └─ OpsAsistenciaDiaria (materialización operacional diaria)
  │         ├─ Se auto-crea desde OpsPautaMensual (solo shiftCode="T")
  │         ├─ plannedGuardiaId (sincronizado desde pauta)
  │         ├─ actualGuardiaId (quién realmente cubrió)
  │         ├─ replacementGuardiaId (reemplazo/TE)
  │         ├─ attendanceStatus, checkIn/Out, worked/overtime/late minutes
  │         └─ turnosExtra → OpsTurnoExtra[]
  │
  └─ OpsMarcacion (marcaciones biométricas/PIN por guardia+instalación+timestamp)
```

---

## 3. Mapeo de campos del screenshot

| Campo en UI | Origen | Modelo.campo |
|---|---|---|
| **"GGSS"** (tipo puesto) | Catálogo | `OpsPuestoOperativo.puestoTrabajoId` → `CpqPuestoTrabajo.name` |
| **"4×4"** (modalidad) | Catálogo | `OpsPuestoOperativo.rolId` → `CpqRol.name` (+ `patternWork`/`patternOff`) |
| **"07:00"** (hora inicio) | Puesto | `OpsPuestoOperativo.shiftStart` |
| **"S1"** (slot) | Asistencia | `OpsAsistenciaDiaria.slotNumber` (o `OpsPuestoOperativo.name`) |
| **"07:00-19:00"** (rango turno) | Puesto | `OpsPuestoOperativo.shiftStart` - `OpsPuestoOperativo.shiftEnd` |
| **"Día"** (tipo turno) | Lógica | Derivado: si `shiftStart` < `shiftEnd` → "Día", sino → "Noche" |
| **"Planificado: Mendoza Pacheco Breyler Jose"** | Asistencia | `OpsAsistenciaDiaria.plannedGuardiaId` → `OpsGuardia.persona.firstName` + `persona.lastName` |
| **"(G-000371)"** | Guardia | `OpsGuardia.code` |
| **"Reemplazo: —"** | Asistencia | `OpsAsistenciaDiaria.replacementGuardiaId` → `OpsGuardia` (null = "—") |
| **"Marcación: —"** | Marcaciones | `OpsMarcacion` filtrada por `guardiaId` + `installationId` + `date` (vacío = "—") |

---

## 4. Endpoint que alimenta la vista

### `GET /api/ops/asistencia`
> `src/app/api/ops/asistencia/route.ts`

**Parámetros query:**
- `installationId` — UUID de la instalación (o `"all"` para todas)
- `date` — fecha en formato `YYYY-MM-DD` (default: hoy)

**Flujo completo:**

1. **Autenticación y permisos**: `requireAuth()` + `ensureOpsAccess()`

2. **Consulta pauta mensual** — obtiene filas de `OpsPautaMensual` para la fecha:
   ```
   WHERE tenantId = X
     AND installationId = Y (o sin filtro si "all")
     AND date = Z
     AND puesto.active = true
     AND shiftCode = "T"  ← solo días de trabajo
   ```

3. **Limpieza de filas huérfanas** — elimina asistencias de puestos inactivos (no bloqueadas, sin reemplazo)

4. **Limpieza de "fantasmas"** — elimina asistencias que ya no tienen pauta con `shiftCode="T"` (protege filas con TE vinculado)

5. **Auto-creación** — `createMany({ skipDuplicates: true })` crea filas en `OpsAsistenciaDiaria` desde la pauta:
   ```typescript
   {
     tenantId, installationId, puestoId, slotNumber, date,
     plannedGuardiaId: replacementGuardiaId ?? plannedGuardiaId,
     attendanceStatus: tieneGuardia ? "pendiente" : "ppc",
     plannedShiftStart, plannedShiftEnd, plannedMinutes,
     workedMinutes: 0, overtimeMinutes: 0, lateMinutes: 0
   }
   ```

6. **Sincronización** — actualiza `plannedGuardiaId` y horarios desde la pauta en filas existentes. Ajusta status:
   - Con guardia → `"pendiente"` (si estaba en estado inicial)
   - Sin guardia (PPC) → `"ppc"` (limpia reemplazos/TE pendientes)

7. **Query final** — `OpsAsistenciaDiaria.findMany` con includes:
   ```typescript
   include: {
     installation: { select: { id, name } },
     puesto: { select: { id, name, shiftStart, shiftEnd, teMontoClp, requiredGuards } },
     plannedGuardia: { select: { id, code, lifecycleStatus, persona: { firstName, lastName, rut } } },
     actualGuardia: { /* idem */ },
     replacementGuardia: { /* idem */ },
     turnosExtra: { select: { id, status, amountClp, guardiaId } },
   }
   orderBy: [installation.name ASC, puesto.name ASC, slotNumber ASC]
   ```

8. **Marcaciones** — consulta aparte a `OpsMarcacion`:
   ```
   WHERE guardiaId IN [...todos los guardias involucrados]
     AND installationId IN [...todas las instalaciones]
     AND timestamp BETWEEN fecha 00:00 AND fecha+1 00:00
   ORDER BY timestamp ASC
   ```
   Se agrupan por `guardiaId|installationId` y se adjuntan a cada fila.

**Response:**
```json
{
  "success": true,
  "data": {
    "date": "2026-03-09",
    "items": [
      {
        "id": "uuid",
        "installationId": "uuid",
        "puestoId": "uuid",
        "slotNumber": 1,
        "date": "2026-03-09",
        "plannedGuardiaId": "uuid",
        "actualGuardiaId": null,
        "replacementGuardiaId": null,
        "attendanceStatus": "pendiente",
        "checkInAt": null,
        "checkOutAt": null,
        "plannedShiftStart": "07:00",
        "plannedShiftEnd": "19:00",
        "plannedMinutes": 720,
        "workedMinutes": 0,
        "overtimeMinutes": 0,
        "lateMinutes": 0,
        "installation": { "id": "uuid", "name": "Instalación X" },
        "puesto": { "id": "uuid", "name": "S1", "shiftStart": "07:00", "shiftEnd": "19:00", "teMontoClp": 25000, "requiredGuards": 1 },
        "plannedGuardia": { "id": "uuid", "code": "G-000371", "lifecycleStatus": "contratado", "persona": { "firstName": "Breyler Jose", "lastName": "Mendoza Pacheco", "rut": "12345678-9" } },
        "actualGuardia": null,
        "replacementGuardia": null,
        "turnosExtra": [],
        "marcaciones": []
      }
    ]
  }
}
```

---

## 5. Página y componente cliente

### Server page
> `src/app/(app)/ops/pauta-diaria/page.tsx`

- Ruta: `/ops/pauta-diaria`
- Permisos: `canView(perms, "ops", "pauta_diaria")`
- Carga en servidor:
  - `CrmAccount` (clientes activos con instalaciones activas)
  - `OpsGuardia` (guardias con `lifecycleStatus IN ["contratado", "te"]`, no blacklisted)
- Renderiza `<OpsPautaDiariaClient>`

### Client component
> `src/components/ops/OpsPautaDiariaClient.tsx` (~1500 líneas)

- Props: `initialClients`, `guardias`, `userRole`
- Selector de fecha + selector de instalación (por cliente)
- Llama a `GET /api/ops/asistencia?installationId=X&date=Y`
- Muestra cards agrupadas por instalación, cada una con filas por puesto/slot
- Permite: asignar reemplazo, registrar asistencia, generar turno extra, ver marcaciones

---

## 6. Query conceptual: "Para la instalación X, en la fecha Y, ¿quién está planificado en turno día?"

```sql
-- Equivalente conceptual (Prisma lo hace via ORM)
SELECT
  ad.slot_number,
  po.name AS puesto_name,
  po.shift_start,
  po.shift_end,
  pt.name AS tipo_puesto,       -- "GGSS"
  r.name AS modalidad,          -- "4×4"
  p_plan.first_name || ' ' || p_plan.last_name AS planificado,
  g_plan.code AS codigo_guardia, -- "G-000371"
  p_remp.first_name || ' ' || p_remp.last_name AS reemplazo,
  ad.attendance_status,
  ad.check_in_at,
  ad.check_out_at
FROM ops.asistencia_diaria ad
JOIN ops.puestos_operativos po ON po.id = ad.puesto_id
LEFT JOIN cpq.puestos_trabajo pt ON pt.id = po.puesto_trabajo_id
LEFT JOIN cpq.roles r ON r.id = po.rol_id
LEFT JOIN ops.guardias g_plan ON g_plan.id = ad.planned_guardia_id
LEFT JOIN personas p_plan ON p_plan.id = g_plan.persona_id
LEFT JOIN ops.guardias g_remp ON g_remp.id = ad.replacement_guardia_id
LEFT JOIN personas p_remp ON p_remp.id = g_remp.persona_id
WHERE ad.installation_id = 'X'
  AND ad.date = 'Y'
  AND po.active = true
ORDER BY po.name ASC, ad.slot_number ASC;
```

---

## 7. Endpoints relacionados (referencia)

| Ruta | Método | Descripción |
|---|---|---|
| `/api/ops/asistencia` | GET | Lista asistencia diaria (auto-crea desde pauta) |
| `/api/ops/asistencia` | POST/PATCH | Actualiza estado de asistencia |
| `/api/ops/asistencia/[id]` | PATCH | Actualiza fila individual |
| `/api/ops/asistencia/export-horas-extra` | GET | Exporta horas extra |
| `/api/ops/pauta-mensual` | GET | Lista pauta mensual |
| `/api/ops/pauta-mensual/generar` | POST | Genera pauta desde serie |
| `/api/ops/pauta-mensual/pintar-serie` | POST | Pinta serie en la pauta |
| `/api/ops/pauta-mensual/guardar` | POST | Guarda cambios en pauta |
| `/api/ops/pauta-mensual/assign-replacement` | POST | Asigna reemplazo en pauta |
| `/api/ops/pauta-mensual/resumen` | GET | Resumen de pauta |
| `/api/ops/pauta-mensual/export-excel` | GET | Exporta pauta a Excel |
| `/api/ops/pauta-mensual/export-pdf` | GET | Exporta pauta a PDF |
