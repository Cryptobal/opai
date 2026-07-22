# Flujo de Caja v3 "Modo Planilla" — QA (B10)

Branch: `claude/flujo-caja-v3-planilla-gy3kmn` · Estado: **merge a main
aprobado explícitamente por Carlos (2026-07-22)** junto con los follow-ups
F1–F5. El merge NO enciende nada: el flag `cashflowPlanillaV3` nace OFF y
producción sigue idéntica hasta activarlo. La validación con datos reales
de este checklist se hace en producción con el flag apagado (URL directa)
o encendido solo para el tenant de Carlos.

Cómo activar para un tenant (flag JSONB, sin migración):

```sql
UPDATE tenant_modules
SET config = COALESCE(config, '{}'::jsonb) || '{"cashflowPlanillaV3": true}'::jsonb
WHERE tenant_id = '<TENANT_ID>' AND module = 'finanzas';
-- Si el tenant no tiene fila para module='finanzas', crearla con enabled=true.
```

La ruta `/finanzas/flujo-caja/planilla` es accesible directo aun con flag OFF
(para validar sin afectar navegación). Import inicial:
`TENANT_SLUG=gard npx tsx scripts/flow-v3-import.ts` (+ opcional
`scripts/flow-v3-seed-plan.json` con `[{ rowName, weekStart, amount }]`).

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
- **F4 Mobile**: bajo 768px la planilla carga 3 columnas (semana anterior ·
  actual · próxima), primera columna 120px, y el **swipe** horizontal navega
  ±1 semana. Sin scroll horizontal.
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
