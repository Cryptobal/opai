# Supervision Module v2 — Design Document

**Date:** 2026-03-03
**Status:** Approved

## Overview

Mejoras al módulo de supervisión: grilla con sorting y conteo, wizard con observaciones + auto-hallazgos + hallazgos en evidencia, encuesta cliente persistida en CRM, y fixes varios (dedup sugerencias, quick-create, dashboard cleanup).

---

## Bloque A: Grilla + Dashboard + Historial

### A1. Grilla — columna "Visitas" + sorting

- Nueva columna al final: **"Vis."** con total de visitas del mes por instalación
- API `grilla/route.ts`: calcular `totalVisits` sumando visitas de todos los días
- Sorting client-side: A-Z (default), más visitas ↓, menos visitas ↑
- Dropdown o toggle buttons en la UI

### A2. Dashboard — quitar "Últimas visitas"

- Eliminar bloque `<Card>` "Últimas visitas" (líneas 362-415 de `SupervisionDashboardEnhanced.tsx`)
- Dashboard queda: KPIs + Tendencia semanal + Calificaciones + Alertas + Rendimiento supervisores

### A3. Historial — fix sugerencias de ruta

- **Dedup**: `new Map(assignments.map(a => [a.installationId, a])).values()`
- **"Sin visita este mes"** en lugar de "Nunca visitada" all-time: query visitas del mes actual

---

## Bloque B: Quick-create

### B1. Menú (+) — agregar "Nueva Visita"

- Agregar a `QUICK_CREATE_ITEMS` en `TopbarActions.tsx`
- También agregar en menú mobile de `AppShell.tsx`
- `{ label: "Nueva Visita", icon: Activity, navigateHref: "/ops/supervision/nueva-visita" }`

---

## Bloque C: Wizard (5 cambios)

### C1. Step 1 — quitar contador guardias

- Eliminar "Guardias presentes: X de Y esperados" y input numérico
- Mantener lista de dotación (nombres, puestos, turnos)
- Eliminar `guardsExpected`/`guardsFound` del PATCH y checkout
- Quitar "Guardias: X/Y" del resumen en Step 5

### C2. Step 2 — textarea observaciones

- Cuando `installationState` es "incidencia" o "critico" → textarea
- Nuevo campo: `installationStateNotes: string`
- Se guarda en PATCH junto con `installationState`
- Aparece en resumen Step 5

### C3. Step 3 — flujo documentos (Contrato, OS10, Libro Novedades)

Para cada documento:
```
¿Presente? [Sí] [No]

Si Sí:
  → Fecha última entrada: [date input]
  → Foto última página: [camera] (obligatoria)

Si No:
  → Auto-crear hallazgo:
    category: "documentation"
    severity: "critical"
    description: "{Nombre} no presente"
  → Auto-crear ticket (lógica existente)
  → Toast: "Hallazgo creado — Ticket #XXX generado"
```

### C4. Step 4 — ingresar hallazgos en evidencia

- Mantener fotos por categoría (mandatory + optional)
- Agregar sección: "¿Registrar hallazgo?" → botón [Sí, agregar hallazgo]
- Si Sí → `FindingModal` (ya existe) con descripción + foto opcional
- Lista de hallazgos con badge "Ticket #XXX"
- Botón "Agregar otro hallazgo" para múltiples

### C5. Step 5 — mejoras cierre y resumen

- Comentarios generales ya existen, asegurar que aparezcan en resumen
- Quitar "Guardias: X/Y" del resumen
- Agregar `installationStateNotes` al resumen
- Quitar referencia a guardias en express

---

## Bloque D: Encuesta cliente → CRM

### D1. Nuevo modelo Prisma

```prisma
model OpsEncuestaCliente {
  id                     String   @id @default(uuid_generate_v4())
  tenantId               String
  visitId                String   @db.Uuid @unique
  installationId         String   @db.Uuid
  accountId              String?  @db.Uuid
  contactName            String
  contactRole            String?
  serviceQuality         Int?
  scheduleCompliance     Int?
  personalPresentation   Int?
  professionalism        Int?
  supervisionPresence    Int?
  incidentResponse       Int?
  hasUrgentRisk          Boolean?
  urgentRiskDetail       String?
  npsScore               Int?
  additionalComments     String?
  signatureUrl           String?
  clientPhotoUrl         String?
  averageScore           Float?
  createdAt              DateTime @default(now())

  visit        OpsVisitaSupervision
  installation CrmInstallation
  account      CrmAccount?
}
```

### D2. Guardar en checkout

- Al finalizar visita con `clientContacted === true`, crear `OpsEncuestaCliente`
- Vincular `accountId` via `installation.accountId`

### D3. Mostrar en CRM

- Account detail: nueva sección "Encuestas Cliente" en `AssociatedRecordsPanel`
- Installation detail: misma sección
- Tarjeta: fecha, promedio, NPS, contacto, link a visita
- Expandir: respuestas completas + firma

---

## Archivos impactados

| Bloque | Archivos |
|--------|----------|
| A | `SupervisionGrilla.tsx`, `grilla/route.ts`, `SupervisionDashboardEnhanced.tsx`, `historial/page.tsx` |
| B | `TopbarActions.tsx`, `AppShell.tsx` |
| C | `Step1CheckIn.tsx`, `Step2Evaluation.tsx`, `Step3Checklist.tsx`, `Step4Evidence.tsx`, `Step5Closure.tsx`, `SupervisionVisitWizard.tsx`, `types.ts` |
| D | `schema.prisma`, migration, `checkout/route.ts`, `CrmAccountDetailClient.tsx`, installation detail |
