# Rondas: 5 Mejoras — Diseño

**Fecha:** 2026-03-07
**Estado:** Aprobado

## Resumen

Cinco mejoras al modulo de rondas: fix de overlap en portal, rondas ad-hoc, quick-access en configuracion, selector de hora rapido, y fix del boton de panico.

---

## 1. Fix: Bottom nav tapa rondas al scroll

**Problema:** La `PortalBottomNav` es `fixed bottom-0` con 64px de alto. El `<main>` en `MisRondas` tiene `pb-24` (96px) que no siempre alcanza en dispositivos con safe-area-inset-bottom.

**Solucion:** Aumentar padding-bottom del main y agregar compensacion para safe-area-inset-bottom.

**Archivos:**
- `src/components/portal/rondas/MisRondas.tsx` — cambiar `pb-24` a `pb-32` + safe-area padding

---

## 2. Ronda Libre (ad-hoc, no programada)

**Flujo:**
1. En "Mis Rondas", boton "Iniciar Ronda Libre" prominente
2. POST a `/api/portal/rondas/iniciar-libre` crea una `OpsRondaEjecucion` con `isAdHoc: true`, sin template ni programacion
3. Guardia va a pantalla de ronda activa, escanea QR de checkpoints existentes sobre la marcha
4. Cada QR escaneado crea una `OpsMarcacionCheckpoint` vinculada a esa ejecucion
5. Guardia finaliza cuando quiere con boton "Completar"

**Modelo Prisma:**
- `OpsRondaEjecucion`: agregar `isAdHoc Boolean @default(false)`
- `rondaTemplateId`: hacer nullable (actualmente required)
- `programacionId`: ya es nullable

**API:**
- Nuevo: `POST /api/portal/rondas/iniciar-libre` — crea ejecucion ad-hoc
- Modificar: `/api/portal/rondas/marcar` — permitir marcacion sin template (skip validacion de orden)
- Modificar: `/api/portal/rondas/completar` — manejar caso sin template
- Modificar: `/api/ops/rondas/monitoreo` — incluir rondas ad-hoc en query

**UI Portal:**
- `MisRondas.tsx`: boton "Iniciar Ronda Libre" antes de la lista
- `RondaActiva.tsx`: funcionar sin lista fija de checkpoints, mostrar checkpoints escaneados, permitir seguir escaneando

**UI Monitor:**
- `MonitoreoGuardPanel.tsx`: badge "Ronda Libre" en cards de rondas ad-hoc
- `RondasMonitoreoClient.tsx`: manejar rondas sin template en mapCheckpoints/guardPanelData

---

## 3. Quick-access instalaciones en Configuracion

**Problema:** En la pagina de Configuracion de Rondas, cuando no hay instalacion seleccionada, solo aparece un empty state. El usuario siempre tiene que buscar en los dropdowns.

**Solucion:** Mostrar cards/chips clickeables de las instalaciones que ya tienen checkpoints configurados, con conteos de checkpoints/plantillas/programaciones. Click directo selecciona la instalacion.

**Datos:** El server page (`configuracion/page.tsx`) hace un query adicional agrupando checkpoints por installationId para obtener conteos.

**Archivos:**
- `src/app/(app)/ops/rondas/configuracion/page.tsx` — query de conteos por instalacion
- `src/components/ops/rondas/RondasConfiguracionClient.tsx` — recibir prop `installationStats`, renderizar grid de cards debajo de los selectores cuando no hay instalacion seleccionada

---

## 4. Selector de hora rapido en Programacion

**Problema:** `<input type="time">` nativo es muy lento de usar en desktop.

**Solucion:** Componente custom `QuickTimePicker`:
- Grid de botones de hora: 18:00 a 09:00 (un click selecciona hora)
- Al seleccionar hora, aparece fila de minutos: :00, :15, :30, :45
- Muestra hora seleccionada como texto editable por si necesitan valor custom
- Default: horaInicio=21:00, horaFin=08:00

**Archivos:**
- Nuevo: `src/components/ops/rondas/QuickTimePicker.tsx`
- Modificar: `src/components/ops/rondas/programacion-form.tsx` — reemplazar `<Input type="time">` por `QuickTimePicker`, cambiar defaults a 21:00/08:00

---

## 5. Fix: Boton de panico sin ejecucion activa

**Problema:** Cuando el guardia no tiene ronda activa (`ejecucionId` es null):
- La API solo crea un `OpsRondaIncidente` pero NO crea `OpsAlertaRonda` (linea 72: `if (ejecucionId)`)
- El GPS tiene timeout de 10s sin feedback visual, parece que no pasa nada

**Solucion:**
- Hacer `ejecucionId` nullable en `OpsAlertaRonda` para permitir alertas de panico sin ronda activa
- Siempre crear la alerta, con o sin ejecucion
- Agregar feedback visual inmediato (spinner/texto "Obteniendo ubicacion...") antes de esperar GPS
- Reducir GPS timeout a 5s

**Archivos:**
- `prisma/schema.prisma` — `OpsAlertaRonda.ejecucionId` nullable
- `src/app/api/portal/rondas/panico/route.ts` — crear alerta siempre
- `src/components/portal/rondas/PanicoModal.tsx` — feedback visual durante GPS wait
