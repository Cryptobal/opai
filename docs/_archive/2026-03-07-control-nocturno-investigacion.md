# Control Nocturno: Investigacion Exhaustiva del Modulo

**Fecha:** 2026-03-07
**Proposito:** Investigacion end-to-end del modulo de Control Nocturno para planificar su unificacion con Rondas/Monitor.

---

## 1. Estructura de Archivos

### Pages

- `src/app/(app)/ops/control-nocturno/page.tsx` — Lista de reportes
- `src/app/(app)/ops/control-nocturno/[id]/page.tsx` — Detalle/edicion de reporte
- `src/app/(app)/ops/control-nocturno/kpis/page.tsx` — Dashboard de KPIs

### API Routes

- `src/app/api/ops/control-nocturno/route.ts` — GET (lista) + POST (crear)
- `src/app/api/ops/control-nocturno/[id]/route.ts` — GET (detalle) + PATCH (actualizar) + DELETE
- `src/app/api/ops/control-nocturno/[id]/export-pdf/route.ts` — GET (descargar PDF)
- `src/app/api/ops/control-nocturno/[id]/test-email/route.ts` — POST (enviar email de prueba)
- `src/app/api/ops/control-nocturno/kpis/route.ts` — GET (datos KPI)
- `src/app/api/portal/cliente/posta/route.ts` — GET (vista portal cliente)

### Components

- `src/components/ops/OpsControlNocturnoListClient.tsx` — Lista de reportes (~1474 lineas)
- `src/components/ops/OpsControlNocturnoDetailClient.tsx` — Detalle/editor principal (~1474 lineas)
- `src/components/ops/ControlNocturnoKpisClient.tsx` — Dashboard KPI client
- `src/components/ops/ControlNocturnoKpisCharts.tsx` — Graficos KPI
- `src/components/ops/GuardiaSearchInput.tsx` — Autocompletado de guardias

### Libraries

- `src/lib/control-nocturno-email.ts` — Envio email (Resend)
- `src/lib/control-nocturno-pdf.ts` — Generacion PDF (Playwright)
- `src/lib/control-nocturno-kpis.ts` — Calculo KPIs
- `src/lib/control-nocturno-ai.ts` — Resumen IA (GPT-4o-mini)

---

## 2. Schema de Base de Datos (4 modelos)

### OpsControlNocturno (reporte principal)

```prisma
model OpsControlNocturno {
  id                  String    @id @db.Uuid
  tenantId            String    @map("tenant_id")
  date                DateTime  @db.Date
  centralOperatorName String    @map("central_operator_name")
  centralLabel        String?   @map("central_label")   // "Central II-36"
  shiftStart          String    @default("19:00")        // configurable
  shiftEnd            String    @default("08:00")        // configurable
  status              String    @default("borrador")
    // "borrador" | "enviado" | "aprobado" | "rechazado"
  generalNotes        String?   @map("general_notes")
  submittedAt         DateTime?
  submittedBy         String?
  approvedAt          DateTime?
  approvedBy          String?
  rejectedAt          DateTime?
  rejectedBy          String?
  rejectionReason     String?

  instalaciones OpsControlNocturnoInstalacion[]

  @@unique([tenantId, date, centralLabel])
  @@map("control_nocturno") @@schema("ops")
}
```

### OpsControlNocturnoInstalacion (fila por instalacion)

```prisma
model OpsControlNocturnoInstalacion {
  id                  String   @id @db.Uuid
  controlNocturnoId   String   @db.Uuid
  installationId      String?  @db.Uuid
  installationName    String
  orderIndex          Int      @default(0)
  guardiasRequeridos  Int      @default(1)
  guardiasPresentes   Int      @default(0)         // MANUAL entry
  horaLlegadaTurnoDia String?                       // hora llegada guardia dia
  guardiaDiaNombres   String?                       // JSON: [{nombre, hora, isExtra}]
  statusInstalacion   String   @default("normal")
    // "normal" | "novedad" | "critico" | "no_aplica"
  notes               String?

  controlNocturno OpsControlNocturno
  installation    CrmInstallation?
  guardias        OpsControlNocturnoGuardia[]
  rondas          OpsControlNocturnoRonda[]

  @@map("control_nocturno_instalaciones") @@schema("ops")
}
```

### OpsControlNocturnoGuardia (guardia nocturno asignado)

```prisma
model OpsControlNocturnoGuardia {
  id                   String   @id @db.Uuid
  controlInstalacionId String   @db.Uuid
  guardiaId            String?  @db.Uuid           // link a OpsGuardia (opcional)
  guardiaNombre        String                       // nombre display (requerido)
  isExtra              Boolean  @default(false)     // guardia extra/reemplazo
  horaLlegada          String?                      // hora de llegada
  fotoEvidenciaUrl     String?                      // foto evidencia

  controlInstalacion OpsControlNocturnoInstalacion
  guardia            OpsGuardia?

  @@map("control_nocturno_guardias") @@schema("ops")
}
```

### OpsControlNocturnoRonda (marcacion horaria R1-R12)

```prisma
model OpsControlNocturnoRonda {
  id                   String   @id @db.Uuid
  controlInstalacionId String   @db.Uuid
  rondaNumber          Int      @map("ronda_number")  // 1-12
  horaEsperada         String   @map("hora_esperada")  // "20:00", "21:00"...
  horaMarcada          String?  @map("hora_marcada")   // hora real marcada
  status               String   @default("pendiente")
    // "pendiente" | "completada" | "omitida" | "no_aplica"
  ejecucionRondaId     String?  @db.Uuid              // FK opcional a OpsRondaEjecucion
  notes                String?

  controlInstalacion OpsControlNocturnoInstalacion
  ejecucionRonda     OpsRondaEjecucion?  @relation("ControlNocturnoRonda")

  @@unique([controlInstalacionId, rondaNumber])
  @@map("control_nocturno_rondas") @@schema("ops")
}
```

### Diagrama de relaciones

```
OpsControlNocturno (reporte)
    │
    └── OpsControlNocturnoInstalacion[] (filas)
            │
            ├── OpsControlNocturnoGuardia[] (guardias noche)
            │       └── OpsGuardia? (opcional link)
            │
            └── OpsControlNocturnoRonda[] (R1-R12)
                    └── OpsRondaEjecucion? (link opcional a Rondas 2.0)
```

---

## 3. Flujo de Creacion

### POST `/api/ops/control-nocturno`

**Input:**
```json
{
  "date": "2026-03-07",
  "centralOperatorName": "Juan Perez",
  "centralLabel": "Central II-36",
  "shiftStart": "19:00",
  "shiftEnd": "08:00",
  "installationIds": [] // opcional, si vacio carga todas las nocturnoEnabled
}
```

**Proceso:**
1. Fetch instalaciones activas con `nocturnoEnabled: true`
2. Crea `OpsControlNocturno` con `status: "borrador"`
3. Por cada instalacion, crea `OpsControlNocturnoInstalacion` con:
   - `guardiasRequeridos: 1`, `guardiasPresentes: 0`
   - `statusInstalacion: "normal"`
4. Por cada instalacion, crea **12 rondas** (R1-R12):
   ```
   RONDA_HOURS = ["20:00", "21:00", "22:00", "23:00",
                  "00:00", "01:00", "02:00", "03:00",
                  "04:00", "05:00", "06:00", "07:00"]
   ```
   Cada una con `status: "pendiente"`

**Resultado:** Reporte completo con grid de 12 horas x N instalaciones.

---

## 4. Flujo de Edicion (Draft)

### PATCH `/api/ops/control-nocturno/[id]` (action: "save")

**Auto-save cada 5 segundos** cuando hay cambios en draft.

**Payload:**
```json
{
  "action": "save",
  "generalNotes": "...",
  "centralOperatorName": "...",
  "centralLabel": "...",
  "instalaciones": [
    {
      "id": "uuid",
      "guardiasRequeridos": 2,
      "guardiasPresentes": 2,
      "statusInstalacion": "normal",
      "notes": "...",
      "guardias": [
        {
          "id": "uuid-existente",
          "guardiaNombre": "Carlos Lopez",
          "isExtra": false,
          "horaLlegada": "19:15"
        },
        {
          "guardiaNombre": "Pedro Extra",
          "isExtra": true,
          "horaLlegada": "20:00"
        }
      ],
      "rondas": [
        {
          "id": "uuid-ronda",
          "horaMarcada": "20:05",
          "status": "completada",
          "notes": null
        },
        {
          "id": "uuid-ronda2",
          "horaMarcada": null,
          "status": "omitida",
          "notes": "Guardia no contesta llamada"
        }
      ]
    }
  ]
}
```

**Logica:**
- Update campos principales del reporte
- Por cada instalacion: upsert guardias (create nuevos, update existentes, delete removidos)
- Por cada ronda: update `horaMarcada`, `status`, `notes`

---

## 5. Grid Horario (R1-R12)

### Horas (HARDCODEADAS):
| R# | Hora Esperada |
|----|---------------|
| R1 | 20:00 |
| R2 | 21:00 |
| R3 | 22:00 |
| R4 | 23:00 |
| R5 | 00:00 |
| R6 | 01:00 |
| R7 | 02:00 |
| R8 | 03:00 |
| R9 | 04:00 |
| R10 | 05:00 |
| R11 | 06:00 |
| R12 | 07:00 |

### Colores de celdas:

```typescript
const RONDA_STATUS_COLORS = {
  pendiente:  "bg-zinc-800 text-zinc-400 border-zinc-700",            // GRIS oscuro
  completada: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40", // VERDE
  omitida:    "bg-red-500/20 text-red-400 border-red-500/40",         // ROJO
  no_aplica:  "bg-zinc-500/15 text-zinc-500 border-zinc-600",         // GRIS claro
};
```

### Colores de instalacion:

```typescript
const INST_STATUS_COLORS = {
  normal:    "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",  // VERDE
  novedad:   "bg-amber-500/15 text-amber-400 border-amber-500/30",       // NARANJA
  critico:   "bg-red-500/15 text-red-400 border-red-500/30",             // ROJO
  no_aplica: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",          // GRIS
};
```

### Interactividad:
- **Celdas clickeables** → abre modal
- **Modal permite:**
  - Cambiar status (pendiente → completada → omitida → no_aplica)
  - Ingresar hora marcada real (si completada)
  - Agregar notas (motivo omision, observaciones)
- **Indicador visual:** icono de comentario azul si tiene notas

### Grid layout:
- Mobile: 4 columnas
- Tablet+: 6 columnas
- CSS: `grid grid-cols-4 sm:grid-cols-6 gap-1.5`

---

## 6. Sistema de Guardias

### Guardia Nocturno (asignacion manual):
- Lista editable con `GuardiaSearchInput` (autocompletado desde DB)
- Campos: nombre, hora llegada, flag isExtra
- Boton agregar/eliminar guardias
- Badge naranja para guardias EXTRA

### Guardia Dia (relevo manana):
- Modal "Relevos de manana" permite asignar guardias del turno siguiente
- Almacenado como JSON en `guardiaDiaNombres`: `[{nombre, hora, isExtra}]`
- Campo `horaLlegadaTurnoDia` para hora de llegada del turno dia
- Soporta formato legacy (string simple) y nuevo (array JSON)

### `guardiasPresentes`:
- **MANUAL** — el operador central ingresa el numero directamente
- **NO se calcula** desde asistencia ni desde marcaciones
- Input numerico directo en la UI

---

## 7. Notas y Comentarios

### 3 niveles de notas:

| Nivel | Campo | Ubicacion | Quien escribe |
|-------|-------|-----------|---------------|
| Reporte | `generalNotes` | Header del reporte | Operador central |
| Instalacion | `notes` | Dentro de cada instalacion | Operador central |
| Ronda | `notes` | Modal de ronda individual | Operador central |

### Uso:
- `generalNotes`: "Corte de luz en zona norte 02:00-03:30", "Sin novedades generales"
- Instalacion `notes`: "Problema de puerta principal", "Sensor activado 2 veces"
- Ronda `notes`: "Guardia no contesta", "Motivo de omision: lluvia intensa"

### Visualizacion:
- Notas de ronda: icono azul de comentario en celda del grid
- Notas de instalacion: textarea debajo de la seccion de guardias
- Notas generales: textarea en header del reporte
- Todas incluidas en PDF y email

---

## 8. Workflow de Estados

```
                  ┌──────────────┐
                  │   borrador   │ ← Auto-save cada 5s
                  │   (draft)    │
                  └──────┬───────┘
                         │ "Finalizar y Enviar"
                         ▼
                  ┌──────────────┐
                  │   aprobado   │ ← Genera AI summary + PDF + Email
                  │  (approved)  │
                  └──────┬───────┘
                         │ "Reenviar"
                         ▼
                  ┌──────────────┐
                  │   (resend)   │ ← Regenera y reenvia email
                  └──────────────┘
```

**Nota:** No hay paso de revision intermedio. `borrador → aprobado` es directo.

### Al enviar (action: "submit"):
1. `status = "aprobado"`, `submittedAt = now`, `approvedAt = now`
2. Genera resumen IA (GPT-4o-mini, non-blocking)
3. Genera PDF (Playwright, inline)
4. Calcula KPI snapshot (week/mtd/ytd)
5. Envia email via Resend con PDF adjunto
6. Email incluye: stats, novedades, criticos, AI summary, KPI snapshot

---

## 9. Email y PDF

### Email (Resend):
- **Subject:** "Control Nocturno {fecha}"
- **Contenido HTML:**
  - Operador, central label, fecha
  - Total instalaciones
  - Conteo novedades (naranja) y criticos (rojo)
  - Notas generales
  - Resumen IA (si disponible)
  - KPI Snapshot: cumplimiento semana/mes/ano con delta vs periodo anterior
  - PDF adjunto

### PDF (Playwright):
- **Formato:** A3 landscape, tema oscuro
- **Contenido:**
  - Header: titulo, operador, fecha, horario turno
  - Tabla principal: N, Instalacion, Guardia nocturno, Llegada, R1-R12, Llegada dia, Guardia dia
  - Celdas color-coded por status
  - Badges de guardias presentes/requeridos
  - Seccion de notas (generales + por instalacion + por ronda)
  - Footer: conteos total/normal/novedad/critico

### AI Summary (GPT-4o-mini):
- Contexto historico: ultimos 7 dias
- Analiza: rondas completadas/omitidas, instalaciones problematicas, notas
- Genera 3-4 oraciones ejecutivas
- Non-blocking (falla silenciosamente)

---

## 10. KPIs

### Metricas:
| Metrica | Calculo |
|---------|---------|
| Cumplimiento % | (completadas / totalRondas) * 100 |
| Omitidas | Conteo de status="omitida" |
| Desviacion promedio | \|horaMarcada - horaEsperada\| en minutos |
| Alert count | Instalaciones con cumplimiento < 80% |
| Critical count | Instalaciones con criticos > 0 |

### Periodos comparados:
- **Semana actual** vs semana anterior
- **MTD** (mes hasta hoy) vs mes anterior
- **YTD** (ano hasta hoy) vs ano anterior
- Delta de cumplimiento, omitidas, alertas

### Charts:
- Trend semanal de cumplimiento
- Top risks (peor cumplimiento)
- Top best (mejor cumplimiento)
- Colores: teal (>=80%), amber (50-79%), red (<50%)

---

## 11. Relacion con Rondas

### Link en schema:
- `OpsControlNocturnoRonda.ejecucionRondaId` → FK a `OpsRondaEjecucion`
- Relacion **opcional y manual** — no se vincula automaticamente

### Estado actual:
- **NO hay integracion automatica** entre control nocturno y rondas
- Los R1-R12 se crean independientemente del sistema de rondas
- El operador marca manualmente cada ronda como completada/omitida
- Puede opcionalmente vincular a una ejecucion real de ronda
- **No hay imports cruzados** entre los modulos

### Oportunidad de unificacion:
- R1-R12 podrian auto-poblarse desde OpsRondaEjecucion (si la ejecucion cae dentro de la hora esperada)
- El status podria calcularse automaticamente desde el sistema de rondas
- Trust score de rondas podria alimentar los KPIs del control nocturno

---

## 12. Relacion con Asistencia

### Estado actual: **CERO conexion**
- No hay imports entre modulos
- `guardiasPresentes` es **input manual**, no viene de asistencia
- Asistencia tracka turnos diarios completos (via OpsAsistenciaDiaria)
- Control nocturno es un **reporte manual de la central nocturna**

### Oportunidad:
- `guardiasPresentes` podria auto-calcularse desde marcaciones de asistencia
- Guardias asignados podrian venir de la pauta mensual
- Hora de llegada podria cruzarse con marcacion de entrada

---

## 13. Configuracion

### Instalaciones incluidas:
- Controlado por `CrmInstallation.nocturnoEnabled` (default: true)
- Toggle en pagina de detalle de instalacion (CRM)
- Solo instalaciones con `isActive: true` + `nocturnoEnabled: true`

### Horarios:
- `shiftStart` (default "19:00") y `shiftEnd` (default "08:00") configurables al crear reporte
- Horas R1-R12 son **HARDCODEADAS** (20:00-07:00, cada hora)
- No configurables por instalacion ni por tenant

### Permisos:
- `control_nocturno` — acceso al modulo (edit)
- `control_nocturno_delete` — borrar reportes (admin/owner)
- Independiente de permisos de `rondas`

---

## 14. Portal Cliente

### Endpoint: GET `/api/portal/cliente/posta`
- Muestra reportes nocturnos enviados/aprobados para las instalaciones del cliente
- Read-only
- Filtrable por instalacion y rango de fechas
- Limite 50 resultados

---

## 15. Problemas y Observaciones

1. **Horas R1-R12 hardcodeadas:** No configurables. Si el turno cambia (ej: 22:00-06:00), las horas no se ajustan.

2. **Sin integracion automatica con Rondas:** El operador debe marcar manualmente cada hora, aunque el sistema de rondas ya tiene esos datos.

3. **Sin integracion con Asistencia:** `guardiasPresentes` es manual, podria calcularse automaticamente.

4. **Aprobacion directa:** No hay paso de revision. `borrador → aprobado` sin intermediario.

5. **Componentes muy grandes:** `OpsControlNocturnoDetailClient.tsx` tiene ~1474 lineas. Dificil de mantener.

6. **JSON en campo string:** `guardiaDiaNombres` almacena JSON como string, con parsing/serialization manual y soporte legacy.

7. **Playwright para PDF:** Costoso en terminos de recursos. Timeout de 45s. Podria fallar en serverless.

8. **Link a ejecucionRonda no usado:** El FK existe pero no se aprovecha en la UI ni en la logica.

9. **Duplicacion con Rondas Monitor:** Ambos sistemas trackean "rondas completadas por hora" pero de forma independiente.

10. **No hay validacion de unicidad robusta:** Si dos operadores crean reporte para la misma fecha sin `centralLabel`, falla con P2002.
