# Etapa 2: Auto-Continuación de Series — Pauta Mensual

**Fecha:** 2026-03-02
**Módulo:** Ops > Pauta Mensual

## Problema

Cuando un usuario navega a un mes nuevo, el sistema auto-genera rows vacíos para
puestos activos pero NO proyecta las series activas. Las celdas quedan sin
`shiftCode` (ni "T" ni "-") y el usuario debe re-pintar cada serie manualmente.

## Solución: Lazy Auto-Projection

Enfoque elegido: **Lazy** — al abrir un mes nuevo, el GET de `pauta-mensual`
detecta series activas sin pintar y las proyecta automáticamente.

### Cambios

1. **Mover `generateSerieForMonth`** de `pintar-serie/route.ts` a `ops.ts`
   - Función pura, sin side-effects
   - Reutilizada por `pintar-serie` (creación manual) y por el GET (auto-projection)

2. **Agregar paso de auto-projection** en `pauta-mensual/route.ts` GET
   - Después del auto-sync de rows faltantes (ya existente)
   - Antes de retornar datos
   - Solo actualiza celdas con `shiftCode IS NULL` (no sobreescribe ediciones manuales)

### Reglas de negocio

- Solo se proyectan series con `isActive = true`
- Solo se llenan celdas con `shiftCode = null` (preserva "V", "L", "P" manuales)
- La matemática del ciclo es inherente a `generateSerieForMonth`: usa `daysDiff`
  desde `startDate` original, funciona para cualquier mes futuro
- Si hay `OpsAsignacionGuardia` activa para el slot, se asigna `plannedGuardiaId`
  en días de trabajo ("T"); en descanso ("-") se deja null
- Idempotente: si ya están pintados, no hace nada

### Flujo GET actualizado

```
GET /api/ops/pauta-mensual?installationId=X&month=4&year=2026
  1. Fetch pauta existente                    ← ya existe
  2. Auto-sync rows faltantes                 ← ya existe
  3. ★ Auto-project series activas            ← NUEVO
  4. Fetch series, asignaciones, asistencia   ← ya existe
  5. Return response                          ← ya existe
```

### Impacto

- 0 cambios en UI
- 0 nuevos endpoints
- 1 función movida a ops.ts
- ~30-40 líneas nuevas en route.ts
- Idempotente y seguro

## Plan de implementación

### Paso 1: Mover `generateSerieForMonth` a `ops.ts`
- Copiar función de `pintar-serie/route.ts` líneas 18-44
- Exportarla desde `ops.ts`
- En `pintar-serie/route.ts`: eliminar función local, importar desde ops

### Paso 2: Agregar auto-projection en GET de `route.ts`
- Después del bloque de auto-sync (createMany de missingRows)
- Fetch series activas para los puestos de la instalación
- Para cada serie: generar shiftCodes con `generateSerieForMonth`
- Fetch asignaciones activas para plannedGuardiaId
- Batch update celdas donde shiftCode IS NULL

### Paso 3: Verificar
- Grep que no queden referencias rotas
- Confirmar que pintar-serie sigue funcionando (importa desde ops)
- Confirmar que GET sin series activas no se rompe
