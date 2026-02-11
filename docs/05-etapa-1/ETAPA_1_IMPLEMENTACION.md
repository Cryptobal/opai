# ETAPA 1 — Plan Maestro de Implementación

## Ops + TE + Personas (MVP)

> **Versión:** 1.1  
> **Fecha:** 2026-02-11  
> **Fuente de verdad:** `docs/00-product/MASTER_SPEC_OPI.md`  
> **Estado:** Implementada (MVP v1 en repositorio)

---

## A) Resumen ejecutivo

La Fase 1 habilita la operación diaria mínima de guardias:

1. **Ops**: estructura de puestos, pauta mensual y asistencia diaria.
2. **TE y pagos**: generación de turnos extra, aprobación RRHH y lote de pago.
3. **Personas**: ficha de guardia, flags y lista negra básica.

El repositorio ahora incluye implementación funcional de Fase 1 en DB, APIs y UI para operación mínima.

---

## B) Baseline actual (revisión 2026-02-11 — posterior a implementación)

| Componente Fase 1 | Estado actual |
|-------------------|---------------|
| Modelos Prisma (`ops/personas/te`) | ✅ Implementados en `prisma/schema.prisma` + migración `20260223000000_phase1_ops_te_personas` |
| APIs `/api/ops/*` y `/api/te/*` | ✅ Implementadas (pauta, asistencia, TE, lotes, exportación) |
| UI `/ops/*`, `/personas/*`, `/te/*` | ✅ Implementadas (dashboard, pauta mensual/diaria, PPC, registro/aprobaciones/lotes/pagos, guardias/lista negra) |
| Integración con instalaciones | ✅ Existe `crm.CrmInstallation` reutilizable |
| Roles base (owner/admin/editor/viewer) | ✅ Operativo con acceso Ops para owner/admin |

---

## C) Alcance MVP de Fase 1

### Incluye

- Esquema de datos `ops` con tablas core de Ops + TE + Personas.
- Generación/guardado de pauta mensual por instalación.
- Vista y edición de asistencia diaria.
- Creación automática de TE cuando hay reemplazo.
- Flujo básico de aprobación y pago de TE.
- Ficha de guardia y lista negra mínima.

### No incluye

- Postventa y tickets (Fase 2).
- Portal guardias y solicitudes RRHH (Fase 3).
- Inventario (Fase 4).
- Integraciones externas de asistencia (Fase 5).

---

## D) Estado por iteraciones (ejecutado)

### D.1) F1-01 — Fundación de datos y contratos API (prioridad inmediata)

**Objetivo:** dejar habilitado el dominio Ops/TE/Personas a nivel de base de datos y contratos backend.

**Entregables:**

- Agregar schema `ops` en Prisma datasource.
- Crear modelos base:
  - `puesto_operativo`
  - `pauta_mensual`
  - `asistencia_diaria`
  - `evento_rrhh`
  - `turno_extra`
  - `pago_te_lote`
  - `pago_te_item`
  - `persona`
  - `guardia`
  - `guardia_flag`
  - `documento_persona`
  - `cuenta_bancaria`
  - `comentario_guardia`
- Definir contratos mínimos de API:
  - `GET/POST /api/ops/pauta-mensual`
  - `POST /api/ops/pauta-mensual/generar`
  - `GET/PATCH /api/ops/asistencia`
  - `GET /api/te`
  - `PATCH /api/te/:id/aprobar`
  - `PATCH /api/te/:id/rechazar`
- Registrar auditoría mínima de acciones críticas.

**Criterios de aceptación F1-01:**

- Migración aplicada con tablas e índices base de Fase 1.
- Endpoints responden 200/4xx correctos con validación de payload.
- Sin regresiones en módulos productivos existentes.

**Estado:** ✅ Completado

### D.2) F1-02 — UI Pauta mensual + Asistencia diaria

**Objetivo:** habilitar operación diaria en interfaz.

**Entregables:**

- Página `/ops/pauta-mensual` con generación y guardado por instalación/mes.
- Página `/ops/pauta-diaria` con estado de asistencia por fecha.
- Acción de reemplazo en asistencia diaria.

**Criterios de aceptación:**

- Se puede guardar pauta mensual.
- Se puede marcar asistencia/no asistencia/reemplazo.
- La operación queda persistida y auditada.

**Estado:** ✅ Completado

### D.3) F1-03 — Flujo TE y pagos

**Objetivo:** cerrar ciclo de aprobación y pago de turnos extra.

**Entregables:**

- Página `/te/registro` con listado y filtros.
- Página `/te/aprobaciones` para RRHH.
- Página `/te/lotes` y `/te/pagos` para lote semanal y marcado de pago.

**Criterios de aceptación:**

- Reemplazo en asistencia genera TE pendiente.
- RRHH puede aprobar/rechazar.
- Se puede crear lote y marcar ítems pagados.

**Estado:** ✅ Completado

### D.4) F1-04 — Personas/Guardias MVP

**Objetivo:** consolidar ficha operativa mínima de guardias.

**Entregables:**

- Página `/personas/guardias` con ficha básica.
- Página `/personas/lista-negra` con alta/baja auditada.
- Flags operacionales y comentarios por guardia.

**Criterios de aceptación:**

- Guardia en lista negra no puede ser asignado en pauta/TE.
- Historial mínimo de cambios disponible.

**Estado:** ✅ Completado

---

## E) Recomendación de continuidad inmediata

Con MVP v1 de Fase 1 implementado, el siguiente bloque recomendado es **hardening + QA**:

1. Tests unitarios para reglas de negocio de asistencia/TE.
2. Tests e2e de flujos críticos (pauta → reemplazo → TE → lote → pago).
3. Ajustes UX en móviles de Ops/TE/Personas.
4. Definición de roles operacionales (`rrhh`, `operaciones`, `reclutamiento`) para acceso fino.
5. Inicio de Fase 2 (Postventa + Tickets) usando el plan de `docs/06-etapa-2/`.

---

## F) Dependencias y decisiones abiertas

1. Confirmar nombres finales de tablas/modelos para dominio `ops`.
2. Confirmar expansión de RBAC para roles operacionales específicos.
3. Confirmar reglas de exportación bancaria por banco adicional a Santander.

---

## G) Referencias

- `docs/00-product/MASTER_SPEC_OPI.md`
- `docs/02-implementation/ESTADO_GENERAL.md`
- `docs/06-etapa-2/ETAPA_2_IMPLEMENTACION.md`
