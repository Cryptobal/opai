# Rondas UX Improvements — Design Doc

**Date:** 2026-03-04
**Status:** Approved

## Overview

Two blocks of improvements to the rondas system:
- **Block A:** Portal del Guardia bug fixes (tolerance, incidents modal, incident visibility)
- **Block B:** Configuration UX refactoring (intuitive for non-technical users)

---

## Block A: Portal del Guardia Fixes

### A1. Fix tolerance/atrasada classification

**Problem:** All pending rondas show "Iniciar Ronda" regardless of time. Past-due rondas should be "ATRASADAS" with red styling.

**Fix:** In `MisRondas.tsx` grouping logic, add an atrasada check:
```
if status == "pendiente":
  if now > scheduledAt + toleranceMs → ATRASADA (red button "Iniciar Ronda (Atrasada)")
  elif now >= scheduledAt - toleranceMs → LISTA (green button "Iniciar Ronda")
  else → PRÓXIMA (no button, countdown only)
```

The current code only checks `now >= scheduledMs - toleranceMs` which is true for both atrasadas and listas.

### A2. Incident modal over map (full-screen overlay)

**Problem:** ReportarIncidente opens at same z-level as map, requiring manual collapse.

**Fix:** Change ReportarIncidente to full-screen modal with `z-[60]` (above map z-50), opaque `bg-black/90` backdrop, internal scroll. Map stays behind, invisible. Close returns to map as-is.

### A3. Incidents visible in Ops

**Problem:** Guard-reported incidents stored in `OpsRondaIncidente` but invisible in ops UI.

**Fix:** In the Monitor tab, show incident badges on ronda cards. In ronda detail view, show associated incidents with tipo, description, photo, location, timestamp.

---

## Block B: Configuration UX Refactoring

### B1. Installation summary panel

After selecting installation, show a summary card above tabs:
- Count of checkpoints, templates, active programaciones
- Next scheduled ronda time
- If nothing configured: show step-by-step wizard prompt ("Paso 1: Checkpoints → Paso 2: Plantilla → Paso 3: Programación")

### B2. Checkpoint instructions field

Add `instrucciones` text field to checkpoint creation/edit. Guards see this in the portal when marking the checkpoint. Example: "Verificar puerta de emergencia cerrada. Revisar cámara #3."

Requires:
- Schema migration: add `instrucciones` column to `OpsRondaCheckpoint`
- API: accept/return field
- Portal: show in CheckpointMarker bottom sheet

### B3. Template editing UI

Add "Editar" button to template cards. Opens same form pre-filled with current values. API PATCH already exists at `/api/ops/rondas/templates/[id]`.

### B4. Inline descriptions instead of tooltips

Replace tooltip icons with visible helper text below each field:
- **Frecuencia:** "Cada cuántos minutos se genera una ronda. Ej: 120 = cada 2 horas."
- **Tolerancia:** "Minutos antes de la hora en que el guardia puede iniciar. Después se marca como atrasada."
- **Duración estimada:** "Tiempo aproximado para completar la ronda. Se muestra al guardia."
- **Modo de orden:** "Flexible: checkpoints en cualquier orden. Secuencial: deben seguirse en orden."

### B5. Programación editing + remove "Generar 24h"

- Add "Editar" button for programaciones (API PATCH exists)
- **Remove "Generar 24h" button** from UI — confusing for users
- Auto-generate executions when creating a new active programación (call `buildScheduleSlots` + `createMany` in the POST handler)
- Cron handles ongoing generation every 10 minutes

### B6. Auto-generation on programación create

When POST `/api/ops/rondas/programacion` creates a new active programación, immediately generate executions for today+tomorrow. Guard sees rondas instantly without manual intervention.

---

## Files to modify

### Block A
- `src/components/portal/rondas/MisRondas.tsx` — fix grouping logic
- `src/components/portal/rondas/ReportarIncidente.tsx` — full-screen modal
- `src/components/portal/rondas/RondaActiva.tsx` — adjust incident button behavior
- `src/components/ops/rondas/RondasMonitorClient.tsx` — add incident display (if exists)

### Block B
- `prisma/schema.prisma` — add `instrucciones` to checkpoint model
- `src/components/ops/rondas/RondasConfiguracionClient.tsx` — summary panel, template edit, programacion edit, remove "Generar 24h", inline descriptions
- `src/components/ops/rondas/programacion-form.tsx` — inline descriptions
- `src/components/ops/rondas/ronda-template-form.tsx` — inline descriptions, edit mode
- `src/components/ops/rondas/CheckpointMapCreator.tsx` — instructions field
- `src/app/api/ops/rondas/programacion/route.ts` — auto-generate on create
- `src/app/api/ops/rondas/checkpoints/route.ts` — accept instrucciones
- `src/app/api/portal/rondas/mis-rondas/route.ts` — return instrucciones
- `src/components/portal/rondas/CheckpointMarker.tsx` — show instrucciones
