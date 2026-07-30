# Productividad — contrato visual

Contrato vinculante para la superficie **Productividad**: Inicio (Mi día), Correos, Tareas, Agenda, Tickets y Auditoría. La simetría no depende de disciplina sino de arquitectura: los seis módulos consumen las mismas primitivas de `@/components/opai-ds` y solo tokens DS v3.

Tareas es el **módulo de referencia**. El resto se alinea a él.

Fuente de verdad tipográfica/visual del DS: `/opai-ds-playground` (sección Productividad).

---

## 1. Tokens

| Uso | Token |
|---|---|
| Superficie card / toolbar | `bg-ds-surface-1` … `bg-ds-surface-4` |
| Texto | `text-ds-text-1` … `text-ds-text-4` |
| Bordes | `border-ds-border-default` / `border-ds-border-subtle` |
| Estado | `status-ok-*` · `status-warn-*` · `status-danger-*` · `status-info-*` |
| Acento de marca | `--primary` / `bg-primary` / `text-primary` (inyectado por tenant; **nunca** un naranja literal) |
| Glass móvil | `--glass-*` / `opai-glass-*` |

**Prohibido:** hex hardcodeados en la superficie Productividad, con la única excepción de `src/components/crm/correos/signature/SignaturePreview.tsx` (y helpers de HTML de firma): generan HTML para clientes externos donde las CSS custom properties no funcionan.

Para librerías que no aceptan CSS vars (Recharts, Leaflet): `useThemeColors` / `resolveCSSVarColor` en `src/lib/theme/resolveColor.ts`.

---

## 2. Anatomías

### ModuleToolbar

Una sola fila superior, mismo orden en todos los módulos:

```
[segmentado de vistas] [búsqueda] · · · [filtros secundarios] [una única acción primaria]
```

- Sin títulos grandes: la identidad del módulo vive en el topbar/riel.
- En iPad (~1024px, dos paneles) los labels del segmentado se truncan antes de desbordar.
- Implementación canónica: `PageToolbar` + `SegmentedControl` (+ `FilterPopover` cuando aplica).

### StatStrip

KPIs vía `Stat` / `StatGrid`: contenedor neutro, valor y glow con color semántico, clic filtra. Patrón vigente en Tareas. En listas densas (Tickets/Correos) el `SegmentedControl` con conteos cumple el rol de atajos filtrables.

### EntityRow

Anatomía única de fila:

```
[control] [título 13px] [chips de contexto] [responsable] [fecha] [acciones al hover]
```

Alto mínimo 44px. Touch targets ≥44px en móvil.

### Detalle

Panel lateral en desktop, sheet en móvil. `EmptyState` cuando no hay selección.

### Móvil

Cascada glass (`--glass-*`), isla inferior, FAB para la acción primaria, `env(safe-area-inset-bottom)`.

---

## 3. Catálogo de chips (`Tag`)

| Dominio | Variantes |
|---|---|
| Fechas | `danger` (vencida) · `brand` (hoy) · neutro |
| Prioridad | P1 → `danger` · P2 → `warn` · P3/P4 → `neutral` |
| SLA | `danger` / `warn` / `ok` (+ `MetricBar` con threshold explícito) |
| Estado / origen | semánticas del dominio |
| IDs y acciones de auditoría | `neutral` + `font-mono` |

---

## 4. Primitivas de estado (no navegación)

| Primitiva | Rol |
|---|---|
| `SegmentedControl` | Segmentado de **estado** (no `href`). Activo: `bg-primary text-primary-foreground`. |
| `FilterChipsBar` | Chips activos removibles + «Limpiar todo». Devuelve `null` si está vacío. |
| `FilterPopover` | Filtros agrupados; variante `sheet` en móvil con safe-area. |

`SwipeTabs` / `SubNav` / `ModuleSubNav` siguen siendo para **navegación** por rutas.

---

## 5. Reglas de propagación

1. **Una primitiva, seis módulos.** Si se ajusta `SegmentedControl`, `FilterChipsBar`, `FilterPopover`, `Stat`, `Tag` o `MetricBar`, el cambio se propaga a Productividad en el mismo deploy.
2. **Cero hex** fuera de `signature/` (HTML de email).
3. **Acento = `--primary`.** Nunca hardcodear el naranja (ni ningún color de marca).
4. **Solo presentación.** Este contrato no autoriza cambios de queries, permisos, modelos ni endpoints. La única excepción funcional aprobada es la reorganización del selector de filtros de Correos (vista rápida + popover de asociaciones).

---

## 6. Módulos

| Módulo | Ruta | Notas |
|---|---|---|
| Inicio | `/productividad/inicio` | Tres tarjetas (Agenda, Correos, Tareas) con cabecera/densidad comunes |
| Correos | `/crm/correos` | Segmentado Todos · No leídos · Con tareas; Filtros con 4 asociaciones |
| Tareas | `/opai/tareas` | Referencia — no rediseñar |
| Agenda | `/opai/agenda` | ModuleToolbar + fila móvil alineada |
| Tickets | `/ops/tickets` | SegmentedControl + FilterChipsBar + Tag + MetricBar (SLA) |
| Auditoría | `/opai/auditoria-productividad` | ModuleToolbar con GET (`q`, `action`, `domain`) intactos |
