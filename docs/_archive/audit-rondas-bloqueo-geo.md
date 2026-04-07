# Auditoría: Bloqueo de marcación fuera de rango GPS

**Fecha:** 2026-03-12  
**Objetivo:** Verificar que los cambios para bloquear marcación fuera de rango funcionen correctamente y no rompan flujos existentes.

---

## 1. Resumen de cambios acordados

| Regla | Descripción |
|-------|-------------|
| **GEOFENCE** | Bloquear "Confirmar" si `!withinRadius` |
| **QR** | Permitir siempre (el escaneo QR es prueba de presencia) |
| **BOTH** | Bloquear si `!withinRadius` (exige QR + estar en rango) |
| **Apertura** | Permitir abrir cualquier checkpoint siempre; solo bloquear botón Confirmar |
| **Offline** | Validar en cliente antes de guardar en IndexedDB; si fuera de rango, no guardar |
| **Botón Expandir/Colapsar** | Aumentar área táctil para mejor usabilidad |

---

## 2. Flujos de marcación identificados

### 2.1 Portal (RondaActiva + CheckpointMarker) — principal

| Paso | Archivo | Endpoint / Función |
|------|---------|-------------------|
| 1 | `RondaActiva.tsx` | Usuario abre checkpoint (tap en lista o popup auto) |
| 2 | `CheckpointMarker.tsx` | Muestra bottom sheet, usuario confirma |
| 3a | `CheckpointMarker.tsx` | Online: `fetch("/api/portal/rondas/marcar")` |
| 3b | `CheckpointMarker.tsx` | Offline: `savePendingMark()` → IndexedDB |
| 4 | `CheckpointMarker.tsx` | Al reconectar: `fetch("/api/portal/rondas/sync")` con marks de IndexedDB |

### 2.2 Public Ronda (ronda/[code] — RondaClient)

| Paso | Archivo | Endpoint / Función |
|------|---------|-------------------|
| 1 | `RondaClient.tsx` | Usuario escanea QR → `markCheckpoint(checkpointQrCode)` |
| 2 | `RondaClient.tsx` | Obtiene GPS, envía `checkpointQrCode` + lat/lng |
| 3 | `RondaClient.tsx` | `fetch("/api/public/ronda/marcar")` |
| 4 | Offline | Cola en memoria (`offlineQueue`), luego `flushQueue` llama marcar por cada item |

**Nota:** RondaClient solo usa QR. No tiene UI para marcar por GEOFENCE. Siempre envía `checkpointQrCode`. El backend resuelve el checkpoint por QR.

### 2.3 Public Sync (app externa móvil)

| Paso | Archivo | Descripción |
|------|---------|-------------|
| 1 | App externa | Ronda completada offline, envía batch |
| 2 | `api/public/ronda/sync/route.ts` | Recibe `rounds[]` con `marcaciones[]` |
| 3 | Sync route | Crea ejecución + cada marcación, valida geo, genera alertas |

**Formato:** `verificationMethod` por marcación: "GEOFENCE" | "QR" | "MANUAL"

---

## 3. Puntos de modificación requeridos

### 3.1 CheckpointMarker.tsx (Portal)

**Ubicación:** `src/components/portal/rondas/CheckpointMarker.tsx`

| Cambio | Líneas aprox | Detalle |
|--------|--------------|---------|
| `canSubmit` | 320-321 | Añadir: para checkpoints GEOFENCE/BOTH, exigir `withinRadius`. Para QR: no exigir geo. Ad-hoc: sin cambio. |
| Mensaje fuera de rango | Nuevo | Si `!withinRadius` y requiere geo: "Acércate al punto para poder marcar" |
| Offline save | 467-476 | Antes de `savePendingMark`: si requiere geo y `!withinRadius`, NO guardar; mostrar error igual que online |

**Lógica canSubmit:**
```ts
// Ad-hoc: sin restricción geo
if (checkpoint.id.startsWith("ad-hoc")) {
  canSubmit = gpsStatus === "success" && ... && requiredTasksComplete;
}
// QR-only: QR es prueba, no exigir withinRadius
else if (checkpoint.verificationType === "QR") {
  canSubmit = gpsStatus === "success" && (needsQr ? qrCode : true) && requiredTasksComplete;
}
// GEOFENCE o BOTH: exigir withinRadius
else {
  canSubmit = ... && withinRadius;
}
```

**Verificación:** `checkpoint.verificationType` viene de `CheckpointInfo`. Valores en BD: `GEOFENCE`, `QR`, `BOTH`.

### 3.2 marcar-checkpoint-service.ts (Backend)

**Ubicación:** `src/lib/rondas/marcar-checkpoint-service.ts`

| Cambio | Ubicación | Detalle |
|--------|-----------|---------|
| Validación geo | Después de paso 5 (geo validation) | Si checkpoint tiene `verificationType` GEOFENCE o BOTH y `!geo.valid`, lanzar `MarcarCheckpointError("Debe estar en el rango del checkpoint para marcar", 400)` |
| Excepción QR | Misma validación | Si `verificationType === "QR"`, NO bloquear por geo |
| Ad-hoc | Misma validación | `isAdHocGps` ya bypass geo; `isAdHocGps` con checkpointId no aplica |

**Orden de checks:**
1. Resolver checkpoint (ya existe)
2. Si `!isAdHocGps` y checkpoint tiene lat/lng:
   - Si `verificationType === "QR"`: skip (no bloquear)
   - Si `verificationType === "GEOFENCE"` o `"BOTH"`: si `!geo.valid` → throw

**Cuidado:** El servicio usa `validateGeofenceWithAccuracy` que ya considera `gpsAccuracy`. Mantener esa lógica.

### 3.3 api/portal/rondas/sync (Offline sync)

**Ubicación:** `src/app/api/portal/rondas/sync/route.ts`

Usa `marcarCheckpoint` directamente. Si añadimos validación en el servicio, el sync **fallará** para marks fuera de rango. Eso es correcto: el guardia no debería haber guardado esos marks (bloqueados en el frontend). Si por algún bypass llegaron, el backend los rechazará. El sync devuelve `{ synced, failed, errors }` por mark, así que el cliente verá qué falló.

**No requiere cambios adicionales** si el servicio ya rechaza.

### 3.4 api/public/ronda/sync (Sync app externa)

**Ubicación:** `src/app/api/public/ronda/sync/route.ts`

Este sync **no usa** `marcarCheckpoint`. Crea las marcaciones directamente en un loop. Tiene `verificationMethod` por marcación.

**Opciones:**
- **A)** Añadir validación: si `verificationMethod === "GEOFENCE"` o `"MANUAL"` y `!geo.valid`, no crear la marcación (skip) y añadir a errors. Recalcular `checkpointsCompletados`.
- **B)** Dejar como está: las marcaciones fuera de rango se crean con anomalía. El usuario pidió bloquear; para sync externo podría ser más permisivo si la app externa ya validó.

**Recomendación:** Aplicar la misma lógica. Si `verificationMethod === "QR"` → permitir. Si `"GEOFENCE"`/`"MANUAL"` y `!geo.valid` → skip mark, añadir error. Necesitamos `verificationType` del checkpoint para BOTH: si checkpoint es BOTH y verificationMethod es QR, ¿exigimos geo? Sí — BOTH exige ambos. Entonces:
- `verificationMethod === "QR"` y checkpoint.verificationType === "QR" → permitir
- `verificationMethod === "QR"` y checkpoint.verificationType === "BOTH" → exigir geo también
- `verificationMethod === "GEOFENCE"` o "MANUAL" → exigir geo si checkpoint es GEOFENCE o BOTH

Necesitamos incluir `verificationType` en el select del checkpoint (línea 72-75). Actualmente no lo tiene.

### 3.5 RondaClient (ronda/[code])

**Ubicación:** `src/app/ronda/[code]/RondaClient.tsx`

Siempre envía `checkpointQrCode`. Los checkpoints en este flujo son típicamente QR. Si un checkpoint es BOTH, el guardia escanea QR pero también debe estar en rango. El backend validará. **No requiere cambios en RondaClient** si el backend rechaza correctamente.

### 3.6 Botón Expandir/Colapsar

**Ubicación:** `src/components/portal/rondas/RondaActiva.tsx` líneas 737-758

| Cambio | Detalle |
|--------|---------|
| `py-1` → `py-2` o `py-3` | Aumentar área táctil |
| `min-h-[44px]` | Mínimo recomendado para touch (Apple HIG) |
| Revisar `z-index` | Asegurar que no quede tapado por contenido scrollable |

---

## 4. Riesgos y edge cases

### 4.1 Checkpoints sin coordenadas

Si `checkpoint.lat` o `checkpoint.lng` son null, `validateGeofenceWithAccuracy` devuelve `valid: false`. Un checkpoint QR podría no tener coords. Revisar: en el servicio, si checkpoint es QR-only, no validamos geo. Si es GEOFENCE o BOTH y no tiene lat/lng, ¿qué hacemos? Actualmente el esquema exige geoRadiusM; lat/lng pueden ser opcionales para checkpoints QR. Si no hay coords, no podemos validar geo → no bloquear (tratar como válido para no romper). O bloquear con mensaje "Checkpoint sin coordenadas configuradas". **Revisar schema:** OpsCheckpoint tiene lat, lng como opcionales?

```prisma
lat  Float?
lng  Float?
```

Si lat/lng son null y verificationType es GEOFENCE, el checkpoint está mal configurado. `validateGeofenceWithAccuracy(null, null, ...)` → distanceM null, valid false. En ese caso, no deberíamos bloquear al guardia por un error de configuración. **Recomendación:** Si checkpoint es GEOFENCE/BOTH pero lat/lng son null, no bloquear (comportamiento actual: geo.valid = false, se crea alerta pero se acepta). Para BLOQUEAR, si lat/lng son null no podemos validar → no bloquear, log warning.

### 4.2 GPS accuracy / validateGeofenceWithAccuracy

El servicio usa `validateGeofenceWithAccuracy` que aplica tolerancia según `gpsAccuracy`. Si accuracy es mala (ej. 50m), puede expandir el radio efectivo. Eso está bien: evitamos falsos negativos por GPS impreciso. Mantener esa lógica.

### 4.3 Offline: orden de validación

En CheckpointMarker, cuando hay error de red:
1. `fetch` falla con TypeError
2. Se intenta `savePendingMark`
3. Si no validamos antes, podríamos guardar marks fuera de rango

**Solución:** La validación `canSubmit` ya incluye `withinRadius` cuando aplica. Si `canSubmit` es false, el botón está disabled y `handleSubmit` no se llama. Pero `handleSubmit` puede ejecutarse si el usuario de alguna forma bypasea (ej. devtools). Dentro de `handleSubmit`, antes del fetch, añadir:

```ts
if (!isAdHocMark && checkpoint.verificationType !== "QR" && !withinRadius) {
  setSubmitError("Acércate al punto para poder marcar");
  submittingRef.current = false;
  setSubmitting(false);
  return;
}
```

Y en el catch de TypeError, antes de savePendingMark, la misma validación: si fuera de rango, no guardar, mostrar error.

### 4.4 Portal sync: marks ya guardados fuera de rango

Si hay marks en IndexedDB que se guardaron antes de este cambio (cuando no bloqueábamos), al hacer sync el backend los rechazará. El usuario verá "failed" para esos. No hay migración de datos; es el comportamiento esperado. Opcional: al sync, si un mark falla con "Debe estar en el rango...", podríamos eliminarlo de IndexedDB para no reintentar infinitamente.

### 4.5 RondaClient offline

RondaClient usa `offlineQueue` en memoria. Si el usuario cierra la pestaña o refresca, se pierden. No usa IndexedDB. Fuera del alcance de este cambio; solo documentar.

---

## 5. Checklist de implementación

- [ ] **CheckpointMarker:** canSubmit con lógica GEOFENCE/QR/BOTH
- [ ] **CheckpointMarker:** Mensaje "Acércate al punto..." cuando disabled por geo
- [ ] **CheckpointMarker:** Validación en handleSubmit antes de fetch (defensa en profundidad)
- [ ] **CheckpointMarker:** No savePendingMark si fuera de rango (en catch TypeError)
- [ ] **marcar-checkpoint-service:** Throw si GEOFENCE/BOTH y !geo.valid (excepto QR-only)
- [ ] **marcar-checkpoint-service:** Manejar checkpoint sin lat/lng (no bloquear)
- [ ] **api/public/ronda/sync:** Incluir verificationType en select checkpoint
- [ ] **api/public/ronda/sync:** Skip marks fuera de rango cuando verificationMethod/Type lo exijan
- [ ] **RondaActiva:** Botón Expandir/Colapsar con mayor área táctil
- [ ] **Tests:** Verificar flujos online, offline, QR, GEOFENCE, BOTH

---

## 6. Archivos que NO requieren cambios

| Archivo | Razón |
|---------|-------|
| `api/portal/rondas/marcar/route.ts` | Delega al servicio |
| `api/public/ronda/marcar/route.ts` | Delega al servicio |
| `lib/rondas-offline.ts` | Solo almacenamiento; validación en caller |
| `RondaClient.tsx` | Solo QR; backend valida |
| `anomaly-detection.ts` | Sigue generando anomalías para reportes; el bloqueo es antes |

---

## 7. Pruebas recomendadas

1. **Portal, checkpoint GEOFENCE:** Abrir checkpoint, estar fuera de rango → Confirmar disabled, mensaje visible. Acercarse → Confirmar enabled. Marcar.
2. **Portal, checkpoint QR:** Escanear QR fuera de rango → Confirmar enabled (QR es prueba). Marcar.
3. **Portal, checkpoint BOTH:** Escanear QR fuera de rango → Confirmar disabled. Acercarse → Confirmar enabled.
4. **Portal, offline:** Sin red, intentar marcar fuera de rango → No debe guardar en IndexedDB. Con red, marcar en rango → OK.
5. **RondaClient (QR):** Escanear QR en rango → OK. Escanear QR fuera de rango (si checkpoint es BOTH) → Backend rechaza.
6. **Sync portal:** Marks en IndexedDB en rango → sync OK. Marks fuera de rango (legacy) → sync falla con error claro.
7. **Botón Expandir/Colapsar:** Verificar que responde bien en móvil.
