# Flujo de Caja v3 "Modo Planilla" — QA (B10)

Branch: `claude/flujo-caja-v3-planilla-gy3kmn` · Estado: **merge a main
aprobado explícitamente por Carlos (2026-07-22)** junto con los follow-ups
F1–F5. El merge NO enciende nada: el flag `cashflowPlanillaV3` nace OFF y
producción sigue idéntica hasta activarlo. La validación con datos reales
de este checklist se hace en producción con el flag apagado (URL directa)
o encendido solo para el tenant de Carlos.

## Activación sin fricción (V2 — sin scripts ni SQL)

- **Filas automáticas**: al abrir `/finanzas/flujo-caja/planilla` por primera
  vez, si el tenant no tiene filas, se crean solas (una por cuenta+instalación
  con programación activa + canónicas de egresos). No hay que correr el import.
- **Términos de pago por contrato**: se backfillean automáticamente desde los
  `diasCobroDesdeFactura` que ya tenías configurados en el módulo viejo
  (items CONTRACT/OTHER) hacia la programación equivalente. Cada contrato
  puede tener el suyo; se edita después desde el popover de la celda
  ("cobro Nd → Editar").
- **Activar en navegación**: botón "Activar en navegación" en la toolbar de la
  planilla (owner/admin) → confirma → escribe el flag `cashflowPlanillaV3` sin
  SQL y refresca la nav. Reversible con el mismo botón.

La ruta es accesible directo aun con el flag OFF (para validar sin afectar la
navegación del resto del equipo). El SQL/`scripts/flow-v3-import.ts` siguen
disponibles como respaldo, pero ya no son necesarios.

---

## 1. Checklist manual

### Grilla y edición
- [ ] La planilla carga con ventana default: 4 semanas atrás → 12 meses adelante.
- [ ] Click en celda futura de fila propia → seleccion con outline primary.
- [ ] Tipear dígitos sobre la celda → input inline con miles es-CL; Enter
      guarda y baja; Tab guarda y va a la derecha; Esc cancela; Delete limpia
      (plan 0 = celda borrada).
- [ ] Guardado optimista: la celda, FLUJO SEMANA y SALDO ACUMULADO se mueven al
      instante y quedan igual tras el refetch (reconciliación server).
- [ ] Celdas de semanas pasadas y filas archivadas/virtuales NO editan.
- [ ] Números negativos solo tienen sentido en FINANCIAMIENTO (signado).

### Navegación teclado
- [ ] Flechas mueven la selección entre filas/columnas.
- [ ] Espacio abre el popover de capas de la celda seleccionada.

### Popover de capas
- [ ] Muestra Plan / Comprometido (folios y programaciones con fecha) / Real
      (movimientos con folio) y destaca la capa efectiva + mapping de la fila.
- [ ] Item `scheduled` muestra "hasta {fecha}" o "sin término".
- [ ] "Aplazar término" → date picker → guardar → refetch: las proyecciones se
      extienden/acortan en la grilla. (criterio v3.1-d)

### Filas
- [ ] `＋ Agregar concepto` → INGRESOS pide cuenta CRM (+instalación opcional);
      egresos piden categoría o manual. La fila aparece al refetch.
- [ ] Archivar fila con programación activa → warning con opción "desactivar
      programación también" (fija término = ayer).
- [ ] Archivar nunca borra el plan histórico.

### Capas y agregación
- [ ] DTE emitido no pagado aparece como comprometido en la semana de su
      vencimiento (sin vencimiento: emisión + 30d); vencidos caen en la semana
      actual.
- [ ] Programación activa proyecta cuotas SOLO hasta su endDate inclusive; el
      período con DTE emitido/borrador no se duplica (dedupe por
      recurringTemplateId + billingPeriod).
- [ ] Payroll (líquido/quincena/Previred) y F29 de mes vencido aparecen en las
      filas canónicas en los días de pago de la config.
- [ ] Real: movimiento conciliado cae en su fila y semana del movimiento; sin
      conciliar cae en "Otros clientes"/"Otros gastos" (la plata nunca
      desaparece del saldo).
- [ ] Toggle Semanas/Meses: totales mensuales = suma de las semanas cuyo lunes
      cae en el mes; saldo del mes = saldo de su última semana.
- [ ] Línea HOY visible; izquierda solo real (teal + punto), derecha editable;
      comprometido con fondo info + folio superíndice.

### Criterios v3.1 (obligatorios)
- [ ] (a) **≥ 22 filas de datos visibles en 1440×900** sin scroll (fila 22px,
      headers 18/18/16, secciones 20px, toolbar 1 línea).
- [ ] (b) Fila archivada invisible hacia adelante; al navegar ‹ a una ventana
      pasada donde tuvo facturas/movimientos, entra sola con tag `cerrada` y
      sale al volver a la ventana actual.
- [ ] (c) Ventana inicial = hoy−4sem → hoy+12m (~57 columnas) y navegación por
      bloques de 8 semanas manteniendo el tamaño de ventana — **nunca más de
      ~60 columnas montadas en DOM** (verificar con devtools:
      `document.querySelectorAll('thead th').length`).
- [ ] (d) Aplazar término desde el popover extiende las proyecciones tras
      refetch (ver Popover).

### Flag y navegación (B9)
- [ ] Flag OFF: nav "Flujo de Caja" → módulo actual; planilla accesible solo
      por URL directa; cero cambios visibles.
- [ ] Flag ON: nav (sidebar, pills Banca, bottom nav) → `/planilla`;
      breadcrumbs Finanzas › Banca › Flujo de Caja; módulo viejo accesible
      directo con banner "versión anterior" + link.

---

## 2. Comparación módulo viejo vs derivadores (scripts/flow-v3-compare.ts)

`TENANT_SLUG=gard npx tsx scripts/flow-v3-compare.ts` — compara las últimas 4
semanas cerradas: occurrences del viejo (PAID y PROYECTADO bruto) vs capa REAL
v3 (banco). **Pendiente de correr con datos reales; pegar la tabla aquí.**

Diferencias esperadas (explicar, no "corregir" el nuevo para calzar):
- El viejo suma solo lo matcheado a occurrences; v3 suma todo movimiento
  bancario visible (sin conciliar → "Otros"). Δ ≈ movimientos sin match del
  viejo.
- El viejo arrastra drift (montos proyectados congelados, ajustes de cierre
  manuales, overrides de fecha que v3 no lee).
- PROYECTADO viejo se muestra ×1.19 en afectas (estimación) vs banco real.

```
(pegar salida del script aquí)
```

---

## 3. Follow-ups F1–F5 (implementados post-B10)

- **F1 Término de pago configurable**: `collectionLagDays` en
  Configuración → Flujo de Caja (default 30). Se usa cuando el documento no
  trae vencimiento; `FinanceSupplier.paymentTermDays` sigue mandando para
  recibidos con proveedor.
- **F2 Umbral del semáforo configurable**: `flowWarnThresholdClp` en la misma
  config (default $8M). SALDO ACUMULADO ámbar bajo ese valor, rojo bajo 0.
- **F3 Rellenar a la derecha**: seleccionar celda editable → **Ctrl/Cmd+D** →
  diálogo con monto y N semanas → un solo POST bulk-fill (monto 0 borra).
- **F4 Mobile**: ~~bajo 768px la planilla carga 3 columnas (semana anterior ·
  actual · próxima), primera columna 120px, y el **swipe** horizontal navega
  ±1 semana. Sin scroll horizontal.~~ **Superseded por FC-01 (2026-07-23)**:
  móvil carga el mismo horizonte que desktop y navega con scroll nativo (ver
  §6).
- **F5 Turnos extra comprometidos**: TE con `status=approved` y `paidAt=null`
  aparecen agregados en la fila "Turnos extra" (semana actual, item
  "Turnos extra por pagar (N aprobados)"). Los TE futuros/estimados siguen
  siendo Plan del usuario (el promedio histórico del módulo viejo NO se
  replica — diferencia esperada en compare).

Checklist adicional:
- [ ] Cambiar término de pago en config mueve las semanas de cobro estimado
      tras recargar la planilla.
- [ ] Cambiar umbral en config re-pinta el heat del saldo.
- [ ] Ctrl+D sobre celda con monto → rellena N semanas a la derecha.
- [ ] En un teléfono: 3 columnas, swipe izquierda/derecha navega semanas.
- [ ] Con TE aprobados sin pagar: fila Turnos extra muestra el comprometido.

## 4. Decisiones documentadas

1. **F29 comprometido** solo para meses vencidos (DTEs reales, día
   `ivaPayDay` config, default 12 — el prompt decía 20); meses futuros = Plan.
2. **Saldo de ventanas enteramente futuras** ancla en saldo hoy ignorando el
   gap sin cargar (aprox. documentada; la default siempre incluye hoy).
3. **DS guard**: 3 warnings `no-tiny-text` en constantes (NUM_CLASS/EYEBROW,
   11px mono eyebrow de la densidad Excel) — el checker no ve el trío dentro
   de constantes; cumplen el patrón. `lint:nav` tiene 2 fallas preexistentes
   (bancos/conciliacion, sin diff vs main).
4. **Mockup HTML** no existe en el repo; se implementaron las specs numéricas
   del prompt v3.1.

## 5. Suite automatizada

`npx vitest run src/modules/finance/flow-v3` → 46 tests (weeks, rows/plan
services, derivadores ingreso/egreso/real/TE, ensamblador y mensual).
Gate por bloque: `npx prisma generate && npx tsc --noEmit` ✅ en B0–B10.

---

## 6. FC-01 — Hoja de cálculo operativa: shell focus + renderer (2026-07-23)

Primera fase del brief "Flujo de Caja como planilla" (branch
`claude/ejecuta-esto-1y39mj`). Solo shell + renderer; sin cambios de semántica
financiera ni migraciones.

### Qué cambió

- **Sheet focus móvil (route-scoped)**: `AppShell` marca
  `data-layout-mode="sheet-focus"` en `/finanzas/flujo-caja/planilla`. En
  `< lg`: sin `AutoBreadcrumbs`, sin padding horizontal, sin `overflow-x-clip`
  sobre el grid y sin banners del shell (`[data-app-banner]`); los layouts de
  Finanzas/flujo-caja aplanan sus espaciadores (`.sheet-focus-flat`). Se
  conservan topbar liquid glass, `BottomNav` + orbe y safe areas. Desktop
  intacto (sidebar/topbar/breadcrumbs).
- **Anatomía de planilla**: gutter fijo con números de fila (correlativo de la
  hoja renderizada, incluye secciones y resumen), fila sticky de letras
  (A = Concepto, B… semanas, AA tras Z — helper `column-letter.ts` con tests),
  fila de mes/año y fila fusionada `S## · fecha inicio`. Esquina y sticky
  compuesto con z-index 40/30/20/10 (sin parpadeos en scroll diagonal).
- **Geometría por CSS variables** (`--plnx-*` en `globals.css`, scope
  `.planilla-sheet`): desktop fila 22px / concepto 200px / semana 86px /
  gutter 38px; teléfonos gutter 28px, concepto 100px, semana
  `(100vw−128px)/4` (Concepto + 4 semanas exactas en el primer viewport) y
  fila `clamp(13px…18px)` derivada de `100dvh`, safe areas y
  `--bottom-nav-height` (46 filas de hoja = 3 headers + 43 filas en Pro Max).
- **Un solo horizonte lógico**: móvil = desktop (hoy−4sem → +12m, 57 columnas
  ≤ 60). Sin swipe-refetch ni `max-md:overflow-x-hidden`: scroll nativo con
  momentum; `‹ ›` desplazan 4 (móvil) / 8 (desktop) columnas por scroll y solo
  desplazan la ventana (un fetch de 8 semanas) al tocar un borde. `Hoy`
  re-ancla en la semana actual. `AbortController` + generation guard.
- **Excepciones scoped a reglas globales** (documentadas en `globals.css`):
  la hoja restaura `display: table` (el hack responsivo global
  `table{display:block}` rompía el layout y el sticky) y neutraliza el
  `min-height: 44px` táctil SOLO para botones internos de la hoja (chevrons,
  kebab) — las celdas densas no son botones; las acciones táctiles reales
  (toolbar h-10, diálogos) mantienen ≥44px.
- **Toolbar única de una línea**: `‹ Hoy ›` · Semanas/Meses · Ceros · ＋ ·
  menú `⋯` (flag de navegación + versión anterior). Sin hero, título ni KPI
  cards: saldo/mínimo/semana crítica como texto compacto solo desktop (en
  móvil ese rol lo cumple la fila sticky SALDO).
- **Ocultar ceros (default ON)**: filas sin ninguna capa en el horizonte se
  ocultan (`isZeroRow`, tests); contador `visibles/total` en la sección;
  filas creadas en la sesión quedan exentas; preferencia en localStorage.
  El teclado navega solo filas visibles.
- **Montos**: 12px en móvil (mínimo DS); montos ≥10 caracteres bajan a 11px
  mono-eyebrow (patrón DS aceptado de esta grilla) en vez de recortar dígitos.
  El kebab de fila es hover-only → oculto en móvil (acciones móviles de fila
  llegan en FC-04 con bottom sheet).

### Decisiones documentadas (brief vs implementación)

1. **Letras al entrar en móvil**: el horizonte carga 4 semanas de historia, y
   al entrar la hoja se ancla en la semana ACTUAL como primera columna de
   negocio (objetivo: entender la caja de hoy en segundos). Por eso las letras
   visibles al entrar son F–I; A–E quedan visibles al desplazarse al inicio
   del horizonte. Se preservan las 5 columnas de negocio (Concepto + 4
   semanas) del brief.
2. **Footer sticky en móvil**: FLUJO/SALDO quedan sticky (2 filas dentro del
   presupuesto de 46) — el saldo siempre visible vale más que 2 filas extra.
3. **`CLAUDE.md` no existe** en el repo (el brief pedía reportarlo).

### Validación (local, Chromium/Playwright)

- `npx vitest run src/components/finance/flow-v3 src/modules/finance/flow-v3`
  + suites de navegación/AppShell: **150 tests verdes** (10 nuevos:
  `column-letter`, `zero-rows`).
- `npx tsc --noEmit` limpio (solo artefacto transitorio de `.next/dev` con el
  dev server corriendo).
- `check-ds` exit 0; 2 avisos `no-tiny-text` nuevos en constantes con el trío
  eyebrow en la misma línea (misma clase de falso positivo ya documentada en
  §4.3). `lint:nav` sin fallas nuevas (2 preexistentes).
- Métricas medidas (viewport → filas de hoja simultáneas, ancho semana):
  - 1440×900: 36 filas (≥22 ✓), semana 86px, 57 columnas montadas.
  - 430×932: **46 filas** (43 + 3 headers ✓), semana 75.5px, fila 15.6px.
  - 390×844: 41–44 filas, semana 65.5px, fila 14.3px (piso tipográfico 12px).
  - 932×430 (landscape): geometría desktop, headers/gutter estables.
- Funcional verificado en navegador: doble click + tipeo + Enter → PATCH
  `success` y celda persistida tras recarga; Delete limpia; Ceros ON revela
  filas cero llenando el viewport; sticky diagonal sin desfases; light/dark.

### Pendiente de validar en dispositivo real

- Safari iOS (PWA standalone, safe areas reales, momentum) y Chrome Android.
- Interacciones táctiles de edición (tap/tap-editar) — FC-03/FC-04 traen el
  bottom sheet de celda y acciones móviles de fila.

### FC-01.1 — Feedback de producción del owner (2026-07-23)

1. **Planilla por defecto**: semántica del flag invertida a OPT-OUT. Sin flag
   → el Modo Planilla es la ruta principal (nav, N3, bottom nav);
   `cashflowPlanillaLegacy: true` = rollback explícito a la versión anterior
   (el toggle de la toolbar escribe ambos flags; `cashflowPlanillaV3` se
   mantiene por compatibilidad). Banner "versión anterior" en la ruta vieja
   salvo rollback. Tests del registry actualizados.
2. **Anclaje**: al abrir y con "Hoy", la primera columna de negocio es la
   semana ANTERIOR y la actual queda segunda (`anchorTargetWeek`).
3. **Densidad móvil**: fila mínima 15px, fórmula /40 (~43 filas de hoja en un
   Pro Max) — "un pelo más de aire" pedido tras probar con datos reales.
4. **Peek de concepto**: en teléfonos, tocar el nombre truncado muestra el
   nombre completo en un overlay (3 s o segundo tap). El title de desktop se
   mantiene.
5. **Scroll vertical**: el documento ya no scrollea en la hoja móvil —
   `100svh` (no dvh: con la barra de Safari visible sobreestimaba y el
   documento arrastraba toolbar y encabezados) + candado `sheet-focus-lock`
   (html/body overflow hidden bajo lg mientras la planilla está montada).
   Verificado: `docScrollable=false`, headers/toolbar inmóviles.

### FC-01.2 — Feedback de producción #2 (2026-07-23)

1. **"Cuentas" no cargaba**: `/finanzas/bancos` (item N3 "Cuentas y cartolas")
   redirigía a `/finanzas/flujo-caja` (la grilla v2, lenta) en vez de mostrar
   las cuentas → bounce a una página que a veces caía al offline-fallback del
   SW. Se eliminó ese redirect: la página muestra cuentas + Movimientos.
2. **Versión antigua eliminada de la navegación**: `/finanzas/flujo-caja`
   ahora solo `redirect()` a `/finanzas/flujo-caja/planilla`. El registro de
   nav dejó una sola entrada de Flujo de Caja (sin el gemelo legacy ni el flag
   `cashflowPlanillaLegacy`); la toolbar perdió el toggle de flag. El módulo
   v2 (CashflowGrid, projection, auto-sync) queda como código muerto sin ruta
   de navegación (su borrado físico es un cleanup posterior — algunos
   servicios como weekly-close se reusarán en FC-05).
3. **Perf del matrix**: el cómputo de payroll por instalación pasó de
   secuencial (N × varios round-trips) a `Promise.all`. Se agregó log de
   latencia `[Finance/FlowV3] matrix <ms>` para observar tenants lentos en
   Vercel.
4. **Capas del comprometido, con leyenda**: se separó el "comprometido" (antes
   todo azul) en cuatro sub-estados por prioridad, con chip y color propios:
   factura emitida (azul sólido, folio) · programada sin documento (azul
   punteado, «P») · estado de pago/proforma enviado (ámbar sólido, «EP») ·
   borrador sin enviar (ámbar punteado, «B»). Real (pagado) sigue verde, Plan
   sin fondo. Botón ⓘ en la toolbar abre la leyenda. Nuevo `kind:"draft"` con
   `proformaSent` derivado de `FinanceDte.proformaStatus`.
5. **Filas asociadas no se renombran**: solo las filas `MANUAL` permiten
   renombrar; las de cuenta/categoría/proveedor muestran el origen del nombre
   deshabilitado (renombrarlas las desincronizaría de su fuente).
6. **Ingreso sin cuenta**: "Agregar concepto" en INGRESOS ahora tiene un
   checkbox "Asociar a una cuenta CRM" (default ON). Al desmarcarlo se crea un
   ingreso `MANUAL` (libre, sin cuenta), como pidió el owner. El backend ya lo
   permitía (zod INGRESOS+MANUAL); faltaba la opción en el diálogo.
