# OPAI Refined Industrial — Design System Reference

> **Status**: piloto entregado en módulo Inventario (Q2 2026).
> El módulo de inventario es la **referencia visual canónica**. Cuando
> migremos otro módulo (Rondas, Acceso, Finanzas, ATS, Asistencia, etc.)
> usamos inventario como medida de calidad.

---

## 1. Filosofía

**Refined Industrial** = ERP serio con personalidad. No "fintech genérico"
ni "dashboard arcoíris". Tres principios:

1. **Datos en mono, narración en sans.** Precios, stock, SKUs, fechas,
   timestamps, IDs van en `font-mono tabular-nums`. Texto humano
   (títulos, descripciones, labels) en sans.
2. **Tono solo donde aporta.** El módulo tiene un tono dominante
   (Inventario = `emerald`); las variantes semánticas (`ok`/`warn`/
   `danger`/`info`) van solo donde el estado es real, no como decoración.
3. **Mobile-first real.** Cada componente se diseña pensando en `<375px`
   y crece hacia arriba con breakpoints. NO al revés.

---

## 2. Tokens

### 2.1 Color (CSS variables)

Definidos en `src/styles/globals.css`. Todos en HSL para compatibilidad
con el DS v3 existente.

#### Surfaces (5 niveles de elevación)

```css
--ds-surface-0  /* canvas / page bg */
--ds-surface-1  /* card primaria */
--ds-surface-2  /* card elevada / popover */
--ds-surface-3  /* sticky header / dialog top */
--ds-surface-4  /* menu / tooltip */
```

Uso Tailwind: `bg-ds-surface-{0..4}`.

#### Texto (4 niveles)

```css
--ds-text-1  /* primary */
--ds-text-2  /* body / labels fuertes */
--ds-text-3  /* secondary / metadata */
--ds-text-4  /* tertiary / placeholders */
```

Uso: `text-ds-text-{1..4}`.

#### Borders (3 pesos)

```css
--ds-border-subtle    /* dividers, table rows */
--ds-border-default   /* cards, inputs */
--ds-border-strong    /* focus, hover */
```

#### Status (semántico — ok/warn/danger/info)

Cada uno expone `{base, fg, soft, border}`:

```
bg-status-{kind}-soft     /* fondo tinte */
text-status-{kind}-fg     /* texto/ícono sobre el soft */
border-status-{kind}-border  /* borde sobre el soft */
```

#### Categorical tints (no semánticos)

Para `IconTile` y agrupaciones visuales SIN significado de estado.
Cada uno tiene par container + foreground:

| Tono | Uso típico |
|---|---|
| `tint-violet` / `tint-violet-fg` | Categorías abstractas, configuración |
| `tint-rose` / `tint-rose-fg` | Personas, RRHH |
| `tint-amber` / `tint-amber-fg` | Documentos, contratos |
| `tint-emerald` / `tint-emerald-fg` | **Inventario (módulo pilot)** |
| `tint-sky` / `tint-sky-fg` | Comunicación, links externos |
| `tint-teal` / `tint-teal-fg` | Operaciones primarias |

⚠️ **No mezclar con status**. `tint-amber` ≠ `status-warn-soft`. El primero
es categórico, el segundo es estado real.

### 2.2 Radios

`rounded-ds-{sm,md,lg,xl,pill}` → 6/10/14/20/999 px.

Reglas:
- `sm` (6px): badges, tags, pills chicos
- `md` (10px): inputs, botones default, contenedores tonales
- `lg` (14px): cards, dialogs, sheets
- `xl` (20px): hero, empty states grandes
- **No mezclar más de 2 radios distintos en el mismo componente.**

### 2.3 Shadows

`shadow-ds-{xs,sm,md,lg}` con valores reforzados en dark mode (más opacidad).
En dark, **siempre acompañar shadow con border** porque la sombra sola
desaparece sobre fondos oscuros.

### 2.4 Tipografía

```ts
import { TYPE_SCALE } from "@/lib/design-system/tokens";
```

- `text-xs` (12/16) — captions, metadata
- `text-sm` (14/20) — body por defecto en tablas y formularios
- `text-base` (16/24) — body en mobile
- `text-lg` (18/28) — títulos de card
- `text-xl` (20/28) — títulos de sección
- `text-2xl` (24/32) — títulos de página
- `text-3xl` (30/36) — solo dashboards/empty states

**Pesos**: 400 body, 500 labels y nav, 600 headings con `tracking-tight`.

**Familias**:
- `font-sans` → Inter Variable (default body)
- `font-display` → Outfit Variable (Hero titles)
- `font-mono` → Geist Mono Variable (datos numéricos), JetBrains fallback

### 2.5 Motion

`src/lib/motion.ts`:
- `motion.duration.{fast: 150, base: 200, slow: 300}`
- `motion.easing.{standard, emphasized}`
- `MOTION_CLASS.duration.{fast,base,slow}` → clases Tailwind canónicas

**Prohibido fuera del DS**: `transition-all`. Usar transiciones específicas:
`transition-colors duration-200 ease-[cubic-bezier(0.2,0,0,1)]`.

`prefers-reduced-motion: reduce` ya está cubierto en globals.css.

---

## 3. Componentes (catálogo `src/components/opai-ds/`)

| Componente | Cuándo usarlo |
|---|---|
| `<PageHero icon iconTone title eyebrow description actions/>` | Header de toda página principal del módulo |
| `<Breadcrumbs items/>` | Migas estandalone (PageHero ya las incluye via `eyebrow`) |
| `<Surface elevation padding hoverable/>` | Card base. NO crear divs con border+rounded a mano |
| `<KPICard icon iconTone label value hint trend/>` | KPI dashboard con IconTile prominente arriba (Refined Industrial) |
| `<Stat label value icon variant/>` | KPI clásico con icon top-right + accent lateral. Coexiste con KPICard |
| `<IconTile icon variant tone size/>` | Squircle con ícono. **Único lugar para íconos coloreados** |
| `<Tag variant size>` | Badge de estado o categoría |
| `<StatusDot kind pulse/>` | Punto coloreado pequeño para indicar estado |
| `<DataView columns rows mobile/>` | Tabla en `>=md`, cards en `<md`, mismo schema |
| `<DataTable columns rows/>` | Tabla pura sin transformación mobile |
| `<EmptyState icon title description tone/>` | Estado vacío con CTA |
| `<Spinner block label/>` | Loading async |
| `<Skeleton/>` | Skeleton para listas y tablas (preferir sobre Spinner para listas) |

### 3.1 PageHero — patrón canónico

```tsx
<PageHero
  icon={Package}                              // LucideIcon
  iconTone="emerald"                          // tono del módulo
  eyebrow={["Operaciones", "Inventario"]}     // breadcrumb-like
  title="Tu operación"
  subtitle="en una sola vista"                // segunda línea atenuada
  description="Stock, movimientos y costo asignado."
  actions={<Button>...</Button>}
/>
```

### 3.2 KPICard — diseño Refined Industrial

```tsx
<KPIGrid lgCols={4}>
  <KPICard
    icon={Package}
    iconTone="emerald"          // o iconVariant="brand|ok|warn|danger|info|neutral"
    label="Stock total"
    value={12847}                // number → animable, formato es-CL automático
    trend={4.2}                  // delta opcional con flecha + color
    hint="unidades en bodega"
    animate                       // count-up animation
  />
</KPIGrid>
```

### 3.3 DataView — tabla → cards mobile

```tsx
const columns: DataViewColumn<Row>[] = [
  { id: "name",    header: "Producto",  cell: (r) => r.name,   mobile: "primary" },
  { id: "stock",   header: "Stock",     cell: (r) => r.stock,  mobile: "field", align: "right" },
  { id: "warehouse", header: "Bodega",  cell: (r) => r.wh,     mobile: "secondary" },
  { id: "status",  header: "Estado",    cell: (r) => <Tag/>,   mobile: "badge" },
];

<DataView
  columns={columns}
  rows={data}
  rowKey={(r) => r.id}
  rowVariant={(r) => r.alert ? "warn" : "default"}
  onRowClick={(r) => navigate(r.id)}
  empty={<EmptyState .../>}
/>
```

Roles mobile: `primary` (título), `secondary` (subtítulo), `badge` (tag derecha),
`leading` (IconTile izquierda), `field` (par label-valor), `footer`, `hidden`.

### 3.4 IconTile

```tsx
<IconTile icon={Smartphone} tone="emerald" size="md" />        // categórico
<IconTile icon={AlertTriangle} variant="danger" size="md" />   // semántico
```

Sizes: `sm` (32px), `md` (40px), `lg` (48px), `xl` (64px). StrokeWidth Lucide: 1.75.

---

## 4. Reglas de migración (checklist por módulo)

Cuando migremos otro módulo (ej. Rondas), el flujo es mecánico:

### Pre-flight

- [ ] Agregar el prefijo del módulo a `MIGRATED_PATHS` en `scripts/check-design-system.mjs`.
  Esto activa el guard pre-commit que rechaza arbitrarios.
- [ ] Decidir el **tono del módulo** (1 tinte categórico). Sugerencias:
  - Inventario → emerald (✓ asignado)
  - Rondas → sky
  - Acceso → violet
  - Finanzas → amber
  - ATS / Personas → rose
  - Asistencia → teal

### Por vista

1. **Page**: importar `PageHero` de `@/components/opai-ds`. Setear
   `icon={LucideIcon}` + `iconTone="<tono-del-módulo>"` + `eyebrow={["Sección", "Módulo", "Vista"]}`.
2. **Container**: `<section className="relative w-full pb-32 space-y-6">`.
3. **Substituir** `<table>` raw → `<DataView>`. Listas de cards manuales →
   `<Surface elevation={1} padding="md">`.
4. **KPIs**: `<KPIGrid>` + `<KPICard>` (preferido en landing pages) o
   `<StatGrid>` + `<Stat>` (para vistas operativas).
5. **Dialogs**: ya son responsive (bottom-sheet automático en mobile).
   Si tienen forms grandes, usar `<Sheet>` directamente con side="right".
6. **Tipografía**:
   - `text-[12px]` → `text-xs`
   - `text-[13px]/[14px]` → `text-sm`
   - `text-[15px]` → `text-base`
   - Datos numéricos → agregar `font-mono tabular-nums`
7. **Estados**: usar `Tag variant={ok|warn|danger|info|neutral}` para badges de
   estado real. Para categorías, usar `IconTile tone={...}` arriba de la card.
8. **Empty states**: `<EmptyState icon={...} title="..." description="..." />`
   con CTA. Cero listas vacías sin hint.

### Verificación

```bash
node scripts/check-design-system.mjs --all
```

Cero violaciones en archivos del nuevo módulo. Si hay falsos positivos
(ej: identidad de marca de terceros), agregar `// @ds-allow-legacy <razón>`
en la primera línea del archivo y mover los colores hardcoded a un constante
centralizado (ver `src/lib/inventory/carrier-colors.ts` como ejemplo).

---

## 5. Anti-patterns

### ❌ Cosas que NO hacer

```tsx
// NO: tipografía arbitraria
<p className="text-[14px]">…</p>

// SÍ:
<p className="text-sm">…</p>

// NO: colores hardcoded
<span className="text-emerald-500">activo</span>

// SÍ:
<Tag variant="ok">Activo</Tag>

// NO: borders shadcn raw en módulos migrados
<div className="border border-border">…</div>

// SÍ:
<div className="border border-ds-border-default">…</div>

// NO: focus rings translúcidos
<input className="focus:ring-primary/20" />

// SÍ:
<input className="focus-visible:ring-1 focus-visible:ring-ring" />

// NO: opacity sobre status colors
<p className="text-status-warn-fg/80">…</p>  // pierde legibilidad en dark

// SÍ:
<p className="text-status-warn-fg">…</p>

// NO: text-muted-foreground (token shadcn) cuando hay DS token
<p className="text-muted-foreground">…</p>

// SÍ:
<p className="text-ds-text-3">…</p>

// NO: emojis en código
{success ? "✓" : "✗"}

// SÍ:
{success ? <Check className="h-4 w-4 text-status-ok-fg" /> : <X className="h-4 w-4 text-status-danger-fg" />}

// NO: Dialog centrado siempre (rompe en mobile)
<DialogContent className="max-w-md">…</DialogContent>

// SÍ: el componente Dialog del DS ya es responsive — bottom-sheet en
// <sm, centered en >=sm. NO override de la posición.

// NO: <table> raw sin transformación mobile
<table>…</table>

// SÍ:
<DataView columns={...} rows={...} rowKey={...} />
```

### ⚠️ Decisiones discutibles

- **Stat vs KPICard**: Stat tiene icon top-right + accent lateral. KPICard
  tiene IconTile prominente arriba. Para landing pages del módulo (overview),
  preferir KPICard. Para vistas operativas con muchos KPIs en línea, Stat.
- **IconTile variant vs tone**: si el ícono representa **estado** (alerta,
  éxito, info), usar `variant`. Si representa **categoría** (tipo de movimiento,
  sección), usar `tone`. No mezclar.

---

## 6. Estructura de archivos

```
src/
├── components/
│   ├── ui/                        # shadcn + custom shared (Button, Input, Dialog, Sheet)
│   └── opai-ds/                   # ← PRIMITIVOS DS, NO duplicar
│       ├── index.ts               # barrel
│       ├── tokens.ts              # icon sizes (legacy, ver lib/design-system/tokens.ts)
│       ├── PageHero.tsx
│       ├── Breadcrumbs.tsx
│       ├── Surface.tsx
│       ├── KPICard.tsx            # Refined Industrial
│       ├── Stat.tsx               # legacy stable
│       ├── DataView.tsx           # tabla→cards mobile
│       ├── DataTable.tsx
│       ├── IconBubble.tsx         # alias: IconTile
│       ├── Tag.tsx
│       ├── StatusDot.tsx
│       ├── EmptyState.tsx
│       ├── Spinner.tsx
│       └── Skeleton.tsx
└── lib/
    ├── design-system/
    │   └── tokens.ts              # TS contract: TONES, TYPE_SCALE, helpers
    └── motion.ts                  # duraciones + easings
```

---

## 7. Histórico

- **2026-04-30** — Rediseño OPAI Refined Industrial: módulo Inventario
  como pilot. PageHero con icon, KPICard, DataView, Breadcrumbs nuevos.
  Tonal tints categóricos. Geist Mono para datos. Cero arbitrarios en
  todo el módulo. ✅ Branch `claude/inventory-design-system-bScgF`.
