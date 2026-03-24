# Marcación con Foto + GPS Sync + Fotos en Pauta Diaria

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar el sistema de marcación para que siempre capture foto del guardia (como portal marcación), subir fotos a R2, mostrarlas en la pauta diaria con lightbox, y sincronizar lat/lng cuando se mueve el pin del mapa.

**Architecture:** 4 cambios independientes: (1) Reverse geocode al mover pin en mapa, (2) Subir foto de evidencia a R2 en face-verify y registrar, (3) Agregar cámara facial al flujo de marcación del portal guardia, (4) Mostrar fotos en pauta diaria con lightbox. Cada cambio es deployable por separado.

**Tech Stack:** Next.js App Router, Prisma, Cloudflare R2 (via `src/lib/storage.ts`), Google Maps Geocoder API, AWS Rekognition, FaceCameraCapture component.

---

## Cambio 1: Reverse geocode al mover pin en mapa

### Task 1.1: Agregar reverse geocode en saveMapCoords

**Files:**
- Modify: `src/components/crm/CrmInstallationDetailClient.tsx:1868-1887`

**Context:** Cuando el usuario mueve el pin en el `MapCoordinatePicker`, la función `saveMapCoords` solo envía `{ lat, lng }` al PATCH sin actualizar address/city/commune. El `google.maps.Geocoder` ya está disponible en el cliente (mismo API key que usa AddressAutocomplete).

- [ ] **Step 1: Modificar saveMapCoords para reverse geocode**

Reemplazar la función `saveMapCoords` (líneas 1868-1887) con una versión que geocodifique antes de guardar. La lógica de parseo de `address_components` debe ser idéntica a la usada en `AddressAutocomplete.tsx` y `MapsUrlPasteInput.tsx`:
- `commune`: de `administrative_area_level_3` → `sublocality_level_1` → `sublocality`
- `city`: "Santiago" si la región es "Región Metropolitana", sino `locality`
- `address`: `formatted_address`

Si el geocode falla (sin conexión, API error), solo guardar coordenadas como comportamiento actual (graceful degradation).

- [ ] **Step 2: Probar manualmente**

1. Abrir detalle de instalación → modal mapa → mover pin → guardar
2. Verificar que address, city, commune se actualizaron en la BD junto con lat/lng

- [ ] **Step 3: Commit**

```bash
git add src/components/crm/CrmInstallationDetailClient.tsx
git commit -m "fix(crm): reverse geocode al mover pin del mapa para sincronizar dirección con coordenadas"
```

---

## Cambio 2: Subir foto de evidencia a R2

### Task 2.1: Crear helper para subir foto de marcación a R2

**Files:**
- Create: `src/lib/marcacion-photo.ts`

**Context:** `src/lib/storage.ts` ya tiene `uploadFile(buffer, fileName, mimeType, prefix)` que sube a R2 y retorna `{ publicUrl }`. Las fotos de `FaceCameraCapture` son JPEG quality 0.85 a 640x480 (~50-100KB).

- [ ] **Step 1: Crear helper**

```typescript
// src/lib/marcacion-photo.ts
import { uploadFile } from "@/lib/storage";

const MAX_IMAGE_SIZE = 1_000_000; // 1MB safety limit

/**
 * Sube una foto de evidencia de marcación a R2.
 * @returns URL pública o null si falla
 */
export async function uploadMarcacionPhoto(
  imageBase64: string,
  guardiaId: string,
  tipo: string
): Promise<string | null> {
  try {
    const buffer = Buffer.from(imageBase64, "base64");
    if (buffer.length > MAX_IMAGE_SIZE) {
      console.warn("[marcacion-photo] Image exceeds 1MB, skipping upload");
      return null;
    }
    const fileName = `${guardiaId}-${tipo}-${Date.now()}.jpg`;
    const result = await uploadFile(buffer, fileName, "image/jpeg", "marcaciones");
    return result.publicUrl;
  } catch (error) {
    console.error("[marcacion-photo] Error uploading to R2:", error);
    return null;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/marcacion-photo.ts
git commit -m "feat(marcacion): helper para subir fotos de evidencia a R2"
```

### Task 2.2: Subir foto en face-verify endpoint

**Files:**
- Modify: `src/app/api/public/marcacion/face-verify/route.ts`

**Context:** El endpoint face-verify recibe `image` (base64) para Rekognition pero no guarda la foto como evidencia. El campo `fotoEvidenciaUrl` nunca se setea en el `opsMarcacion.create`.

- [ ] **Step 1: Agregar import y upload**

Import al inicio:
```typescript
import { uploadMarcacionPhoto } from "@/lib/marcacion-photo";
```

Antes del `prisma.$transaction` (~línea 335), agregar:
```typescript
    // Upload evidence photo to R2 (if fails, marcacion still proceeds)
    const fotoEvidenciaUrl = await uploadMarcacionPhoto(image, guardia.id, tipo);
```

Dentro del `tx.opsMarcacion.create` data, agregar `fotoEvidenciaUrl,` después de `devicePairingId,` (~línea 365).

- [ ] **Step 2: Commit**

```bash
git add src/app/api/public/marcacion/face-verify/route.ts
git commit -m "feat(marcacion): subir foto de evidencia a R2 en face-verify"
```

### Task 2.3: Subir foto en registrar endpoint (PIN fallback)

**Files:**
- Modify: `src/app/api/public/marcacion/registrar/route.ts:240-248`

**Context:** El endpoint registrar (PIN fallback) recibe `fotoBase64` pero solo guarda un placeholder `evidence:timestamp`. La variable del guardia en este endpoint necesita verificarse — buscar cómo se llama la variable con el ID del guardia validado (de la query por RUT+PIN).

- [ ] **Step 1: Reemplazar placeholder por upload real**

Import al inicio:
```typescript
import { uploadMarcacionPhoto } from "@/lib/marcacion-photo";
```

Reemplazar las líneas 240-248 (el bloque del placeholder):
```typescript
    // Foto de evidencia: subir a R2 para supervisión visual.
    let fotoEvidenciaUrl: string | null = null;
    if (fotoBase64) {
      // Usar el ID del guardia validado de la BD (no el input directo)
      fotoEvidenciaUrl = await uploadMarcacionPhoto(fotoBase64, guardia.id, tipo);
    }
```

**IMPORTANTE:** Verificar el nombre exacto de la variable del guardia validado en este archivo. Puede ser `guardia.id`, `foundGuardia.id`, etc. Leer el archivo completo antes de editar.

- [ ] **Step 2: Commit**

```bash
git add src/app/api/public/marcacion/registrar/route.ts
git commit -m "feat(marcacion): subir foto de evidencia a R2 en PIN fallback (reemplaza placeholder)"
```

---

## Cambio 3: Agregar cámara facial al portal guardia

### Task 3.1: Agregar faceIdRegistered a GuardSession y al login endpoint

**Files:**
- Modify: `src/lib/guard-portal.ts:12-23`
- Modify: `src/app/api/portal/guardia/auth/route.ts:50-56` (el include de guardia) y `126-137` (la construcción del session)

**Context:** `GuardSession` no tiene info de Face ID. El auth endpoint (línea 50-56) incluye `guardia` pero no selecciona `faceIdRegistered`. Hay que agregarlo al include y al objeto session.

- [ ] **Step 1: Agregar campo a GuardSession interface**

En `src/lib/guard-portal.ts`, agregar después de `authenticatedAt`:
```typescript
  faceIdRegistered: boolean;
```

- [ ] **Step 2: Agregar faceIdRegistered al include del auth endpoint**

En `src/app/api/portal/guardia/auth/route.ts`, el include de guardia (línea ~51-55) NO usa `select` sino `include`, así que `faceIdRegistered` ya viene del modelo por defecto. Pero hay que agregarlo al objeto session (línea ~126-137):

Después de `authenticatedAt: new Date().toISOString(),` agregar:
```typescript
      faceIdRegistered: guardia.faceIdRegistered ?? false,
```

**VERIFICAR:** Que el `include` de guardia trae `faceIdRegistered`. Si usa `select` en vez de `include`, agregar el campo al select.

- [ ] **Step 3: Commit**

```bash
git add src/lib/guard-portal.ts src/app/api/portal/guardia/auth/route.ts
git commit -m "feat(portal-guardia): agregar faceIdRegistered a GuardSession y auth endpoint"
```

### Task 3.2: Crear endpoint de marcación con foto para portal guardia

**Files:**
- Create: `src/app/api/portal/guardia/marcar-foto/route.ts`

**Context:** El endpoint actual `POST /api/portal/guardia/marcar` (route.ts, 415 líneas) solo acepta GPS sin foto. El nuevo endpoint debe:
1. Aceptar `image` base64 obligatoria
2. Si guardia tiene Face ID → verificar con Rekognition (si falla, sigue con foto evidencia)
3. Siempre subir foto a R2
4. Misma lógica de attendance, email y notificaciones que el endpoint original

**CRÍTICO — Copiar la lógica de asistencia exacta del endpoint original:**

La lógica de update de `OpsAsistenciaDiaria` (líneas 282-349 del endpoint original) es compleja:
- Primero busca row de reemplazo (`replacementGuardiaId`)
- Luego busca row por `puestoId` + `slotNumber` + `date`
- Usa `checkInAt` / `checkOutAt` / `checkInSource` / `checkOutSource` / `marcacionEntradaId` / `marcacionSalidaId`
- Llama `computeAttendanceMetrics({ plannedShiftStart, plannedShiftEnd, checkInAt, checkOutAt })`
- Setea `attendanceStatus: "asistio"` (NO "presente")

La lógica de email (líneas 354-370) usa:
```typescript
sendMarcacionComprobante({
  guardiaName, guardiaEmail, guardiaRut, installationName, tipo,
  timestamp: serverTimestamp, geoValidada, geoDistanciaM, gpsStatus,
  hashIntegridad, lat, lng
})
```

La lógica de notificación fuera de rango (líneas 374-393) usa:
```typescript
sendNotificacionFueraDeRango({
  tenantId, installationId, installationName, installationLat, installationLng,
  guardiaName, guardiaRut, tipo, timestamp: serverTimestamp, geoDistanciaM,
  geoRadiusM: effectiveGeoRadiusM, lat, lng, deviceDisplay
})
```

- [ ] **Step 1: Crear el endpoint**

Copiar TODO el contenido de `src/app/api/portal/guardia/marcar/route.ts` como base. Luego modificar:

1. Agregar al schema de zod: `image: z.string().min(1)` (obligatorio)
2. Agregar imports: `uploadMarcacionPhoto` y `verifyFace`
3. Después de validaciones y antes del bloque de GPS, agregar lógica de Face ID + upload:

```typescript
    // Face verification (if registered) + evidence photo upload
    let metodoId = "foto_evidencia";
    let faceConfidence: number | null = null;

    if (guardia.faceIdRegistered) {
      try {
        const imageBuffer = Buffer.from(image, "base64");
        const verification = await verifyFace(imageBuffer);
        if (verification.match && verification.guardiaId === guardia.id) {
          metodoId = "face_id";
          faceConfidence = verification.confidence ?? null;
        }
      } catch {
        // Rekognition error — continue with foto_evidencia
      }
    }

    const fotoEvidenciaUrl = await uploadMarcacionPhoto(image, guardia.id, tipo);
```

4. En el `opsMarcacion.create`, cambiar `metodoId: "rut_pin"` a `metodoId,` y agregar `faceConfidence,` y `fotoEvidenciaUrl,`
5. Agregar `faceIdRegistered: true` al select de guardia (donde ya tiene `lifecycleStatus`, `isBlacklisted`, etc.)
6. Agregar `formatPersonName` al import de `@/lib/personas`

**NO modificar la lógica de:**
- Validación de guardia (existencia, status, blacklist)
- Búsqueda de asignación
- Geo radius config
- Duplicate check
- GPS validation
- Attendance update (COPIAR EXACTO líneas 282-349)
- Email comprobante (COPIAR EXACTO líneas 354-370)
- Notificación fuera de rango (COPIAR EXACTO líneas 374-393)
- Hash integridad (actualizar `metodoId` en el hash)

- [ ] **Step 2: Verificar que compila**

```bash
npx tsc --noEmit src/app/api/portal/guardia/marcar-foto/route.ts
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/portal/guardia/marcar-foto/route.ts
git commit -m "feat(portal-guardia): endpoint de marcación con foto y Face ID opcional"
```

### Task 3.3: Modificar MarcarAsistenciaQuickAction para capturar foto

**Files:**
- Modify: `src/components/portal/GuardPortalClient.tsx:534-660+`

**Context:** `MarcarAsistenciaQuickAction` tiene el flujo: idle → requesting_gps → ready → submitting → success. Hay que insertar un paso `camera` entre GPS y submit. **IMPORTANTE sobre race condition:** `setState` es asíncrono, no usar `capturedImage` inmediatamente después de `setCapturedImage`. Pasar la imagen directamente a la función.

- [ ] **Step 1: Agregar import de FaceCameraCapture y Camera icon**

```typescript
import { FaceCameraCapture } from "@/app/portal/marcacion/_components/FaceCameraCapture";
```

Agregar `Camera` al import de lucide-react.

- [ ] **Step 2: Modificar estados y flujo**

Cambiar `MarcaStep`:
```typescript
type MarcaStep = "idle" | "requesting_gps" | "camera" | "submitting" | "success" | "error";
```

Agregar estado:
```typescript
const [capturedImage, setCapturedImage] = useState<string | null>(null);
```

En los callbacks de GPS (líneas ~578-599), cambiar `setStep("ready")` a `setStep("camera")` en AMBOS casos (success y error — GPS no bloquea la marcación).

- [ ] **Step 3: Modificar handleConfirmMarcacion para aceptar imagen como parámetro**

**CRÍTICO — evitar race condition:** Pasar la imagen directamente, NO depender de `capturedImage` state.

```typescript
async function handleConfirmMarcacion(imageBase64: string) {
  if (!nextTipo) return;
  setStep("submitting");
  setError(null);

  try {
    const res = await fetch("/api/portal/guardia/marcar-foto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guardiaId: session.guardiaId,
        tenantId: session.tenantId,
        tipo: nextTipo,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        gpsAccuracy: coords?.accuracy ?? null,
        image: imageBase64,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Error al registrar marcación.");
      setStep("error");
      return;
    }

    setResult({
      timestamp: data.timestamp,
      tipo: data.tipo,
      gpsStatus: data.gpsStatus ?? "sin_gps",
    });
    setStep("success");
    toast.success(nextTipo === "entrada" ? "Entrada registrada" : "Salida registrada");
  } catch {
    setError("Error de conexión. Intenta nuevamente.");
    setStep("error");
  }
}
```

- [ ] **Step 4: Reemplazar render de step "ready" con step "camera"**

Eliminar el bloque `{step === "ready" && (...)}` y reemplazar con:

```tsx
{step === "camera" && (
  <div className="p-4 space-y-3">
    <div className="flex items-center gap-2 mb-2">
      <Camera className="h-5 w-5 text-emerald-500" />
      <p className="text-sm font-semibold">
        Toma una foto para registrar tu {nextTipo === "salida" ? "salida" : "entrada"}
      </p>
    </div>
    {gpsError && (
      <p className="text-xs text-amber-600 dark:text-amber-400">{gpsError}</p>
    )}
    <FaceCameraCapture
      onCapture={(imageBase64) => {
        setCapturedImage(imageBase64);
        handleConfirmMarcacion(imageBase64);
      }}
      onCancel={handleReset}
      captureLabel={nextTipo === "salida" ? "Marcar Salida" : "Marcar Entrada"}
    />
  </div>
)}
```

**Nota sobre `captureColor`:** Revisar la interfaz de `FaceCameraCapture` props. Si el prop espera un CSS color string (no un nombre Tailwind), no pasar `captureColor` y usar el default.

- [ ] **Step 5: Actualizar handleReset**

Agregar `setCapturedImage(null);` al reset.

- [ ] **Step 6: Probar manualmente**

1. Portal guardia → Marcar Asistencia → GPS → Cámara se abre
2. Tomar foto → submitting → success
3. Verificar en BD que la marcación tiene `fotoEvidenciaUrl` con URL de R2

- [ ] **Step 7: Commit**

```bash
git add src/components/portal/GuardPortalClient.tsx
git commit -m "feat(portal-guardia): marcación con foto obligatoria usando FaceCameraCapture"
```

---

## Cambio 4: Mostrar fotos en pauta diaria

### Task 4.1: Agregar fotoEvidenciaUrl al API de asistencia

**Files:**
- Modify: `src/app/api/ops/asistencia/route.ts:302-321`

- [ ] **Step 1: Agregar campo al select**

En el `prisma.opsMarcacion.findMany` select clause, agregar después de `pinFallbackReason: true,` (línea ~317):
```typescript
    fotoEvidenciaUrl: true,
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/ops/asistencia/route.ts
git commit -m "feat(pauta-diaria): incluir fotoEvidenciaUrl en query de marcaciones"
```

### Task 4.2: Agregar foto al tipo y display en pauta diaria

**Files:**
- Modify: `src/components/ops/OpsPautaDiariaClient.tsx`

- [ ] **Step 1: Agregar campo al tipo MarcacionItem**

En la definición del tipo (~línea 39), agregar:
```typescript
  fotoEvidenciaUrl?: string | null;
```

- [ ] **Step 2: Agregar estado para lightbox**

Cerca de los otros estados de modales:
```typescript
const [fotoLightbox, setFotoLightbox] = useState<{
  url: string; guardiaName: string; tipo: string; timestamp: string;
} | null>(null);
```

- [ ] **Step 3: Agregar thumbnail en columna de marcaciones**

Después de los badges de método (~línea 908), agregar thumbnail clickeable:

```tsx
{(() => {
  const fotoMarca = (item.marcaciones ?? []).find(
    (m) => m.fotoEvidenciaUrl && !m.fotoEvidenciaUrl.startsWith("evidence:")
  );
  if (!fotoMarca?.fotoEvidenciaUrl) return null;
  return (
    <button
      onClick={() => setFotoLightbox({
        url: fotoMarca.fotoEvidenciaUrl!,
        guardiaName: item.guardiaName ?? "Guardia",
        tipo: fotoMarca.tipo,
        timestamp: fotoMarca.timestamp,
      })}
      className="mt-1 inline-block rounded-md overflow-hidden border border-border hover:border-primary transition-colors"
      title="Ver foto de evidencia"
    >
      <img src={fotoMarca.fotoEvidenciaUrl} alt="Foto" className="w-10 h-10 object-cover" loading="lazy" />
    </button>
  );
})()}
```

- [ ] **Step 4: Agregar lightbox usando Dialog de shadcn**

Usar `Dialog` de shadcn/ui para consistencia y accesibilidad (Escape, focus trap, ARIA):

```tsx
<Dialog open={!!fotoLightbox} onOpenChange={(open) => { if (!open) setFotoLightbox(null); }}>
  <DialogContent className="max-w-2xl p-2">
    {fotoLightbox && (
      <div>
        <img
          src={fotoLightbox.url}
          alt={`Foto ${fotoLightbox.tipo} - ${fotoLightbox.guardiaName}`}
          className="w-full max-h-[75vh] object-contain rounded-lg"
        />
        <div className="mt-2 text-sm text-muted-foreground">
          <p className="font-medium">{fotoLightbox.guardiaName}</p>
          <p>
            {fotoLightbox.tipo === "entrada" ? "Entrada" : "Salida"} —{" "}
            {new Date(fotoLightbox.timestamp).toLocaleString("es-CL")}
          </p>
        </div>
      </div>
    )}
  </DialogContent>
</Dialog>
```

- [ ] **Step 5: Agregar foto al modal de detalle de marcaciones**

En el modal de detalle (~líneas 1069-1140), dentro del mapeo de cada marcación, agregar foto clickeable:

```tsx
{m.fotoEvidenciaUrl && !m.fotoEvidenciaUrl.startsWith("evidence:") && (
  <div className="mt-2">
    <p className="text-xs text-muted-foreground mb-1">Foto de evidencia:</p>
    <button
      onClick={() => {
        setMarcacionDetalleOpen([]);
        setFotoLightbox({
          url: m.fotoEvidenciaUrl!,
          guardiaName: "Guardia",
          tipo: m.tipo,
          timestamp: m.timestamp,
        });
      }}
      className="rounded-md overflow-hidden border border-border hover:border-primary transition-colors"
    >
      <img src={m.fotoEvidenciaUrl} alt="Foto" className="w-24 h-24 object-cover" loading="lazy" />
    </button>
  </div>
)}
```

- [ ] **Step 6: Probar manualmente**

1. Tener una marcación con foto en R2
2. Abrir pauta diaria → ver thumbnail en la columna
3. Click thumbnail → Dialog con foto grande
4. Click "Ver detalle" → modal detalle con foto → click → Dialog grande

- [ ] **Step 7: Commit**

```bash
git add src/components/ops/OpsPautaDiariaClient.tsx src/app/api/ops/asistencia/route.ts
git commit -m "feat(pauta-diaria): mostrar fotos de evidencia de marcaciones con lightbox"
```

---

## Orden de ejecución

1. **Cambio 2** — Crear helper R2 + subir fotos en endpoints existentes (base para todo)
2. **Cambio 3** — Cámara en portal guardia (depende del helper R2)
3. **Cambio 4** — Fotos en pauta diaria (depende de que haya fotos en R2)
4. **Cambio 1** — Reverse geocode (independiente)

## Riesgos y mitigaciones

- **R2 credentials:** Ya configurados en producción (usados por CRM uploads). Verificar con `echo $R2_BUCKET_NAME`.
- **Tamaño fotos:** FaceCameraCapture: JPEG 0.85 a 640x480 (~50-100KB). Helper tiene límite de 1MB.
- **Rekognition costs:** Solo se llama si `faceIdRegistered === true`. Si no tiene Face ID, solo foto evidencia.
- **Endpoint antiguo:** `POST /api/portal/guardia/marcar` sigue existiendo — backwards compatible.
- **Placeholders existentes:** Fotos con `evidence:timestamp` se filtran en display (`!startsWith("evidence:")`).
- **R2 upload latency:** Upload se hace antes de la transacción. Si R2 falla, `fotoEvidenciaUrl` queda null pero la marcación se crea igual.

## Mejora futura sugerida

Refactorizar la lógica compartida entre `marcar/route.ts` y `marcar-foto/route.ts` en un servicio `src/lib/marcacion-service.ts` para evitar drift. Fuera del scope de este plan.
