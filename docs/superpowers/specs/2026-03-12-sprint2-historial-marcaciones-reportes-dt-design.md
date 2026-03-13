# Sprint 2 — Historial de Marcaciones + Reportes DT Obligatorios
## Design Spec · 2026-03-12

**Alcance:** Partes A, B, C y D del Sprint 2. La Parte E (cierre de asistencia / PayrollAttendancePeriod) queda diferida como Sprint 2B.

---

## Contexto y prerequisitos

### Infraestructura existente relevante
- `OpsMarcacion`: modelo completo con todos los campos Res. N°38 (`isModified`, `modifiedAt`, `modifiedBy`, `modificationReason`, `gpsStatus`, `hashIntegridad`, `fotoEvidenciaUrl`, `atrasoMinutos`, `metodoId`, `tipo`). Campos `metodoId`: `"face_id" | "rut_pin" | "manual" | "import"`. Campo `tipo`: `"entrada" | "salida"`.
- `OpsAsistenciaDiaria`: `checkInAt`, `checkOutAt`, `workedMinutes`, `overtimeMinutes`, `attendanceStatus`, FK `marcacionEntradaId`, `marcacionSalidaId`.
- `OpsPautaMensual`: shiftCode `"T"=trabajo, "+"=descanso, "V"=vacaciones, "L"=licencia, "PSG"=permiso sin goce`, etc.
- `PayrollHoliday`: modelo de feriados ya existe con datos — no requiere seed nuevo.
- `@react-pdf/renderer` instalado — patrón de uso en `src/lib/control-nocturno-pdf.ts`.
- `exceljs` instalado — patrón de uso en pauta-mensual export.
- `src/lib/marcacion-email.ts`: `sendMarcacionComprobante` y `sendAvisoMarcaManual` ya implementados con Resend.
- `PATCH /api/ops/marcacion/[id]`: endpoint existente — setea `isModified=true`, `modifiedAt`, `modifiedBy`, `modificationReason`, crea `AuditLog` con `action: "ops.marcacion.modified"` y `details: { changes: { timestamp: { from, to } } }`. **No envía email ni genera token de oposición.**
- `GuardiaDetailClient`: ChipTabs con `TabKey` union type + `renderTabContent()`. Array `associatedSections` tiene placeholder `id: "marcaciones"`.
- `CrmInstallationDetailClient`: array `tabs` (tipo `EntityTab[]`, acepta string id), render condicional por `activeTab`. Array `associatedSections` tiene placeholder `id: "marcaciones-faceid"`.
- Vercel Cron pattern: `src/app/api/cron/rondas/generar/route.ts` (y variantes `cerrar-libres`, `cerrar-atrasadas`).
- Sistema de permisos: módulo/submodulo. `canView(perms, "module")` / `canView(perms, "module", "submodule")`. Roles reales: `admin` (superadmin), role templates con slugs: `rrhh`, `jefe_operaciones` (otros: `reclutamiento`, `finanzas`, etc.). No existe rol `gerencia` separado.

---

## Parte A: Historial en ficha del guardia

### Cambios en GuardiaDetailClient
1. Eliminar entrada `id: "marcaciones"` del array `associatedSections` (placeholder "próximamente").
2. Agregar `"marcaciones"` a `TabKey` union type.
3. Agregar `{ key: "marcaciones", label: "Marcaciones", icon: Clock }` al array `TABS`. **Nota:** importar `Clock` de `lucide-react` (no está en el import actual).
4. En `renderTabContent()`: `case "marcaciones": return <GuardiaMarcacionesTab guardiaId={guardia.id} />`.

El tab carga su propia data vía fetch (no serializada desde el server page — demasiado pesada y paginada server-side).

### Componente GuardiaMarcacionesTab

**Estado local:**
```typescript
year: number           // default: año actual
month: number          // default: mes actual
selectedDay: number | null
filters: { metodo?: string, soloFueraRango: boolean, soloModificadas: boolean }
```

**Layout:**
```
┌─ Navegación mes: [ ◄ ] [ Marzo 2026 ] [ ► ]  Filtros: [método▼] [GPS⚠] [Mod⚠] ─┐
│                                                                                    │
│  LU  MA  MI  JU  VI  SA  DO                                                        │
│  ─   ─   ─   ─   ─   1   2                                                        │
│  ✅  ✅  ❌  ⚪  ✅  ✅  ⚪                                                        │
│  ...                                                                               │
│                                                                                    │
│  [ Panel derecho al hacer click en día: detalle completo ]                         │
│                                                                                    │
└─ Estadísticas: X días trabajados · Xh totales · X atrasos · X fuera rango ───────┘
```

**Leyenda de estados de celda:**
- ✅ Verde: entrada + salida registradas
- 🟡 Amarillo: solo entrada (sin salida)
- ❌ Rojo: programado pero no marcó
- ⚪ Gris: no programado ese día
- ⚠️ Naranja: marcó fuera de rango GPS

**Construcción del grid:** usando `date-fns` (`startOfMonth`, `getDay`, `getDaysInMonth`). Grid de 7 columnas CSS, sin dependencia de librería de calendario.

**Panel de detalle del día:**
- Hora entrada + hora salida (timestamps exactos, zona America/Santiago)
- Método: Face ID / PIN / Manual / Import (mapeado desde `metodoId`)
- GPS: coordenadas, distancia, badge dentro/fuera rango, link Google Maps
- Foto de marcación (`fotoEvidenciaUrl`, si Face ID)
- Instalación donde marcó
- Hash de integridad (colapsado)
- Si `isModified=true`: `<MarcacionModificadaBadge />` con tooltip completo
- Link a la `OpsAsistenciaDiaria` correspondiente

### API: GET /api/ops/guardias/[id]/marcaciones

```typescript
// Query params
desde: string        // YYYY-MM-DD (default: primer día del mes actual)
hasta: string        // YYYY-MM-DD (default: último día del mes actual)
metodo?: string      // filtra por metodoId: "face_id" | "rut_pin" | "manual" | "import"
soloFueraRango?: "true"
soloModificadas?: "true"
page?: number        // default: 1
limit?: number       // default: 50, max: 200

// Response
{
  marcaciones: OpsMarcacion[],   // include: { guardia: { persona: true } }
  stats: {
    diasTrabajados: number,      // días distintos con al menos una marcación
    horasTotales: number,        // suma (salida.timestamp - entrada.timestamp) en horas; pares emparejados
    promedioHorasDiarias: number | null,  // horasTotales / diasTrabajados; null si diasTrabajados === 0
    horasExtra: number,          // sum(OpsAsistenciaDiaria.overtimeMinutes) / 60 — requiere JOIN a OpsAsistenciaDiaria via marcacionEntradaId; 0 si no hay registros
    atrasos: number,             // count(marcaciones WHERE tipo="entrada" AND atrasoMinutos > 0)
    fueraDeRangoGPS: number,     // count(marcaciones WHERE gpsStatus="fuera_rango")
    marcacionesModificadas: number,
  },
  total: number,
  pages: number,
}
```

**Nota sobre `horasExtra`:** Se obtiene haciendo JOIN a `OpsAsistenciaDiaria` via `marcacionEntradaId IN (ids de las marcaciones del período)`. Si no hay registros de asistencia asociados, retorna 0.

**`salidasAnticipadas` NO se incluye en stats** — no existe campo de salida anticipada en el schema. Queda para Sprint 3 si se agrega `earlyDepartureMinutes` a `OpsAsistenciaDiaria`.

**Paginación server-side** — soporta hasta 5 años de datos (requisito Res. N°38).

---

## Parte B: Historial en instalación

### Cambios en CrmInstallationDetailClient
1. Eliminar entrada `id: "marcaciones-faceid"` del array `associatedSections`.
2. Agregar `{ id: "marcaciones", label: "Marcaciones", icon: Clock }` al array `tabs`. Posición: después de "rondas", antes de "activity". **Nota:** importar `Clock` de `lucide-react`.
3. Agregar al render condicional: `{activeTab === "marcaciones" && <InstalacionMarcacionesTab installationId={installation.id} />}`. El tipo de `activeTab` es string — acepta cualquier id string, no hay restricción de union type.

### Componente InstalacionMarcacionesTab

**Layout:**
```
[ Selector de fecha (default: hoy) ]  [ Búsqueda nombre/RUT ]

Tabla:
┌─ Guardia ──── RUT ──────── Entrada ─── Salida ─── Horas ─ Método ─ GPS ─ Estado ─┐
│  Juan Pérez   12.345.678-9  08:02      16:05       7.8h    FaceID   ✅   Completa  │
│  Ana López    9.876.543-2   08:15      —           —       PIN      ✅   Solo ent. │
│  Pedro Soto   11.222.333-4  —          —           —       —        —    No marcó  │
└─────────────────────────────────────────────────────────────────────────────────────┘

Resumen footer: 18/20 guardias marcaron · Cobertura 90% · 2 sin marcación · 1 solo entrada
```

**Badge de estado por fila:**
- ✅ Completa: entrada + salida
- 🟡 Solo entrada: sin salida
- ❌ No marcó: programado, sin marcación
- ⚠️ Fuera de rango: marcó pero `gpsStatus = "fuera_rango"`

Si alguna marcación tiene `isModified=true` → mostrar `<MarcacionModificadaBadge />` inline.

### API: GET /api/ops/instalaciones/[id]/marcaciones

```typescript
// Query params
fecha: string        // YYYY-MM-DD (default: hoy)
page?: number
limit?: number       // default: 100

// Response
{
  guardias: Array<{
    guardiaId: string,
    nombre: string,
    rut: string,
    entrada: OpsMarcacion | null,
    salida: OpsMarcacion | null,
    horasTrabajadas: number | null,  // (salida.timestamp - entrada.timestamp) en horas; null si falta alguna
    estaModificada: boolean,         // true si entrada.isModified || salida.isModified
    gpsStatus: "dentro_rango" | "fuera_rango" | "sin_gps" | null,
    estado: "completa" | "solo_entrada" | "no_marco" | "fuera_rango",
  }>,
  resumen: {
    programados: number,
    marcaron: number,
    coberturaPct: number,
    soloEntrada: number,
    noMarcaron: number,
  },
  total: number,
  pages: number,
}
```

---

## Parte C: Reportes DT — Resolución N°38

### Nuevo módulo de permisos: `reportes_dt`

Se requieren los siguientes cambios en `src/lib/permissions.ts` (el módulo usa un sistema cerrado de types que deben actualizarse en conjunto):

1. **`MODULE_KEYS`** array: agregar `"reportes_dt"`
2. **`SUBMODULE_KEYS`** map: agregar `reportes_dt: []` (sin submodulos por ahora)
3. **`MODULE_META`** (o equivalente de labels): agregar `{ key: "reportes_dt", label: "Reportes DT" }`
4. **`DEFAULT_ROLE_PERMISSIONS`** — en las entradas de los role templates:
   - `jefe_operaciones`: agregar `reportes_dt: { view: true }`
   - `rrhh`: agregar `reportes_dt: { view: true }`
   - `admin` ya tiene acceso total (no requiere cambio)
5. **`pathToPermission`**: agregar entradas para las rutas de página:
   - `if (pathname.startsWith("/reportes/dt")) return { module: "reportes_dt" }`
6. **`apiPathToSubmodule`**: agregar entradas para las rutas de API:
   - `if (pathname.startsWith("/api/reportes/dt")) return { module: "reportes_dt" }`

Con estos cambios, `canView(perms, "reportes_dt")` compilará correctamente en TypeScript.

En Sprint 3 se crea role template `inspector_dt` con acceso solo a `reportes_dt`.

### Estructura de rutas

```
src/app/(app)/reportes/
  dt/
    layout.tsx          ← nav lateral: 4 reportes + header "Reportes DT · Res. N°38"
    asistencia-diaria/page.tsx
    jornada-diaria/page.tsx
    domingos-festivos/page.tsx
    modificaciones-turnos/page.tsx

src/app/api/reportes/dt/
  asistencia-diaria/
    route.ts                    ← GET datos
    export-pdf/route.ts
    export-excel/route.ts
  jornada-diaria/
    route.ts
    export-pdf/route.ts
    export-excel/route.ts
  domingos-festivos/
    route.ts
    export-pdf/route.ts
    export-excel/route.ts
  modificaciones-turnos/
    route.ts
    export-pdf/route.ts
    export-excel/route.ts
```

Cada page.tsx hace `canView(perms, "reportes_dt")` — redirige a `/hub` si no tiene acceso.

### Navegación principal

Nueva entrada "Reportes DT" en el menú principal (mismo nivel que Ops, Finanzas, Personas). Visible si `canView(perms, "reportes_dt")`.

### Patrón común de cada página

```
┌─ Header: "Reporte [Nombre]" · Descripción legal ──────────────────────────────────┐
│                                                                                     │
│  Filtros: [ Instalación▼ ] [ Desde ] [ Hasta ] [ Guardia▼ ] [ Buscar ]             │
│                                                                                     │
│  ┌── Tabla preview con scroll ────────────────────────────────────────────────┐    │
│  │  [datos del reporte]                                                        │    │
│  └────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                     │
└─ Footer sticky: [ Exportar PDF ] [ Exportar Excel ]  · Total: N registros ────────┘
```

### C.1 Reporte Asistencia Diaria

**Columnas:** Nombre · RUT · Fecha · Estado (Asistió/No asistió/Justificado/Injustificado) · Hora entrada · Hora salida · Observaciones · Mod.*

**Fuente:** `OpsAsistenciaDiaria` JOIN `OpsMarcacion` (via `marcacionEntradaId`/`marcacionSalidaId`) JOIN `OpsGuardia` JOIN `Persona`

**Nota al pie PDF:** `* Marcación modificada por administrador — ver detalle en historial del guardia`

### C.2 Reporte Jornada Diaria

**Columnas:** Nombre · RUT · Fecha · Entrada pactada · Salida pactada · Entrada real · Salida real · Colación pactada · Atraso (min) · HE 50% (h) · HE 100% (h) · Total horas día · **Total semanal acumulado**

**Cálculo de HE:**
- Fuente: `OpsAsistenciaDiaria.overtimeMinutes` (campo existente)
- HE 50%: días laborables (L-S) → `overtimeMinutes / 60`
- HE 100%: domingos y festivos (verificar contra `PayrollHoliday`) → `overtimeMinutes / 60`
- Determinación: en la API, para cada fila verificar si `date` es domingo (`getDay(date) === 0` con date-fns) o existe en `PayrollHoliday` — en ese caso el overtime es al 100%.

**Salida anticipada:** no calculable con el schema actual (`earlyDepartureMinutes` no existe). **Columna omitida** en Sprint 2.

**Agrupación semanal:** filas normales + fila de subtotal (lunes–domingo) con fondo diferenciado.

**Fuente:** `OpsAsistenciaDiaria` + `OpsPautaMensual` JOIN `OpsPuestoOperativo` (para horas pactadas) + `OpsMarcacion` (para horas reales vía `checkInAt`/`checkOutAt`)

**Nota:** `OpsPautaMensual` solo tiene `shiftCode` y FK a `OpsPuestoOperativo`. Para obtener las horas pactadas se necesita hacer `include: { puesto: { select: { shiftStart: true, shiftEnd: true } } }` en la query de `OpsPautaMensual`. `shiftStart` y `shiftEnd` son campos `String` en `OpsPuestoOperativo` (formato "HH:MM") — parsear con `date-fns parse` para calcular la duración planificada del turno.

### C.3 Reporte Domingos y Festivos

**Columnas:** Nombre · RUT · Fecha · Tipo día (Domingo / Festivo: [nombre]) · Horas trabajadas · Tipo compensación

**Filtro default:** últimos 12 meses (requisito explícito Res. N°38)

**Identificación de domingos:** en TypeScript con date-fns → `getDay(date) === 0`. No usar raw SQL `EXTRACT(DOW)` para mantener consistencia.

**Identificación de festivos:** JOIN con `PayrollHoliday WHERE date IN (fechas del rango)`.

**Fuente:** `OpsAsistenciaDiaria WHERE attendanceStatus IN ("asistio", "reemplazo") AND (isDomingo OR isFestivo)` + JOIN `PayrollHoliday`

### C.4 Reporte Modificaciones de Turnos

**Columnas:** Fecha cambio · Guardia · RUT · Acción · Detalle (turno anterior → nuevo, o hora original → nueva) · Quién lo hizo · Motivo

**Fuente:** `AuditLog WHERE action LIKE 'ops.pauta.%' OR action = 'ops.marcacion.modified'` filtrado por `tenantId` y rango de fechas. Los datos de guardia y RUT se recuperan desde `entityId` + JOIN si necesario.

---

## Parte D: Indicadores visuales + Flujo de modificación completo

### D.1 Migración de schema

Un único migration file agrega a `OpsMarcacion`:

```prisma
oppositionToken    String?   @unique @map("opposition_token")
opposedAt          DateTime? @map("opposed_at")        @db.Timestamptz(6)
opposedBy          String?   @map("opposed_by")         // RUT normalizado del guardia
oppositionReason   String?   @map("opposition_reason")
consolidatedAt     DateTime? @map("consolidated_at")   @db.Timestamptz(6)
```

**Tabla de estados para marcaciones modificadas:**

| `isModified` | `opposedAt` | `consolidatedAt` | Estado visible |
|---|---|---|---|
| true | null | null | Pendiente oposición |
| true | not null | null | Opuesta (marca restaurada a original) |
| true | null | not null | Consolidada (sin oposición tras 48h) |
| false | — | — | Normal |

**Nota:** cuando hay oposición exitosa, `isModified` vuelve a `false` y `timestamp` se restaura. Los campos `modifiedAt`/`modifiedBy`/`modificationReason` permanecen como registro auditable (no se borran).

### D.2 Componente MarcacionModificadaBadge

```typescript
// src/components/ops/MarcacionModificadaBadge.tsx
interface Props {
  marcacion: {
    isModified: boolean
    modifiedAt: string | null
    modifiedBy: string | null       // userId
    modificationReason: string | null
    consolidatedAt: string | null
    opposedAt: string | null
  }
  modifiedByName?: string           // nombre del admin (resolver en el componente padre)
}
```

**Visual:**
- `isModified && !consolidatedAt && !opposedAt` → badge naranja "Modificada" + ícono lápiz
- `consolidatedAt` → badge gris "Consolidada"
- `opposedAt` → badge rojo "Opuesta"
- Tooltip: motivo · quién modificó · cuándo

**Uso:** importar en `GuardiaMarcacionesTab`, `InstalacionMarcacionesTab`, `OpsMarcacionesClient`, columnas PDF.

### D.3 Mejoras al PATCH /api/ops/marcacion/[id]

El handler existente se modifica para:
1. Generar `oppositionToken = crypto.randomUUID()`
2. **Idempotencia:** si la marcación ya tiene `isModified=true` y `opposedAt IS NULL` y `consolidatedAt IS NULL` (oposición pendiente), generar un token nuevo e invalidar el anterior. Enviar nuevo email con nuevo link. Documentar esto en la respuesta del endpoint.
3. Incluir `oppositionToken` en el `UPDATE` de Prisma.
4. Cargar `guardia.persona` (nombre, RUT, `personalEmail`) después del update.
5. **Si `personalEmail` existe:** llamar `sendAvisoModificacionMarcacion(...)` (fire-and-forget).
6. **Si `personalEmail` es null:** no enviar email. Incluir en la respuesta `{ ..., warnings: ["guardia_sin_email"] }` para que la UI muestre: "Este guardia no tiene email personal registrado — no recibirá notificación. Deberá notificarse por otro medio."

**Nota de implementación:** `personalEmail` está en `OpsGuardia`, **no** en `OpsPersona`. El include correcto es `{ guardia: { include: { persona: true } } }` y los campos se leen como:
- `marcacion.guardia.persona.firstName/lastName/rut` → nombre y RUT
- `marcacion.guardia.personalEmail` → email (campo directo en OpsGuardia)

### D.4 Nuevo email: sendAvisoModificacionMarcacion

Nueva función en `src/lib/marcacion-email.ts`:

```typescript
interface AvisoModificacion {
  guardiaName: string
  guardiaEmail: string
  guardiaRut: string
  installationName: string
  tipo: "entrada" | "salida"
  timestampOriginal: Date       // hora pre-modificación
  timestampNuevo: Date          // hora post-modificación
  motivo: string
  registradoPor: string         // nombre del admin
  oppositionUrl: string         // https://[dominio]/marcacion/oposicion/[token]
}
```

Email HTML incluye:
- Tabla: hora original → hora nueva
- Motivo del administrador
- Botón prominente "Oponerme a esta modificación" → `oppositionUrl`
- Aviso de plazo: "Tienes 48 horas para oponerte"
- Cláusula legal Res. N°38

### D.5 Endpoints de oposición (públicos — sin sesión)

**GET /api/marcacion/oposicion/[token]**
- Busca `OpsMarcacion WHERE oppositionToken = token`
- Valida: token existe + `modifiedAt > now - 48h` + `opposedAt IS NULL` + `consolidatedAt IS NULL`
- **Datos retornados (mínimos — solo lo necesario para mostrar el formulario):**
  - `guardiaName`, `tipo`, `installationName`, `timestampOriginal` (desde AuditLog), `timestampNuevo` (timestamp actual de la marcación), `motivo`
  - No retorna RUT completo, ni datos sensibles adicionales
- Errores descriptivos: `token_invalid`, `token_expired`, `already_opposed`, `already_consolidated`
- **Amenaza:** el token es globalmente único; sin sesión, cualquiera con el link puede ver datos mínimos de la marcación. Esto es aceptable dado el diseño (el link se envía al guardia por email) y que los datos expuestos son limitados.

**POST /api/marcacion/oposicion/[token]**
- Body: `{ rut: string, motivo: string }`
- Normaliza RUT (quitar puntos y guión)
- Verifica `normalizeRut(rut) === normalizeRut(marcacion.guardia.persona.rut)`
- **Recupera `timestampOriginal` desde AuditLog:**
  - `AuditLog WHERE action = "ops.marcacion.modified" AND entityId = marcacionId ORDER BY createdAt DESC LIMIT 1`
  - `details.changes?.timestamp?.from`
  - **Fallback:** si `details.changes?.timestamp?.from` es null/undefined (modificación sin cambio de timestamp, p.ej. solo `notes`), no hay timestamp original que restaurar. En este caso: setear `opposedAt = now()`, `opposedBy = rut`, `oppositionReason = motivo`, pero NO modificar `timestamp` ni `isModified`. Retornar `{ success: true, restored: false }` con mensaje "Tu oposición fue registrada. No había cambio de hora que restaurar."
  - **Fallback extremo:** si el AuditLog entry no existe (write falló silenciosamente), tratar igual que el fallback anterior.
- Si hay timestamp original: restaurar `timestamp = timestampOriginal`, setear `isModified = false`, `opposedAt = now()`, etc.
- Enviar email al admin que modificó (via `modifiedBy` userId → buscar email del Admin)
- Crear entrada en AuditLog: `ops.marcacion.opposed`

### D.6 Página pública de oposición

**Ruta:** `src/app/marcacion/oposicion/[token]/page.tsx`

Sin route group `(public)` — rutas no autenticadas viven directamente bajo `src/app/` (patrón existente: `/marcar`, `/portal`, `/postulacion`).

**Cambios requeridos en el middleware de autenticación** (agregar estas rutas a la lista de paths públicos):
```typescript
// src/middleware.ts — en la función isPublicPath o equivalente:
if (pathname.startsWith('/marcacion/')) return true;          // página pública de oposición
if (pathname.startsWith('/api/marcacion/oposicion/')) return true;  // API pública de oposición
```
Sin estos cambios, el middleware redirigirá al guardia (sin sesión) a `/opai/login`.

**Página client-side** (`"use client"`):
1. En `useEffect`: GET `/api/marcacion/oposicion/[token]`
2. Renderiza según estado:
   - **Cargando**: spinner
   - **Válido**: datos de la marcación + campo "Motivo de oposición" (textarea requerido) + botón "Oponerme"
   - **Expirado** (`token_expired`): "El plazo de 48 horas para oponerse ha vencido."
   - **Ya opuesta** (`already_opposed`): "Ya registraste tu oposición."
   - **Ya consolidada** (`already_consolidated`): "Esta marcación fue consolidada automáticamente."
   - **Token inválido** (`token_invalid`): "Link inválido o expirado."
   - **Éxito** (POST exitoso): mensaje según `restored: true/false`

### D.7 Cron de consolidación automática

**Ruta:** `src/app/api/cron/consolidar-marcaciones/route.ts`

Patrón idéntico a `src/app/api/cron/rondas/generar/route.ts`:
- Autenticación: header `Authorization: Bearer $CRON_SECRET`
- Método: `GET`

```typescript
// Lógica:
// 1. prisma.opsMarcacion.updateMany({
//      where: {
//        isModified: true,
//        consolidatedAt: null,
//        opposedAt: null,
//        modifiedAt: { lt: subHours(new Date(), 48) },  // date-fns subHours
//      },
//      data: { consolidatedAt: new Date() }
//    })
// 2. Retorna: { success: true, consolidated: result.count }
```

**vercel.json** — agregar al array `crons`:
```json
{ "path": "/api/cron/consolidar-marcaciones", "schedule": "0 * * * *" }
```

---

## Sprint 2B (diferido): Parte E — Cierre de asistencia previo a payroll

Scope mínimo viable:

1. **Modelo `PayrollAttendancePeriod`**: `tenantId`, `year`, `month`, `status` (`"open"` | `"closed"`), `lockedAt`, `lockedBy`, `summary` (JSON: guardias completos/parciales/sin marcación/discrepancias)
2. **API `POST /api/payroll/attendance-period/close`**: calcula summary + setea `status="closed"`, `lockedAt=now()`, `lockedBy=userId`
3. **UI en módulo payroll**: página con resumen del período + botón "Cerrar período de asistencia" (sin wizard, sin multi-step)
4. **Validación**: en el procesamiento de payroll, verificar `PayrollAttendancePeriod.status === "closed"` para el período

---

## Decisiones de diseño tomadas

| Decisión | Elección | Razón |
|---|---|---|
| Token de oposición | Campo `oppositionToken` en `OpsMarcacion` | Simple, sin tabla extra, auditable |
| Calendario Parte A | Grid mensual custom con date-fns | Sin dependencia nueva, suficiente con Tailwind |
| Arquitectura reportes | 4 páginas independientes + endpoints export separados | Consistente con patrón del proyecto, permite preview online |
| Exportación | @react-pdf/renderer (PDF) + exceljs (Excel) | Ya instalados, patrón existente |
| Cron consolidación | Vercel Cron (hourly) | Mismo patrón que crons de rondas |
| Acceso reportes DT | Nuevo módulo `reportes_dt` en sistema de permisos | Independiente de ops, extensible para `inspector_dt` en Sprint 3 |
| Ruta oposición pública | `src/app/marcacion/oposicion/[token]/` (sin route group) | Patrón existente para rutas no autenticadas |
| HE 50% vs 100% | Determinado por día: domingo/festivo=100%, resto=50% | PayrollHoliday ya tiene datos; cálculo en API layer con date-fns |
| `salidasAnticipadas` | Omitido en Sprint 2 | Campo no existe en schema; requiere Sprint separado |
| `promedioHorasDiarias` | `null` cuando `diasTrabajados === 0` | Evitar división por cero |

---

## Checklist de validación

- [ ] Tab "Marcaciones" en ficha guardia: calendario mensual + panel detalle del día + estadísticas del período
- [ ] Tab "Marcaciones" en ficha instalación: tabla diaria + resumen de cobertura
- [ ] Placeholder "próximamente" eliminado de `AssociatedRecordsPanel` en ambos componentes
- [ ] Ambos historiales paginan correctamente (server-side, hasta 5 años)
- [ ] Filtro `metodo` (no `tipo`) en API guardias/marcaciones
- [ ] `promedioHorasDiarias` retorna `null` cuando no hay días trabajados
- [ ] Reporte Asistencia Diaria: PDF + Excel con columna Mod.*
- [ ] Reporte Jornada Diaria: HE 50%/100% calculado + totales semanales + salida anticipada omitida
- [ ] Reporte Domingos y Festivos: usa PayrollHoliday + date-fns, cubre 12 meses retroactivos
- [ ] Reporte Modificaciones de Turnos: desde AuditLog (ops.pauta.* + ops.marcacion.modified)
- [ ] `MarcacionModificadaBadge` visible en GuardiaMarcacionesTab, InstalacionMarcacionesTab, OpsMarcacionesClient, PDF
- [ ] PATCH /api/ops/marcacion/[id]: genera `oppositionToken`, envía email si `personalEmail` existe, retorna warning si no existe
- [ ] PATCH idempotente: re-modificar marcación con oposición pendiente genera nuevo token e invalida el anterior
- [ ] Página `/marcacion/oposicion/[token]` funciona sin sesión (verificar middleware)
- [ ] Oposición: restaura timestamp si existe en AuditLog; fallback si no hay timestamp que restaurar
- [ ] Consolidación automática corre cada hora vía Vercel Cron
- [ ] Módulo `reportes_dt` agregado al sistema de permisos
- [ ] Role templates `jefe_operaciones` y `rrhh` tienen acceso a `reportes_dt`
- [ ] Navegación principal incluye entrada "Reportes DT" visible para roles autorizados
- [ ] `Clock` de lucide-react importado en GuardiaDetailClient y CrmInstallationDetailClient
