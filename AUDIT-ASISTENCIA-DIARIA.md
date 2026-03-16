# REPORTE DE AUDITORIA — ASISTENCIA DIARIA

**Fecha:** 2026-03-16
**Objetivo:** Auditoria completa del modulo de Asistencia Diaria antes de refactorizar la vista mobile.
**Alcance:** Estructura de archivos, modelo de datos, vista actual, API endpoints, flujos de accion, problemas detectados.

---

## 1. MAPA DE ARCHIVOS

### 1.1 Pagina Principal y Componentes Core

| Archivo | Proposito | Lineas | Exporta |
|---------|-----------|--------|---------|
| `src/app/(app)/ops/pauta-diaria/page.tsx` | Server component — pagina principal de Asistencia Diaria. Carga clientes, instalaciones y guardias activos. Renderiza `OpsPautaDiariaClient`. | ~75 | `OpsAsistenciaDiariaPage` (default) |
| `src/components/ops/OpsPautaDiariaClient.tsx` | **Componente principal** — toda la UI de asistencia diaria: filtros, KPIs, lista agrupada por instalacion, acciones (asistio/ausente/reemplazo/reset), modales. | ~1343 | `OpsPautaDiariaClient` |
| `src/components/ops/PautasSubnav.tsx` | Sub-navegacion entre tabs: Mensual, Diaria, Turnos Extra, PPC, Refuerzos, Marcaciones, Auditoria. | ~34 | `PautasSubnav` |
| `src/components/ops/OpsSubnav.tsx` | Navegacion principal del modulo OPS. | ~47 | `OpsSubnav` |
| `src/components/ops/TeTurnosClient.tsx` | Vista de gestion de Turnos Extra (tab separado). | ~1049 | `TeTurnosClient` |
| `src/lib/ops-attendance.ts` | Utilidades de calculo: `computeAttendanceMetrics`, `computePlannedMinutes`, `computeWorkedMinutes`, `computeLateMinutes`, `parseTimeToMinutes`, `diffMinutesAcrossMidnight`. | ~94 | Funciones de calculo de metricas |
| `src/lib/validations/ops.ts` | Schemas Zod de validacion: `attendanceStatus` enum, `createTeManualSchema`, etc. | ~488 | Schemas de validacion |
| `src/lib/ops-rbac.ts` | RBAC helpers: `hasOpsCapability` para permisos de ejecucion. | — | `hasOpsCapability` |

### 1.2 API Routes

| Archivo | Proposito | Lineas |
|---------|-----------|--------|
| `src/app/api/ops/asistencia/route.ts` | GET — Lista asistencia diaria con auto-sync desde pauta mensual. | ~361 |
| `src/app/api/ops/asistencia/[id]/route.ts` | PATCH — Actualiza status, asigna reemplazo, genera/elimina TE, reset. | ~707 |
| `src/app/api/ops/asistencia/export-horas-extra/route.ts` | GET — Exporta CSV de horas extra. | ~145 |
| `src/app/api/te/route.ts` | GET/POST — Lista y crea Turnos Extra manuales. | ~184 |
| `src/app/api/te/export/route.ts` | GET — Exporta TE a Excel. | — |
| `src/app/api/ops/guardias-active-search/route.ts` | GET — Busca guardias activos por nombre/codigo/RUT. | ~92 |

### 1.3 Archivos Relacionados (Referencia Indirecta)

| Archivo | Proposito |
|---------|-----------|
| `src/app/(app)/ops/turnos-extra/page.tsx` | Pagina de Turnos Extra |
| `src/app/(app)/ops/pautas/page.tsx` | Pagina de Pauta Mensual |
| `src/app/(app)/ops/marcaciones/page.tsx` | Pagina de Marcaciones |
| `src/app/(app)/ops/audit-pautas/page.tsx` | Pagina de Auditoria de Pautas |
| `src/components/ops/OpsPautaMensualClient.tsx` | Cliente de Pauta Mensual |
| `src/components/ops/GuardiaDetailClient.tsx` | Detalle de guardia (incluye seccion asistencia) |
| `src/components/ops/guardia-sections/DiasTrabajadesSection.tsx` | Seccion dias trabajados en detalle de guardia |
| `src/components/ops/guardia-sections/TurnosExtraSection.tsx` | Seccion turnos extra en detalle de guardia |
| `src/components/ops/guardia-sections/MarcacionSection.tsx` | Seccion marcaciones en detalle de guardia |
| `src/components/reportes-dt/AsistenciaDiariaClient.tsx` | Reporte DT de asistencia diaria |
| `src/app/api/reportes/dt/asistencia-diaria/route.ts` | API reporte DT |
| `src/app/api/reportes/dt/asistencia-diaria/export-excel/route.ts` | Exportar reporte DT Excel |
| `src/app/api/reportes/dt/asistencia-diaria/export-pdf/route.ts` | Exportar reporte DT PDF |

### 1.4 Props del Componente Principal

```typescript
interface OpsPautaDiariaClientProps {
  initialClients: ClientOption[];   // { id, name, installations: { id, name }[] }[]
  guardias: GuardiaOption[];        // { id, code?, lifecycleStatus?, persona: { firstName, lastName, rut? } }[]
  userRole: string;                 // "owner" | "admin" | "supervisor" | etc.
}
```

---

## 2. MODELO DE DATOS

### 2.1 OpsAsistenciaDiaria

**Tabla:** `ops.asistencia_diaria`
**Schema:** `prisma/schema.prisma` (lineas ~3286-3344)

| Campo | Tipo | Default | Descripcion |
|-------|------|---------|-------------|
| `id` | String (UUID) | auto | PK |
| `tenantId` | String | — | Tenant |
| `installationId` | String (UUID) | — | FK: CrmInstallation |
| `puestoId` | String (UUID) | — | FK: OpsPuestoOperativo |
| `slotNumber` | Int | 1 | Numero de slot (1-20) |
| `date` | DateTime (Date) | — | Fecha de asistencia |
| `plannedGuardiaId` | String? (UUID) | null | FK: OpsGuardia (planificado) |
| `actualGuardiaId` | String? (UUID) | null | FK: OpsGuardia (real) |
| `replacementGuardiaId` | String? (UUID) | null | FK: OpsGuardia (reemplazo) |
| `attendanceStatus` | String | "pendiente" | Estado de asistencia |
| `checkInAt` | DateTime? | null | Hora entrada |
| `checkOutAt` | DateTime? | null | Hora salida |
| `checkInSource` | String? | "none" | Fuente entrada |
| `checkOutSource` | String? | "none" | Fuente salida |
| `plannedShiftStart` | String? | null | Hora inicio planificada |
| `plannedShiftEnd` | String? | null | Hora fin planificada |
| `plannedMinutes` | Int | 0 | Minutos planificados |
| `workedMinutes` | Int | 0 | Minutos trabajados |
| `overtimeMinutes` | Int | 0 | Minutos extras |
| `lateMinutes` | Int | 0 | Minutos de atraso |
| `hoursCalculatedAt` | DateTime? | null | Cuando se calcularon horas |
| `notes` | String? | null | Notas |
| **`teGenerated`** | **Boolean** | **false** | **Si se genero TE para esta asistencia** |
| `lockedAt` | DateTime? | null | Cuando se bloqueo |
| `lockedBy` | String? | null | Quien bloqueo |
| `correctionReason` | String? | null | Razon de correccion |
| `marcacionEntradaId` | String? (UUID) | null | FK: OpsMarcacion (entrada) |
| `marcacionSalidaId` | String? (UUID) | null | FK: OpsMarcacion (salida) |
| `source` | String | "manual" | "marcacion_electronica" / "manual" / "import" |
| `createdBy` | String? | null | Creador |
| `createdAt` | DateTime | now() | Creacion |
| `updatedAt` | DateTime | now() | Actualizacion |
| `deletedAt` | DateTime? | null | Soft delete (Res. N38) |
| `deletedBy` | String? | null | Quien elimino |
| `modifiedAt` | DateTime? | null | Modificacion |
| `modifiedBy` | String? | null | Quien modifico |
| `modificationReason` | String? | null | Razon modificacion |
| `isModified` | Boolean | false | Si fue modificado |

**Relaciones:**
- `installation` -> CrmInstallation (onDelete: Restrict)
- `puesto` -> OpsPuestoOperativo (onDelete: Restrict)
- `plannedGuardia` -> OpsGuardia (onDelete: SetNull)
- `actualGuardia` -> OpsGuardia (onDelete: SetNull)
- `replacementGuardia` -> OpsGuardia (onDelete: SetNull)
- `marcacionEntrada` -> OpsMarcacion (onDelete: SetNull)
- `marcacionSalida` -> OpsMarcacion (onDelete: SetNull)
- `turnosExtra` -> OpsTurnoExtra[] (back-relation)

**Unique Constraint:** `(puestoId, slotNumber, date)`

### 2.2 OpsTurnoExtra

**Tabla:** `ops.turnos_extra`
**Schema:** `prisma/schema.prisma` (lineas ~3346-3384)

| Campo | Tipo | Default | Descripcion |
|-------|------|---------|-------------|
| `id` | String (UUID) | auto | PK |
| `tenantId` | String | — | Tenant |
| `asistenciaId` | String? (UUID) | null | FK: OpsAsistenciaDiaria (UNIQUE) |
| `installationId` | String (UUID) | — | FK: CrmInstallation |
| `puestoId` | String? (UUID) | null | FK: OpsPuestoOperativo |
| `guardiaId` | String (UUID) | — | FK: OpsGuardia |
| `date` | DateTime (Date) | — | Fecha |
| `status` | String | "pending" | Estado: pending/approved/rejected/paid |
| `tipo` | String | "turno_extra" | "turno_extra" / "hora_extra" |
| `isManual` | Boolean | false | Si fue creado manualmente |
| `horasExtra` | Decimal? | null | Horas extra (4.1) |
| `amountClp` | Decimal | 0 | Monto CLP (12.2) |
| **`amountJustification`** | **String?** | **null** | **Justificacion del monto (Fase 3)** |
| `approvedBy` | String? | null | Aprobador |
| `approvedAt` | DateTime? | null | Fecha aprobacion |
| `rejectedBy` | String? | null | Rechazador |
| `rejectedAt` | DateTime? | null | Fecha rechazo |
| `rejectionReason` | String? | null | Razon rechazo |
| `paidAt` | DateTime? | null | Fecha pago |
| `createdBy` | String? | null | Creador |
| `createdAt` | DateTime | now() | Creacion |
| `updatedAt` | DateTime | now() | Actualizacion |

**Relaciones:**
- `asistencia` -> OpsAsistenciaDiaria? (onDelete: SetNull) — **UNIQUE**
- `installation` -> CrmInstallation (onDelete: Cascade)
- `puesto` -> OpsPuestoOperativo? (onDelete: SetNull)
- `guardia` -> OpsGuardia (onDelete: Restrict)
- `paymentItems` -> OpsPagoTeItem[] (back-relation)
- `refuerzoSolicitud` -> OpsRefuerzoSolicitud? (back-relation)

### 2.3 Estados de Asistencia

**Fuente:** `src/lib/validations/ops.ts` (linea 152)

```typescript
attendanceStatus: z.enum(["pendiente", "asistio", "no_asistio", "reemplazo", "ppc"])
```

| Estado | Icono | Descripcion |
|--------|-------|-------------|
| `pendiente` | `⏳` | Default — turno aun no controlado |
| `asistio` | `✅` | Guardia planificado presente |
| `no_asistio` | `❌` | Guardia planificado ausente |
| `reemplazo` | `🔄` | Reemplazo asignado (genera TE) |
| `ppc` | `🟡` | Puesto Por Cubrir (sin guardia planificado) |

### 2.4 Estados de Turno Extra

| Estado | Prioridad | Descripcion |
|--------|-----------|-------------|
| `paid` | 0 (max) | Pagado — protegido contra eliminacion |
| `approved` | 1 | Aprobado — puede eliminarse en reset |
| `pending` | 2 | Pendiente — puede eliminarse libremente |
| `rejected` | — | Rechazado — excluido de la vista activa |

### 2.5 Valor Base del TE

**Resolucion** (`src/app/api/te/route.ts`, lineas 54-58):

```typescript
const defaultAmount = (puesto && decimalToNumber(puesto.teMontoClp) > 0
  ? decimalToNumber(puesto.teMontoClp)
  : decimalToNumber(installation.teMontoClp)) || 0;
```

1. **Fuente primaria:** `OpsPuestoOperativo.teMontoClp` (Decimal 12.2)
2. **Fallback:** `CrmInstallation.teMontoClp` (Decimal 12.2, default 0)
3. **Default final:** 0

### 2.6 Relacion OpsAsistenciaDiaria <-> OpsTurnoExtra

- **Tipo:** One-to-One (opcional)
- OpsAsistenciaDiaria puede tener 0 o 1 OpsTurnoExtra
- Constraint UNIQUE en `OpsTurnoExtra.asistenciaId`
- Cuando status cambia a "reemplazo" con `replacementGuardiaId`, se auto-genera TE
- El flag `teGenerated` en OpsAsistenciaDiaria rastrea si se creo TE

---

## 3. VISTA ACTUAL

### 3.1 Layout

- **Tiene diseno responsive:** SI — usa `md:` breakpoints (768px) y `sm:` breakpoints
- **Componente mobile separado:** NO — todo en un solo componente con clases condicionales
- **Deteccion mobile:** `window.matchMedia("(min-width: 768px)")` -> `isDesktop` state (linea 211-217)
- **Layout desktop:** Grid de 5 columnas: `md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,150px)_auto]`
- **Layout mobile:** Stack vertical (`grid-cols-1`) con labels inline

### 3.2 Tabs (PautasSubnav)

| Tab | Ruta | Icono |
|-----|------|-------|
| Mensual | `/ops/pauta-mensual` | CalendarDays |
| **Diaria** | **`/ops/pauta-diaria`** | **UserRoundCheck** |
| Turnos Extra | `/ops/turnos-extra` | Clock3 |
| PPC | `/ops/ppc` | ShieldAlert |
| Refuerzos | `/ops/refuerzos` | Shield |
| Marcaciones | `/ops/marcaciones` | Fingerprint |
| Auditoria | `/ops/audit-pautas` | ClipboardList |

### 3.3 Filtros

| Filtro | Tipo | Ubicacion | Detalle |
|--------|------|-----------|---------|
| **Turno** | Segmented control | Siempre visible | Todos / Dia / Noche |
| **Fecha** | Date input + flechas | Siempre visible | `<` [date] `>` con ChevronLeft/Right |
| **Cliente** | SearchableSelect | Colapsable (btn "Filtros") | Todos los clientes activos |
| **Instalacion** | SearchableSelect | Colapsable (btn "Filtros") | Filtrado por cliente seleccionado |
| **KPI** | Click en tarjeta KPI | Siempre visible (post-carga) | Todos / Cubiertos / PPC / TE |

### 3.4 KPIs Mostrados

| KPI | Color | Calculo | Clickeable |
|-----|-------|---------|------------|
| **Total** | foreground | `shiftFilteredItems.length` | SI (muestra todos) |
| **Cubiertos** | emerald-400 | status === "asistio" OR "reemplazo" | SI (filtra cubiertos) |
| **PPC** | amber-400 | `!plannedGuardiaId` | SI (filtra PPC) |
| **TE** | rose-400 | turnosExtra con status !== "rejected" | SI (filtra TE) |
| **Cobertura** | emerald/amber (>=80%) | `(cubiertos/total)*100` | NO |

Layout KPI: `grid-cols-3 sm:grid-cols-5` (3+2 en mobile, 5 en desktop)

### 3.5 Cards de Turno (Row por Item)

**Campos mostrados por card/row:**

| Columna | Desktop | Mobile |
|---------|---------|--------|
| **Puesto** | Nombre, Slot, Horario, Dia/Noche badge, metricas (P/T/J/HE horas) | Igual + icono status |
| **Planificado** | Nombre guardia + codigo + badge TE, o "Sin asignar (PPC)" | Con label "Planificado" |
| **Reemplazo** | Nombre reemplazo + badge TE + info TE (tipo, status, monto), o "Buscar guardia..." button | Con label "Reemplazo" |
| **Marcacion** | Hora entrada + hora salida + metodo badge (Face ID/PIN/Manual) + "Ver detalle" | Con label "Marcacion" |
| **Acciones** | Botones: Asistio (check), No asistio (X), Resetear (rotate) | Igual |

**Altura aprox por card:** ~48px desktop (fila compacta), ~160-200px mobile (stack vertical)

**Acciones disponibles por estado:**

| Estado | Asistio | No asistio | Buscar guardia | Resetear |
|--------|---------|------------|----------------|----------|
| `pendiente` | SI | SI | NO | NO (sin cambios) |
| `asistio` | — (ya marcado) | NO (disabled) | NO | SI |
| `no_asistio` | NO | — (ya marcado) | SI | SI |
| `reemplazo` | NO (oculto) | NO (oculto) | SI (cambiar) | SI |
| `ppc` | NO (sin planificado) | NO (sin planificado) | SI | SI (si tiene reemplazo) |

### 3.6 Botones Especiales

- **Exportar HE dia:** Abre `/api/ops/asistencia/export-horas-extra?from=DATE&to=DATE` en nueva ventana
- **Expandir/Contraer:** Toggle global de secciones colapsables
- **Filtros:** Toggle visibilidad de filtros Cliente/Instalacion

### 3.7 Modales

1. **Modal "Marcar asistencia":** Obliga a ingresar hora entrada/salida. Botones: "Usar plan" (defaults shift hours), "+1h salida", "Guardar asistencia"
2. **Modal "Detalle marcacion digital":** Muestra hash integridad, GPS status, coordenadas, IP, dispositivo
3. **Modal "Contradiccion marcacion electronica":** Pide confirmacion si se marca no_asistio pero hay marcacion electronica existente
4. **Aviso "Asistencia previa":** Warning inline cuando `actualGuardiaId != plannedGuardiaId` y status=="asistio". Botones: "Validar" / "Corregir"

---

## 4. API ENDPOINTS

### 4.1 Endpoints de Lectura

| Metodo | URL | Proposito | Query Params |
|--------|-----|-----------|--------------|
| GET | `/api/ops/asistencia` | Lista asistencia diaria con auto-sync | `date` (YYYY-MM-DD), `installationId` (UUID o "all") |
| GET | `/api/ops/asistencia/export-horas-extra` | Exporta CSV horas extra | `from`, `to` (YYYY-MM-DD), `installationId?`, `guardiaId?` |
| GET | `/api/te` | Lista turnos extra | `status` (csv), `installationId?`, `guardiaId?`, `from?`, `to?` |
| GET | `/api/te/export` | Exporta TE a Excel | `from?`, `to?`, `installationId?` |
| GET | `/api/ops/guardias-active-search` | Busca guardias disponibles | `q` (min 2 chars: nombre/codigo/RUT) |

**GET /api/ops/asistencia — Detalle de campos retornados:**
- Datos de asistencia: id, date, attendanceStatus, checkInAt, checkOutAt, etc.
- Datos del guardia planificado: SI (plannedGuardia con persona)
- Datos del reemplazo: SI (replacementGuardia con persona)
- Monto del TE: SI (turnosExtra[].amountClp)
- Marcaciones: SI (array de marcaciones del guardia para esa fecha)
- Puesto con teMontoClp: SI

**GET /api/ops/guardias-active-search — Filtro de status:**
- `lifecycleStatus IN ["contratado", "seleccionado", "te"]`
- `status = "active"`, `isBlacklisted = false`
- **NO filtra** por availableExtraShifts ni por carga de TE existente

### 4.2 Endpoints de Escritura

| Metodo | URL | Proposito | Body Clave |
|--------|-----|-----------|------------|
| PATCH | `/api/ops/asistencia/[id]` | Actualiza status, asigna reemplazo, reset | `attendanceStatus`, `replacementGuardiaId`, `actualGuardiaId`, `checkInAt`, `checkOutAt`, `forceDeletePaidTe`, `forceDeleteReason`, `confirmarContradiccion` |
| POST | `/api/te` | Crea TE manual | `installationId`, `guardiaId`, `date`, `tipo`, `amountClp?`, `amountJustification?`, `puestoId?` |

**PATCH /api/ops/asistencia/[id] — Validaciones:**
1. Guardia reemplazo debe existir, estar activo, no en blacklist
2. **No-doblar:** Reemplazo no puede tener 2 turnos superpuestos el mismo dia (verifica en asistencia + TE manual)
3. **Contradiccion:** Si se marca no_asistio pero hay marcacion electronica -> retorna 409 con codigo `CONTRADICCION_MARCACION_ELECTRONICA`
4. **TE protegido:** No puede cambiar guardia en TE approved/paid; no puede eliminar TE paid sin admin + forceDeletePaidTe + reason

**PATCH /api/ops/asistencia/[id] — Side Effects:**
- Transicion a "reemplazo" -> Crea OpsTurnoExtra automaticamente (amountClp desde puesto/instalacion)
- Transicion a "asistio" -> Crea marcacion manual tipo "entrada" + email notificacion (con delay configurable)
- Reset a "pendiente"/"ppc" -> Soft-delete marcaciones manuales, elimina pending emails, elimina TE (con proteccion paid)
- Todos los cambios -> Audit log

---

## 5. FLUJOS DE ACCION

### 5.1 Confirmar Presencia (Asistio)

- **Funcion:** Click en boton Check -> `setAsistioModalItem(item)` (linea 989-995)
- **Archivo:** `src/components/ops/OpsPautaDiariaClient.tsx:979-999` (boton) + `:1108-1224` (modal)
- **Flujo:** Boton Check -> Modal con hora entrada/salida -> "Guardar asistencia" -> `patchAsistencia()`
- **Campos que actualiza:**
  - `attendanceStatus` -> `"asistio"` (solo si NO es reemplazo)
  - `actualGuardiaId` -> `actualGuardiaId ?? plannedGuardiaId ?? null`
  - `checkInAt` -> ISO datetime construido desde fecha + hora entrada
  - `checkOutAt` -> ISO datetime construido desde fecha + hora salida
- **Registra hora:** SI — obligatorio via modal (no se puede guardar sin horas)
- **Caso especial reemplazo:** Si status es "reemplazo", solo guarda checkIn/checkOut, NO cambia status a "asistio" (linea 1194-1205)

### 5.2 Marcar Ausente (No Asistio)

- **Funcion:** Click directo -> `patchAsistencia(item.id, { attendanceStatus: "no_asistio", actualGuardiaId: null })` (linea 1008-1013)
- **Archivo:** `src/components/ops/OpsPautaDiariaClient.tsx:1000-1018`
- **Abre buscador automaticamente:** NO — el dropdown de "Buscar guardia..." aparece como resultado del cambio de estado (condicion en linea 736: `showReplacementSearch = isPPC || item.attendanceStatus === "no_asistio" || ...`), pero no se abre el popover automaticamente, solo se muestra el boton
- **Son dos pasos:** SI — Paso 1: click "No asistio" (X). Paso 2: click "Buscar guardia..." y seleccionar reemplazo
- **Contradiccion:** Si existe marcacion electronica, backend retorna 409, se muestra modal de confirmacion

### 5.3 Asignar Reemplazo

- **Funcion:** Click en "Buscar guardia..." -> seleccionar guardia -> `patchAsistencia(item.id, { replacementGuardiaId: g.id, attendanceStatus: "reemplazo" })` (linea 778-785)
- **Archivo:** `src/components/ops/OpsPautaDiariaClient.tsx:710-818` (dropdown mobile) + `:1269-1340` (portal desktop)
- **Crea OpsTurnoExtra automaticamente:** SI — en el backend (`src/app/api/ops/asistencia/[id]/route.ts`, lineas 373-418), cuando `nextStatus === "reemplazo" && Boolean(updatedAsistencia.replacementGuardiaId)`
- **Muestra monto al asignar:** NO antes de asignar. SI despues: se muestra inline en la columna Reemplazo como `"TE pending ($XX.XXX)"` (linea 725-727)
- **Pide justificacion si cambia monto:** NO — la asignacion de reemplazo usa monto default automaticamente. `amountJustification` solo esta disponible al crear TE manual via POST /api/te
- **Actualiza `replacementGuardiaId`:** SI
- **Actualiza `actualGuardiaId`:** Se limpia a `null` en el backend al transicionar a "reemplazo" (linea 251-256 del route)
- **Validacion:** No puede asignar al guardia planificado como reemplazo (check en frontend linea 774 y backend)

### 5.4 Asignar PPC

- **Usa mismo flujo que reemplazo:** SI — identico UI y PATCH endpoint
- **Input de busqueda es funcional:** SI — completamente funcional, busca por nombre + codigo + RUT, limita a 20 resultados
- **Diferencia tecnica:** PPC empieza con `attendanceStatus = "ppc"` y `plannedGuardiaId = null`. El boton "Buscar guardia..." aparece por la condicion `isPPC` (linea 736)
- **Resultado:** Al asignar guardia en PPC, status cambia a "reemplazo" y se genera TE (mismo flujo backend)

### 5.5 Resetear Turno

- **Funcion:** Click "Resetear" -> confirmacion segun status TE -> `patchAsistencia(item.id, { attendanceStatus: initialStatus, actualGuardiaId: null, replacementGuardiaId: null })` (lineas 1022-1049)
- **Archivo:** `src/components/ops/OpsPautaDiariaClient.tsx:1022-1049` (frontend) + `src/app/api/ops/asistencia/[id]/route.ts:316-468` (backend)
- **`initialStatus`** = `plannedGuardiaId ? "pendiente" : "ppc"` (linea 637)
- **Campos que resetea:**
  - `attendanceStatus` -> "pendiente" o "ppc"
  - `actualGuardiaId` -> null
  - `replacementGuardiaId` -> null
  - `checkInAt` -> null (limpiado)
  - `checkOutAt` -> null (limpiado)
  - `teGenerated` -> false (linea 464 del route)
- **Elimina OpsTurnoExtra:** SI, con condiciones:
  - `status = "pending"` o `"approved"` -> se elimina (con confirmacion "Se eliminara el TE asociado")
  - `status = "paid"` -> solo con admin + confirmacion + motivo (lineas 1034-1040)
  - `status = "rejected"` -> no se toca
- **Protege TE pagado:** SI
  - Non-admin: `toast.error("TE pagado. Solicita override a un admin.")` (linea 1035)
  - Admin: `window.confirm()` + `window.prompt("Motivo:")` + `forceDeletePaidTe: true` + `forceDeleteReason` (lineas 1036-1039)
  - Backend: Verifica rol owner/admin + forceDeletePaidTe + forceDeleteReason (route lineas 284-313)
- **Limpieza adicional en backend:**
  - Soft-delete marcaciones manuales (metodoId="manual") — `deletedAt` set (lineas 323-340)
  - Elimina pending emails de notificacion (lineas 342-346)
- **Bug HHEE fantasma (H5) corregido:** SI — `teGenerated` se resetea a `false` en la transaccion (linea 464). El campo se gestiona correctamente en todos los flujos: se pone `true` al crear TE (linea 417), `false` al resetear/limpiar

---

## 6. PROBLEMAS DETECTADOS

### 6.1 Gaps entre Implementacion y Expectativa

| # | Problema | Severidad | Detalle |
|---|---------|-----------|---------|
| 1 | **`amountJustification` no se usa en flujo reemplazo** | Media | El campo existe en DB y en schema de TE manual, pero al asignar reemplazo desde asistencia diaria, NO se solicita justificacion del monto. Solo disponible en creacion manual de TE (`POST /api/te`). |
| 2 | **No hay preview del monto TE antes de asignar reemplazo** | Baja | El monto se muestra solo DESPUES de asignar el reemplazo. El supervisor no ve cuanto costara el TE antes de confirmar la asignacion. |
| 3 | **Filtro de guardias no verifica carga laboral** | Baja | `guardias-active-search` y el filtro local no verifican cuantos turnos/TE ya tiene el guardia ese dia. Solo el backend valida "no-doblar" con turnos superpuestos. |
| 4 | **Dropdown reemplazo duplicado** | Tecnica | El dropdown de busqueda de guardias esta implementado 2 veces: inline (mobile, lineas 756-812) y portal (desktop, lineas 1269-1340). Misma logica duplicada. |
| 5 | **No se pide justificacion al cambiar monto en aprobacion TE** | Media | Al aprobar un TE y cambiar el monto, no se captura `amountJustification` (gap del endpoint de aprobacion). |

### 6.2 Verificacion de Issues Conocidos

| Issue | Estado | Evidencia |
|-------|--------|-----------|
| **H5: HHEE fantasma al resetear** | CORREGIDO | `teGenerated` se resetea a `false` en transaccion (route linea 464). Se gestiona en todos los flujos. |
| **H8: TE pagado no debe eliminarse al resetear** | IMPLEMENTADO | Proteccion completa: non-admin bloqueado, admin requiere confirmacion + motivo. Backend valida en lineas 284-313. |
| **Fase 3: amountJustification** | PARCIALMENTE IMPLEMENTADO | Campo existe en DB y schema. Se usa en creacion manual de TE. NO se usa en flujo automatico de reemplazo ni en aprobacion. |

### 6.3 Observaciones de Codigo

| # | Observacion | Ubicacion |
|---|------------|-----------|
| 1 | Comentario defensivo: `"Eliminar TODOS los TEs activos vinculados (defensivo ante inconsistencias)"` | `route.ts:428` |
| 2 | No se encontraron TODOs ni FIXMEs en archivos de asistencia | — |
| 3 | Componente principal (1343 lineas) es monolitico — no tiene sub-componentes extraidos | `OpsPautaDiariaClient.tsx` |
| 4 | Guardias se cargan en server component y se pasan como props (no lazy-loaded) | `page.tsx:41-57` |

---

## 7. DEPENDENCIAS PARA REFACTORING

### 7.1 Pre-requisitos

1. **API estable:** Los endpoints GET/PATCH de asistencia no deben cambiar durante el refactoring de la vista. La interfaz `AsistenciaItem` es el contrato.

2. **Tipos compartidos:** El tipo `AsistenciaItem` (lineas 55-108) y `MarcacionItem` (lineas 39-53) estan definidos inline en el componente. Deben extraerse a un archivo de tipos compartido.

3. **Logica de negocio en el componente:**
   - Calculo de `initialStatus` (pendiente vs ppc)
   - Calculo de `hasChanges`
   - Calculo de `showReplacementSearch`
   - Calculo de `showAsistioNoAsistio`
   - Resolucion de TE prioritario (`TE_PRIORITY`)
   - Logica de reset con proteccion de TE pagado
   - Todos estos deben mantenerse intactos o extraerse a hooks.

4. **Flujo de contradiccion:** El dialog de contradiccion con marcacion electronica (409 -> modal -> retry con `confirmarContradiccion: true`) debe preservarse.

5. **Portal para dropdown desktop:** El portal de busqueda de guardias (createPortal al body) se necesita para evitar overflow en desktop. En mobile, el dropdown es inline.

6. **Permisos:**
   - `canManagePaidTeReset` = `userRole === "owner" || userRole === "admin"`
   - `canExecuteOps` = `hasOpsCapability(userRole, "ops_execution")`
   - Estos controlan que acciones se habilitan/deshabilitan.

7. **URL params:** El componente lee `date` y `guardiaId` de searchParams para deep-linking desde detalle de guardia.

### 7.2 Componentes UI Reutilizados

| Componente | Paquete | Uso |
|-----------|---------|-----|
| `Card`, `CardContent` | `@/components/ui/card` | KPIs, filtros, contenedor principal |
| `Button` | `@/components/ui/button` | Acciones, filtros, exportar |
| `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle` | `@/components/ui/dialog` | Modales (asistio, marcacion, contradiccion) |
| `Label` | `@/components/ui/label` | Labels de formulario |
| `SearchableSelect` | `@/components/ui/SearchableSelect` | Filtro cliente/instalacion |
| `Input` | `@/components/ui/input` | Busqueda de guardias, time inputs |
| `CollapsibleSection` | `@/components/crm/CollapsibleSection` | Agrupacion por instalacion |
| `EmptyState`, `LoadingSpinner` | `@/components/opai` | Estados vacios y carga |
| `PageHeader` | `@/components/opai` | Header de pagina |

### 7.3 Iconos (lucide-react)

`CalendarCheck2`, `Check`, `ChevronDown`, `ChevronLeft`, `ChevronRight`, `ChevronUp`, `Info`, `Loader2`, `RotateCcw`, `MapPin`, `Clock`, `X`

---

## FIN DEL REPORTE
