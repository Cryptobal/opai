# Etapa 4: Mejoras UI Pauta Mensual

**Fecha:** 2026-03-02
**Archivo principal:** `src/components/ops/OpsPautaMensualClient.tsx`

## Contexto

El componente OpsPautaMensualClient tiene ~2354 líneas. La pauta mensual muestra una grilla de turnos por puesto/guardia x día del mes. Actualmente:

- El resumen es una sola línea horizontal con total de cobertura
- Los badges de ejecución (ASI/TE/SC/PPC) usan `text-[9px]` y los de tipo de turno (D/N) usan `text-[8px]`
- El auto-sync es silencioso sin feedback visual

## Mejora 1: Resumen en 3 columnas por tipo de turno

### Estado actual (líneas 1518-1530)
Una barra horizontal mostrando:
- "Total cobertura"
- X/Y guardias
- N vacantes (amber) o "Cobertura completa" (emerald)

### Diseño propuesto
Reemplazar la barra por un grid de 3 mini-cards (`grid-cols-3`), cada una representando un tipo de turno:

| Diurnos (amber) | Rotativos (violet) | Nocturnos (indigo) |
|---|---|---|
| X/Y guardias | X/Y guardias | X/Y guardias |
| Z vacantes | Z vacantes | Z vacantes |

Debajo, mantener una línea de totales compacta.

### Cambios necesarios
1. **Expandir `shiftSummary`** (líneas 725-750): Actualmente calcula solo totales globales. Hay que agregar cálculo por `shiftType` (day/night/rotativo) usando `groupedByShiftType` y `allPuestos`.
2. **Nuevo componente de resumen**: Reemplazar el `<div className="mb-3 ...">` con un grid de 3 cards.
3. **Datos por tipo**: Para cada tipo de turno, contar puestos activos y guardias asignadas vs requeridas.

### Lógica de datos
```
Para cada shiftType en [day, rotativo, night]:
  - puestosDelTipo = allPuestos filtrados por tipo
  - requiredSlots = sum(puesto.requiredGuards) para puestos del tipo
  - assignedSlots = contar en slotAsignaciones que matcheen puestos del tipo
  - vacantes = max(0, required - assigned)
```

Se puede derivar el tipo del puesto desde `groupedByShiftType` que ya existe.

## Mejora 2: Badges más grandes

### Estado actual
- Celda: `w-7 h-7 min-w-7` (28px), texto `text-[10px]`
- Badge tipo turno (D/N): `text-[8px]`, posición `absolute -top-1 -right-1`
- Badge ejecución (ASI/TE/SC/PPC): `text-[9px]`, posición `absolute -bottom-0.5 -right-0.5`

### Diseño propuesto
- Celda desktop: `w-8 h-8` (32px), mobile mantener `w-7 h-7`
- Badge tipo turno: `text-[9px]` (+1px)
- Badge ejecución: `text-[10px]` (+1px), padding `px-1` (ya está)

### Cambios
1. Línea ~1765: `w-7 h-7 min-w-7 sm:w-8 sm:h-8` (agregar sm breakpoint)
2. Línea ~1837: `text-[8px]` → `text-[9px]`
3. Línea ~1848: `text-[9px]` → `text-[10px]`
4. Línea ~1864 (celda vacía): ajustar proporciones consistentemente

## Mejora 3: Auto-sync con feedback

### Estado actual (líneas 370-464)
Cuando `fetchedItems.length === 0`:
1. Llama silenciosamente a `/api/ops/pauta-mensual/generar` con overwrite: false
2. Si genera > 0, re-fetch
3. Sin feedback visual al usuario

### Diseño propuesto
1. **Indicador de último sync**: Agregar un `lastSyncAt` state que guarda timestamp del último fetch exitoso
2. **Texto discreto**: Junto a los controles, mostrar "Actualizado hace Xm" en `text-[10px] text-muted-foreground`
3. **Botón refresh**: Un IconButton con `RefreshCw` al lado del timestamp, que re-ejecuta `fetchPauta()`
4. **Toast de auto-generación**: Cuando la auto-generación crea registros, mostrar `toast.success("Pauta generada automáticamente para X puestos")`

### Cambios
1. Nuevo state: `const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null)`
2. En `fetchPauta` éxito: `setLastSyncAt(new Date())`
3. En auto-generación exitosa (línea ~415): agregar `toast.success(...)`
4. Nuevo componente inline junto a los filtros mostrando timestamp + botón refresh
5. Helper `timeAgo(date)` para mostrar "hace 2m", "hace 5m", etc.

## Archivos a modificar

| Archivo | Cambios |
|---|---|
| `OpsPautaMensualClient.tsx` | Resumen 3-cols, badges más grandes, auto-sync feedback |

## Riesgos

- **Resumen 3-cols**: Si no hay turnos de un tipo, esa card se puede ocultar o mostrar "0/0". Prefiero ocultarla con un fallback a 2 cols o 1 col.
- **Badges**: El aumento de 1px es conservador, no debería causar overflow visual
- **Auto-sync toast**: Solo se muestra en auto-generación, no en cada fetch normal

## No incluido en esta etapa

- Rediseño completo de la grilla
- Modo de edición inline
- Exportar a PDF/Excel
