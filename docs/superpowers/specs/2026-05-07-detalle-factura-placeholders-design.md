# Detalle de factura: descripción multi-línea, placeholders, descuento %/$ y limpieza de referencias

- **Fecha**: 2026-05-07
- **Branch**: `main` (no se crea rama nueva)
- **Status**: Diseño aprobado, pendiente de plan de implementación
- **Autor**: sesión de diseño asistida (Cursor)

## Contexto y motivación

El editor de DTE (`DteForm.tsx`) y el de plantillas recurrentes
(`RecurringTemplateForm.tsx`) presentan tres problemas al facturar
servicios de seguridad mensuales (caso típico: contrato en UF, factura
mensual, período mes corriente):

1. **Descripción de línea no editable como texto largo.** El campo
   `description` ya está en BD (`FinanceDteLine.description: String?`)
   y SimpleAPI ya lo manda al SII como `Descripcion` (`<DscItem>`),
   pero la UI lo expone como un input de una sola línea (en
   `RecurringTemplateForm.tsx`) o no lo expone en absoluto (en
   `DteForm.tsx`). El usuario no puede escribir un detalle con
   saltos de línea tipo "Período / Valor UF / Monto".

2. **Sin placeholders en plantillas recurrentes.** Cuando el cron
   genera el borrador mensual, los textos de `itemName` y
   `description` se copian literales. Para reflejar "Período Mayo
   2026" o "Valor UF al día $39.485" hay que editar el draft a mano
   cada mes — destruyendo el valor de la automatización.

3. **Detalles de UI menores que duelen al uso real**:
   - La columna `Precio *` en `w-28` (≈112px) corta los números con
     montos grandes (`$1.586.987`) o UF con 4 decimales
     (`40,1730 UF`).
   - El descuento sólo permite porcentaje. Hay contratos donde se
     descuenta un monto fijo en CLP/UF.
   - El campo "Razón / glosa" en referencias adicionales es
     obligatorio en el form pero el SII lo acepta vacío. Es ruido.

## Scope

### Incluye

- Reorganizar el bloque "Detalle" del DTE: pasar de fila de tabla a
  Surface por línea (desktop y mobile).
- Agregar `<Textarea>` opcional para descripción con saltos de línea
  (hasta 1.000 chars, límite SII). Aplica en `DteForm.tsx` y
  `RecurringTemplateForm.tsx`.
- Sistema de placeholders (`{{periodo}}`, `{{uf_valor}}`, etc.) con:
  - Resolver compartido (`src/modules/finance/billing/placeholders.ts`).
  - Popover "+ Insertar placeholder" disponible tanto en el input de
    nombre como en el textarea de descripción de cada línea (el caso
    real del usuario tiene el período y la UF en el nombre del ítem).
  - Vista previa debajo del campo, **sólo cuando detecta tokens**.
  - Resolución diferida en plantillas recurrentes (cron) y resolución
    instantánea (texto plano insertado en el cursor) en DTE one-shot.
- Selector inline `% | $` en la celda de descuento por línea.
  Persistencia híbrida (opción C confirmada): JSON de plantilla
  guarda `discountKind` + `discountAmount`; `FinanceDteLine` sigue
  guardando solo `discountPct` calculado al momento.
- Período policy en plantillas recurrentes: nuevo campo
  `periodPolicy String @default("CURRENT_MONTH")` con valores
  `CURRENT_MONTH | PREVIOUS_MONTH | NEXT_MONTH`.
- Eliminar el campo "Razón / glosa" del bloque Referencias en
  `DteForm.tsx`. El valor se sigue mandando como `""` al provider
  (compatible con SII y con drafts antiguos que tengan el campo).

### Excluye / fuera de alcance

- No se crean nuevos placeholders más allá de los listados en la
  tabla de tokens. Cualquier token futuro (`{{contrato}}`,
  `{{folio_oc}}`, etc.) es follow-up.
- No se migra el valor histórico de `razonRef` en drafts emitidos
  (el campo queda en BD, sólo deja de ser editable).
- No se cambia la UI del DTE recibido (sólo el de emisión).
- No se toca el motor de PDF — la descripción ya se imprime porque
  ya viene en el XML/JSON del SII.

## Diseño

### 1. Descripción de línea multi-línea

**UI**:

- En cada Surface de línea, debajo del input "Nombre", aparece:
  - Si `description === ""`: botón inline `+ Agregar descripción`
    (`text-xs text-primary`).
  - Si `description !== ""`: `<Textarea>` con `rows={3}`,
    `resize-y`, `maxLength={1000}`. Auto-grow visual hasta 8 filas.
    Contador `{n} / 1000` a la derecha.
- A la derecha del label "DESCRIPCIÓN (opcional)" hay un botón
  `+ Insertar placeholder ▾` que abre un popover con la lista de
  tokens disponibles (descrita más abajo).
- Soporta `\n` literal. Persistencia: campo `description: string`
  con saltos `\n` tal cual los escribió el usuario.

**Modelo**: `FinanceDteLine.description` ya existe (no requiere
migración). El JSON de `FinanceDteRecurringTemplate.lines` ya
serializa `description` en cada línea (no requiere migración).

**Provider SII**: `simpleapi.provider.ts` línea 479 ya mapea
`item.description → detalle.Descripcion`. El SII permite hasta 1000
caracteres en `<DscItem>` con saltos de línea.

### 2. Sistema de placeholders

**Tabla canónica de tokens**:

| Token              | Resuelve a                                 | Ejemplo (run 1-may-2026, UF=$39.485, currency=UF) |
| ------------------ | ------------------------------------------ | ------------------------------------------------- |
| `{{periodo}}`      | Mes y año del período (según policy)       | `Mayo 2026`                                       |
| `{{periodo_mes}}`  | Solo el mes en texto                       | `Mayo`                                            |
| `{{periodo_anio}}` | Solo el año (alias: `{{periodo_año}}`)     | `2026`                                            |
| `{{periodo_corto}}`| Numérico corto                             | `05/2026`                                         |
| `{{uf_valor}}`     | Valor UF usado, formato CLP                | `$ 39.485`                                        |
| `{{uf_fecha}}`     | Fecha de la UF usada (DD/MM/YYYY)          | `01/05/2026`                                      |
| `{{uf_monto}}`     | Monto de la línea en UF (sólo currency=UF) | `40,1730 UF`                                      |
| `{{cliente}}`      | Nombre del receptor                        | `Andalucía de Montajes Eléctricos`                |
| `{{instalacion}}`  | Nombre de la instalación si está asignada  | `Algarrobo 111`                                   |

**Reglas de resolución**:

- Case-insensitive: `{{Periodo}}`, `{{PERIODO}}`, `{{periodo}}` son
  equivalentes.
- Insensible a tilde: `{{periodo_anio}}` y `{{periodo_año}}` son el
  mismo token.
- Token desconocido se deja **literal** en el texto resuelto. Eso
  permite detectar typos sin romper la emisión.
- Token cuyo valor no aplica al contexto (ej: `{{uf_monto}}` cuando
  el DTE es CLP) se reemplaza por **string vacío**.
- Token `{{instalacion}}` cuando no hay instalación asignada se
  reemplaza por string vacío.
- Aplica en `itemName`, `description` y `notes` del DTE.

**Período policy** — campo nuevo en `FinanceDteRecurringTemplate`:

| Policy             | Significado            | Caso de uso                                 |
| ------------------ | ---------------------- | ------------------------------------------- |
| `CURRENT_MONTH` (default) | Mes del run     | Factura cobrada por adelantado (común CL)  |
| `PREVIOUS_MONTH`   | Mes anterior al run    | Factura vencida (cobro post-servicio)      |
| `NEXT_MONTH`       | Mes siguiente al run   | Casos especiales (raro)                     |

Default confirmado: `CURRENT_MONTH`.

**Picker `+ Insertar placeholder`**:

- Es un `<Popover>` (shadcn) con la lista de tokens disponibles.
- Cada item muestra el token (`{{periodo}}`) y su descripción.
- Al click se inserta el contenido en la posición del cursor del
  textarea/input activo.
- Comportamiento por contexto:
  - **Plantilla recurrente** (`RecurringTemplateForm.tsx`): inserta
    el `{{token}}` **literal**. La resolución la hace el cron en
    cada run.
  - **DTE one-shot** (`DteForm.tsx`): inserta el **valor resuelto
    aquí mismo** (texto plano). Ejemplo: el usuario hace click en
    "Período" → se inserta "Mayo 2026" en el cursor. Sin literales
    `{{...}}` en el draft. Esto evita confusión: en one-shot no hay
    cron futuro que vaya a resolver nada.

**Vista previa**:

- Aparece debajo del textarea de descripción y debajo del input de
  nombre **únicamente cuando el texto contiene tokens detectables**
  (regex `\{\{[a-zA-Z_]+\}\}`).
- Muestra el texto resuelto contra los valores actuales.
- En plantilla recurrente: usa los valores que tendría el próximo
  run (`computeNextRunAt`) — UF resuelta según `ufFixingPolicy`,
  período según `periodPolicy`.
- En DTE one-shot: irrelevante (el valor ya se insertó resuelto),
  no se muestra preview.
- Tipografía: `text-xs text-muted-foreground`, prefijo "Vista
  previa:".

**Resolución en el cron**:

- Punto único: `src/modules/finance/billing/placeholders.ts` exporta
  `resolvePlaceholders(text: string, ctx: PlaceholderContext): string`.
- `dte-recurring.service.ts > runTemplate` construye el `ctx` (UF,
  fecha UF, período según `periodPolicy`, cliente, instalación) y
  aplica `resolvePlaceholders` a cada `itemName`, `description` y
  `notes` antes de pasar a `createDraftDte`.
- El borrador queda con texto **ya resuelto**. Cuando el usuario lo
  abre en `DteForm.tsx` ve texto plano, no `{{...}}`.

### 3. Descuento `%` o `$`

**UI por línea**:

```
DESCUENTO
┌──────────┬──────────┐
│   0      │   %  ▾   │   ← inline select con %, $
└──────────┴──────────┘
```

- Select con dos opciones: `%` (default) y `$`.
- Cuando es `%`: input acepta 0–100 con decimales.
- Cuando es `$`: input acepta cualquier monto. Para CLP redondeo a
  entero; para UF acepta hasta 4 decimales. Validación:
  `discountAmount ≤ subtotal_bruto_línea`.
- El subtotal de la línea se recalcula en vivo en ambos casos.

**Persistencia (opción híbrida C confirmada)**:

- En **`FinanceDteLine`** (BD columnar): se sigue persistiendo solo
  `discountPct: Decimal`. Al guardar/emitir un draft, si la línea
  vino con descuento monto, calculamos `pct = (amount / gross) * 100`
  redondeado a 2 decimales y persistimos eso. **No requiere migración
  Prisma.**
- En **`FinanceDteRecurringTemplate.lines` (JSON)**: agregamos
  `discountKind: "PCT" | "AMOUNT"` y `discountAmount: number` por
  línea. Como `lines` ya es columna `Json`, no requiere migración.
  El cron, al generar el draft, calcula el % efectivo según el monto
  bruto del momento y lo persiste como `discountPct` en el draft.
- En el **state del form** (DTE one-shot y plantilla): se mantiene
  `discountKind` + `discountAmount`/`discountPct` durante la edición.
  Al persistir un borrador one-shot, el % efectivo se guarda en
  `FinanceDteLine.discountPct` (la "intención $" se pierde tras
  cerrar — aceptable para one-shot).

Trade-off conocido: si el usuario reabre un draft one-shot que él
mismo creó con descuento `$5.000`, va a ver el % equivalente y no el
`$5.000`. En plantillas recurrentes la "intención" sí se preserva.

### 4. Eliminación de "Razón / glosa" en referencias

Cambios mecánicos en `DteForm.tsx` (líneas 1290–1372):

1. Eliminar el `<div className="md:col-span-4">` con
   `<Label>Razón / glosa *</Label>` y su `<Input>`.
2. Re-balancear el grid:
   - `tipo` → `md:col-span-3` (era col-span-2).
   - `folio` → `md:col-span-5` (era col-span-3).
   - `fecha` → `md:col-span-3` (sin cambio).
   - `delete` → `md:col-span-1` (sin cambio).
3. Quitar `r.razonRef.trim()` de las dos validaciones (líneas 509 y
   543) — eso vuelve `razonRef` opcional efectivamente.
4. En el payload (líneas 689 y similares) seguir mandando
   `razonRef: ""` por compatibilidad con `dte-issuer.service.ts` y
   con el provider SimpleAPI.

El campo `razonRef` queda en el shape de
`additionalReferences[].razonRef` para no romper drafts existentes
que pudieran tenerlo poblado, pero deja de ser editable. Si en una
iteración futura querés sacarlo del modelo también, requiere
migración del JSON histórico (no trivial — out of scope).

### 5. Layout visual del Detalle (Surface por línea)

**Decisión**: en lugar de mantener la fila de tabla actual,
migramos a un Surface por línea, tanto desktop como mobile. Razones:

1. La descripción multi-línea con saltos no cabe limpiamente en una
   celda de tabla.
2. El precio actualmente fijado en `w-28` (≈112px) se corta con
   montos grandes — al pasar a Surface con grid dedicado el precio
   ya tiene espacio para `$ 20.000.000` o `40,1730 UF` sin recortes.
3. Es consistente con el patrón DS v3 ya migrado en Inventario y
   Conocimiento (PR cluster 5B previos).

**Anatomía desktop** (`<Surface elevation={1} padding="md">`):

```
┌─ Línea 1 ────────────────────────────────────────────── 🗑 ──┐
│ NOMBRE *                                                      │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ Servicio de Seguridad Annetel Algarrobo 111              │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                               │
│ DESCRIPCIÓN (opcional)               + Insertar placeholder ▾ │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ Período {{periodo}}                                      │ │
│ │ Valor UF al día {{uf_fecha}}: {{uf_valor}}               │ │
│ │ Monto facturado: {{uf_monto}}                            │ │
│ └──────────────────────────────────────────────────────────┘ │
│ Vista previa: "Período Mayo 2026 / Valor UF al día …"        │
│                                                               │
│ ┌─ CANT. ──┐ ┌─ UN. ──┐ ┌─ PRECIO * ──────────┐ ┌─ DESC. ─────┐│
│ │   1.0000 │ │  UN    │ │     40,1730    UF   │ │ 0      %  ▾ ││
│ └──────────┘ └────────┘ └─────────────────────┘ └─────────────┘│
│                                       Subtotal: $ 1.586.987 │
└──────────────────────────────────────────────────────────────┘
```

Detalles:
- Grid de 4 columnas para los inputs numéricos: `cant (w-24) | unidad
  (w-20) | precio (flex-1, mínimo w-44) | descuento (w-32)`.
  El precio ahora puede expandirse hasta el final de la fila.
- Sufijo de moneda (`UF` o `CLP`) dentro del input de precio,
  alineado a la derecha (`text-xs text-ds-text-3`). El header del
  campo muestra solo "PRECIO *" para no duplicar la unidad.
- Subtotal en `text-sm font-mono tabular-nums`.

**Anatomía mobile** (sm:hidden): mismo Surface pero el grid colapsa:
- Fila 1: nombre full-width.
- Fila 2: descripción (textarea) full-width si está activa.
- Fila 3: `grid-cols-2` con cant + unidad.
- Fila 4: precio full-width (con sufijo UF si aplica).
- Fila 5: descuento full-width con selector %/$.
- Fila 6: subtotal alineado a la derecha.
- Inputs `h-10 sm:h-9` para touch ≥44px en mobile (regla DS v3).

**Tokens DS**: usar `text-ds-text-2`, `text-ds-text-3`,
`bg-ds-surface-1/2`, `border-ds-border-default`. Sin colores
hardcoded. Tipografía mínima `text-[12px]`. Estos archivos se
agregarán al guard `MIGRATED_PATHS` en
`scripts/check-design-system.mjs` cuando el cluster Finanzas/DTE
esté migrado completo (out of scope acá — esta sesión sólo refactor
del Detalle).

## Modelo de datos

**Cambios mínimos**:

```prisma
// prisma/schema.prisma — FinanceDteRecurringTemplate
model FinanceDteRecurringTemplate {
  // ...campos existentes...

  /// Política para resolver el placeholder {{periodo}} y derivados.
  ///   - CURRENT_MONTH (default): mes del run del cron.
  ///   - PREVIOUS_MONTH: mes anterior al run.
  ///   - NEXT_MONTH: mes siguiente al run.
  /// Aplica solo cuando alguna línea de la plantilla usa {{periodo*}}
  /// en itemName/description/notes. Si no hay tokens, el campo es ignorado.
  periodPolicy String @default("CURRENT_MONTH") @map("period_policy")
}
```

Migración Prisma: una migración trivial, default `"CURRENT_MONTH"`.
Drafts y DTEs existentes no se tocan.

**Sin cambios** en `FinanceDteLine`. El JSON de
`FinanceDteRecurringTemplate.lines` agrega dos campos opcionales por
línea (`discountKind`, `discountAmount`) que el resolver los lee si
están y los ignora si no — backwards-compatible con plantillas
existentes.

## Flujo de resolución de placeholders

```
┌─────────────────────────────────────────────────────────────┐
│ Plantilla recurrente (BD)                                   │
│ lines: [{ itemName: "Servicio {{periodo}}", description: …}] │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ cron ejecuta runTemplate(t)
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ runTemplate (dte-recurring.service.ts)                      │
│   1. Resuelve UF según ufFixingPolicy → ufOverride, ufDate  │
│   2. Resuelve período según periodPolicy → periodInfo       │
│   3. Construye PlaceholderContext = {                        │
│        period: periodInfo,                                   │
│        ufValue, ufDate,                                      │
│        cliente: t.receiverName,                              │
│        instalacion: <fetch desde installationId>,            │
│        currency: t.currency,                                 │
│      }                                                       │
│   4. Para cada línea:                                       │
│      itemName = resolvePlaceholders(line.itemName, ctx)     │
│      description = resolvePlaceholders(line.description, ctx)│
│      → calcula uf_monto si currency=UF y unitPriceUf existe │
│   5. resolvePlaceholders(t.notes, ctx)                      │
│   6. Calcula discountPct si la línea trae discountKind=AMOUNT│
│      pct = (amount / gross) * 100                           │
│   7. createDraftDte(...) con todos los textos resueltos     │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ FinanceDte (DRAFT)                                           │
│ lines: [{ itemName: "Servicio Mayo 2026", description: "…"}]│
└─────────────────────────────────────────────────────────────┘
```

**Función pura, testeable**:

```ts
// src/modules/finance/billing/placeholders.ts
export interface PlaceholderContext {
  period: { mes: string; anio: number; periodoCorto: string };
  uf: { value: number; date: Date } | null;
  ufMonto?: number; // sólo si la línea es UF; resolver lo recibe por línea
  cliente: string;
  instalacion: string | null;
  currency: "CLP" | "UF";
}

export function resolvePlaceholders(
  text: string,
  ctx: PlaceholderContext,
): string;

export function buildContext(
  template: FinanceDteRecurringTemplate,
  runDate: Date,
  ufValue: number | null,
  ufDate: Date | null,
  installationName: string | null,
): Omit<PlaceholderContext, "ufMonto">;

export function resolvePeriodFromPolicy(
  policy: PeriodPolicy,
  runDate: Date,
): { mes: string; anio: number; periodoCorto: string };
```

## Plan por archivo

| Archivo | Cambio |
|---|---|
| `prisma/schema.prisma` | Agregar `periodPolicy String @default("CURRENT_MONTH") @map("period_policy")` a `FinanceDteRecurringTemplate` |
| `prisma/migrations/<ts>_add_period_policy/migration.sql` | `ALTER TABLE finance.finance_dte_recurring_templates ADD COLUMN period_policy text NOT NULL DEFAULT 'CURRENT_MONTH';` |
| `src/modules/finance/billing/placeholders.ts` (nuevo) | Resolver puro + helpers `buildContext`, `resolvePeriodFromPolicy`, `formatUfValue`, `formatUfMonto` |
| `src/modules/finance/billing/__tests__/placeholders.test.ts` (nuevo) | Tests unitarios: cada token, case-insensitive, sin tilde, currency CLP/UF, policy CURRENT/PREV/NEXT, token desconocido literal, contexto vacío |
| `src/modules/finance/billing/dte-recurring.service.ts` | En `runTemplate` resolver período + tomar instalación + aplicar `resolvePlaceholders` a `itemName`/`description`/`notes` antes de `createDraftDte`. Calcular `discountPct` si la línea trae `discountKind=AMOUNT` |
| `src/components/finance/DteForm.tsx` | Refactor del bloque Detalle a Surfaces. Agregar Textarea descripción + popover placeholders (resolución instantánea). Selector %/$ en descuento. Quitar "Razón / glosa" del bloque Referencias. Re-balancear el grid de referencias |
| `src/components/finance/RecurringTemplateForm.tsx` | Mismo refactor de Detalle. Popover placeholders inserta `{{token}}` literal. Vista previa solo cuando detecta tokens. Selector `Período policy` junto al de UF. Persistir `discountKind`/`discountAmount` en el JSON `lines` |
| `src/components/finance/_PlaceholderPicker.tsx` (nuevo) | Componente compartido: `<PlaceholderPicker mode="literal" \| "resolved" onInsert={fn} ctx={…}/>` |
| `src/components/finance/_LineDetailSurface.tsx` (nuevo) | Surface compartido del detalle de línea, consumido por DteForm y RecurringTemplateForm |

**Estimación**:
- Schema + migración: 10 min
- `placeholders.ts` + tests: 1.5 h
- `dte-recurring.service.ts` integración: 30 min
- `_PlaceholderPicker.tsx` + `_LineDetailSurface.tsx`: 2 h
- Refactor `DteForm.tsx`: 2 h
- Refactor `RecurringTemplateForm.tsx`: 1.5 h
- Limpieza Razón/glosa: 15 min
- QA manual + ajustes DS tokens: 1 h

Total ~9 h de implementación (sin contar revisión).

## Testing

**Tests unitarios** (`vitest`):

- `placeholders.test.ts`:
  - Cada token reemplaza correctamente.
  - Case-insensitive: `{{Periodo}}` y `{{PERIODO}}` igual que `{{periodo}}`.
  - `{{periodo_anio}}` y `{{periodo_año}}` equivalentes.
  - Token desconocido (`{{contrato}}`) queda literal.
  - `{{uf_monto}}` con currency=CLP → string vacío.
  - `{{instalacion}}` sin instalación asignada → string vacío.
  - `resolvePeriodFromPolicy(CURRENT_MONTH, 1-may-2026)` = `Mayo 2026`.
  - `resolvePeriodFromPolicy(PREVIOUS_MONTH, 1-may-2026)` = `Abril 2026`.
  - `resolvePeriodFromPolicy(NEXT_MONTH, 31-dic-2026)` = `Enero 2027`.

- `dte-recurring.service.test.ts` (extender suite existente):
  - Plantilla con `{{periodo}}` y `periodPolicy=CURRENT_MONTH` →
    draft con texto resuelto al mes del run.
  - Plantilla UF con `{{uf_valor}}` y `ufFixingPolicy=LAST_DAY_PREV_MONTH`
    → la UF resuelta es la del último día del mes anterior.
  - Línea con `discountKind=AMOUNT` y `discountAmount=5000` sobre
    bruto $100.000 → draft con `discountPct=5.00`.

**Tests manuales (smoke)**:

- Crear plantilla nueva con descripción multi-línea, tokens en
  itemName y description, currency=UF, ufFixingPolicy=LAST_DAY_PREV_MONTH,
  periodPolicy=CURRENT_MONTH. Forzar run del cron. Abrir el draft
  generado y verificar que los textos están resueltos.
- Crear DTE one-shot, click en "+ Insertar placeholder" → "Cliente"
  → el nombre del receptor se inserta como texto plano en el cursor.
- Cambiar selector de descuento de `%` a `$` y volver. Subtotal
  debe coincidir.
- Mobile: probar el form en viewport 375px. Verificar touch targets
  ≥44px y que el precio no se corte con `$ 20.000.000`.
- Light + Dark: verificar que ambos modos se vean limpios (regla DS v3).

## Compatibilidad y migración

- **Drafts existentes** (`FinanceDte` con `siiStatus=DRAFT` creados
  antes de este cambio): se siguen abriendo en el form sin problema.
  Las líneas no tienen `description` (o tienen string vacío) → el
  textarea queda colapsado al estado "+ Agregar descripción".
- **Plantillas existentes**: el campo `periodPolicy` queda en
  `CURRENT_MONTH` por default. Plantillas que no usen `{{periodo*}}`
  son agnósticas al campo. Plantillas que ya tengan `{{...}}` literal
  en sus textos (caso edge) ahora se interpretarán como tokens — si
  el token no existe, queda literal (cero ruptura).
- **DTEs ya emitidos**: no se tocan. El cambio sólo aplica al editor
  y al cron.
- **Referencias adicionales históricas con `razonRef` poblado**: se
  preservan en BD pero deja de ser editable en UI nueva. Al re-abrir
  un draft histórico el campo se ignora.

## Decisiones cerradas (resueltas con el usuario)

1. **Persistencia descuento**: opción **C híbrida** (JSON de
   plantilla guarda kind+amount; FinanceDteLine guarda solo `pct`).
2. **Período policy default**: `CURRENT_MONTH` (factura por
   adelantado, patrón típico de contratos de seguridad CL).
3. **Vista previa de placeholders**: solo cuando detecta tokens
   (regex `\{\{[a-zA-Z_]+\}\}`).
4. **Placeholders en DTE one-shot**: sí, también ofrecer el picker.
   Modo de inserción: **valor resuelto inline** (texto plano), no
   literal `{{...}}`. Razón: en one-shot no hay cron futuro que
   resuelva — pedir literales sería confuso.

## Open follow-ups (fuera de scope)

- Tokens adicionales (`{{contrato}}`, `{{folio_oc}}`, `{{usuario}}`)
  cuando aparezca un caso real.
- Migrar también el campo `razonRef` fuera del shape de
  `additionalReferences` (requiere migración de JSON histórico).
- Agregar `DteForm.tsx` y `RecurringTemplateForm.tsx` a
  `MIGRATED_PATHS` en `scripts/check-design-system.mjs` cuando todo
  el módulo Finanzas esté alineado al DS v3 (cluster 5C eventual).
