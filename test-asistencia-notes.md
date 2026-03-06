# Test E2E — Sistema de Asistencia de Guardias OPAI

## Fecha de análisis: 2026-03-06

---

## 1. Estructura de Archivos del Módulo de Asistencia

### Schema (Prisma)

| Modelo | Tabla (DB) | Schema | Descripción |
|--------|-----------|--------|-------------|
| `OpsMarcacion` | `ops.marcaciones` | ops | Registro individual de marcación (entrada/salida) |
| `OpsAsistenciaDiaria` | `ops.asistencia_diaria` | ops | Jornada diaria por puesto/slot (resumen entrada+salida) |
| `OpsPautaMensual` | `ops.pauta_mensual` | ops | Programación mensual de turnos por puesto/slot |
| `OpsAsignacionGuardia` | `ops.asignacion_guardias` | ops | Asignación vigente de guardia a puesto/instalación |
| `OpsPuestoOperativo` | `ops.puestos_operativos` | ops | Definición de puesto con horarios de turno |
| `OpsGuardia` | `ops.guardias` | ops | Ficha del guardia (lifecycle, PIN, etc.) |
| `OpsPersona` | `ops.personas` | ops | Datos personales (RUT, nombre, dirección) |
| `CrmInstallation` | `crm.installations` | crm | Instalación con georreferencia |

### API Endpoints

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/public/marcacion/registrar` | POST | Registra marcación de entrada/salida |
| `/api/public/marcacion/validar` | POST | Valida RUT+PIN y devuelve siguiente acción |
| `/api/public/marcacion/mis-marcaciones` | GET | Historial de marcaciones del guardia |

### Frontend

| Archivo | Descripción |
|---------|-------------|
| `src/app/marcar/[code]/page.tsx` | Página pública de marcación (SSR) |
| `src/app/marcar/[code]/MarcacionClient.tsx` | Componente cliente con flujo completo |
| `src/app/marcar/layout.tsx` | Layout para páginas de marcación |

### Librerías

| Archivo | Descripción |
|---------|-------------|
| `src/lib/marcacion.ts` | Haversine distance, SHA-256 hash, generación de códigos |
| `src/lib/marcacion-email.ts` | Envío de comprobante digital por email |
| `src/lib/ops-attendance.ts` | Cálculo de métricas (minutos planificados/trabajados/extra/atraso) |

---

## 2. Flujo de Marcación

### Flujo completo:

1. Guardia accede a `/marcar/[CODE]` (URL o QR)
2. Ingresa RUT + PIN de 4-6 dígitos
3. Sistema valida vía `/api/public/marcacion/validar`:
   - Busca instalación por `marcacionCode`
   - Busca guardia por RUT normalizado en el mismo tenant
   - Verifica lifecycle status: debe ser "seleccionado" o "contratado"
   - Verifica que no esté en blacklist
   - Valida PIN con bcrypt
   - Determina siguiente acción (entrada/salida) según última marcación del día
4. Frontend solicita geolocalización GPS (obligatorio)
5. Opcionalmente captura foto con cámara frontal (evidencia, no biométrica)
6. Guardia presiona "Marcar Entrada" o "Marcar Salida"
7. Sistema registra vía `/api/public/marcacion/registrar`:
   - Valida geolocalización: Haversine distance ≤ `geoRadiusM` de la instalación
   - **Bloquea** si está fuera del radio (responde 403)
   - Genera sello de tiempo del servidor (no del cliente)
   - Computa hash SHA-256 de integridad (Res. Exenta N°38)
   - Calcula atraso en minutos si es entrada y hay turno asignado
   - Crea `OpsMarcacion` en transacción
   - Actualiza `OpsAsistenciaDiaria` si existe registro para el día
   - Envía comprobante por email (fire-and-forget)

### Validaciones:

| Validación | Implementación | Detalle |
|------------|----------------|---------|
| RUT válido | `isValidChileanRut()` | Formato y dígito verificador |
| PIN bcrypt | `bcrypt.compare()` | PIN hasheado en `OpsGuardia.marcacionPin` |
| Lifecycle | `["seleccionado","contratado"]` | Status del guardia |
| Blacklist | `isBlacklisted === false` | No en lista negra |
| Duplicidad | Última marcación del día | No puede marcar dos entradas/salidas seguidas |
| Geolocalización | Haversine distance ≤ geoRadiusM | Radio configurable por instalación (default 100m) |
| Secuencia | entrada → salida → entrada... | No puede marcar salida sin entrada previa |

---

## 3. Sistema de Georreferencia

- **Fórmula**: Haversine (en `src/lib/marcacion.ts`)
- **Radio**: Campo `geoRadiusM` en `CrmInstallation` (default 100m)
- **Coordenadas instalación**: `lat`, `lng` en `CrmInstallation`
- **Validación**: Obligatoria y bloqueante si la instalación tiene coordenadas
- Si la instalación NO tiene coordenadas, se permite marcar sin validación geo (solo se registra ubicación)

---

## 4. Modelo de Datos — Relaciones Clave

```
OpsPersona (RUT, nombre)
  └── OpsGuardia (lifecycle, PIN, instalación actual)
        ├── OpsAsignacionGuardia (puesto, slot, instalación)
        ├── OpsPautaMensual (programación diaria por puesto/slot)
        ├── OpsAsistenciaDiaria (jornada: checkIn/checkOut, métricas)
        └── OpsMarcacion (registro individual con GPS, hash, timestamp)
              └── CrmInstallation (coordenadas, radio geo, código QR)
```

---

## 5. Campos de OpsMarcacion

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUID | PK auto-generado |
| tenantId | String | Tenant de la instalación |
| guardiaId | UUID | FK → OpsGuardia |
| installationId | UUID | FK → CrmInstallation |
| puestoId | UUID? | FK → OpsPuestoOperativo (si asignado) |
| slotNumber | Int? | Slot en el puesto |
| tipo | String | "entrada" o "salida" |
| timestamp | DateTime | Sello del servidor (UTC) |
| lat | Float? | Latitud GPS del guardia |
| lng | Float? | Longitud GPS del guardia |
| geoValidada | Boolean | true si está dentro del radio |
| geoDistanciaM | Float? | Distancia al centro de la instalación |
| metodoId | String | "rut_pin" |
| fotoEvidenciaUrl | String? | Referencia a foto capturada |
| ipAddress | String? | IP del request |
| userAgent | String? | User Agent del dispositivo |
| hashIntegridad | String | SHA-256 (Res. Exenta N°38) |
| atrasoMinutos | Int? | Minutos de atraso (solo entrada) |

---

## 6. Campos de OpsAsistenciaDiaria

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUID | PK |
| date | Date | Fecha de la jornada |
| attendanceStatus | String | pendiente/asistio/reemplazo/ppc/etc. |
| checkInAt | DateTime? | Hora de entrada marcada |
| checkOutAt | DateTime? | Hora de salida marcada |
| checkInSource | String? | "digital" / "manual" / "none" |
| checkOutSource | String? | Igual |
| plannedMinutes | Int | Minutos planificados (turno - colación) |
| workedMinutes | Int | Minutos trabajados (checkOut - checkIn - colación) |
| overtimeMinutes | Int | max(0, worked - planned) |
| lateMinutes | Int | max(0, checkIn - shiftStart) |

---

## 7. Script de Test E2E

**Archivo**: `scripts/test-e2e-asistencia.ts`

**Uso**:
```bash
# Ejecutar test completo (crear marcaciones)
npx tsx scripts/test-e2e-asistencia.ts

# Solo verificar estado actual
npx tsx scripts/test-e2e-asistencia.ts --verify

# Limpiar marcaciones de test
npx tsx scripts/test-e2e-asistencia.ts --cleanup
```

**Nota**: El script usa Prisma directamente (no la API HTTP) porque necesita simular
timestamps de fechas pasadas (Enero 1-3, 2025). La API siempre usa `new Date()` como
sello de tiempo del servidor. La lógica de negocio (geofencing, hash, métricas) es
idéntica a la del endpoint `/api/public/marcacion/registrar`.

---

## 8. Hallazgos

### Hallazgo 1: API usa server timestamp
- **Descripción**: El endpoint `/api/public/marcacion/registrar` usa `new Date()` como timestamp del servidor. No permite pasar un timestamp personalizado.
- **Impacto**: No se pueden simular marcaciones de fechas pasadas vía API HTTP.
- **Solución**: El script E2E usa Prisma directamente con la misma lógica de negocio.
- **Recomendación**: Esto es correcto para producción (previene manipulación de timestamp por el cliente). Para testing, el script directo es el enfoque adecuado.

### Hallazgo 2: Duplicidad solo verifica "hoy"
- **Descripción**: La validación de duplicidad en el endpoint compara contra `new Date()` truncado a medianoche. Esto es correcto para uso real.
- **Impacto**: Ninguno negativo.

### Hallazgo 3: Timezone handling
- **Descripción**: Los timestamps se almacenan en UTC (`Timestamptz`). El cálculo de atraso en el endpoint usa `getUTCHours/getUTCMinutes` comparando con el shift start (que está en hora local Chile). Esto puede generar discrepancias si los turnos no se interpretan como hora local.
- **Impacto**: Potencial cálculo incorrecto de atraso para turnos en horarios edge (cerca de medianoche UTC).
- **Archivos afectados**: `src/app/api/public/marcacion/registrar/route.ts` (líneas 239-250), `src/lib/ops-attendance.ts` (línea 67-68)

---

## 9. Configuración Requerida

Para ejecutar el test E2E se necesita:

1. **`.env.local`** con `DATABASE_URL` válido
2. **Guardia RUT 13255838-8** existente en la BD con:
   - `lifecycleStatus` = "seleccionado" o "contratado"
   - `marcacionPin` configurado (hash bcrypt)
3. **Instalación Gard** existente con:
   - `isActive` = true
   - `marcacionCode` configurado
   - Coordenadas (`lat`, `lng`) configuradas
4. **Asignación o pauta** del guardia en la instalación para Enero 1-3
