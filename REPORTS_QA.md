# QA · Módulo Reportes Financieros V1

Checklist manual para validar el módulo en staging/prod (tenant Gard Security recomendado por tener datos reales).

## Setup

- [ ] Login como tenant con rol owner/admin (`carlos.irigoyen@gard.cl` u otro con `finance_reports_view`)
- [ ] Confirmar que aparece el item "Informes" en el subnav de Finanzas
- [ ] Confirmar que el sidebar de reportes muestra los 7 ítems (Dashboard / EE.RR. / Balance / Ventas / Compras / Rentabilidad / Mayor)

## Dashboard (`/finanzas/reportes`)

- [ ] Carga sin errores
- [ ] Los KPIs muestran números coherentes (no NaN, no Infinity)
- [ ] Cambio de período (mes/trim/año/YTD/custom) re-renderiza datos
- [ ] Trend de 12 meses dibuja área de ingresos y gastos
- [ ] Top 5 clientes muestra avatar/inicial + nombre + monto + barra
- [ ] Pie chart de concentración renderiza colores correctos
- [ ] Export PDF descarga archivo válido (abrirlo en lector)
- [ ] Export Excel descarga archivo válido (abrirlo en Excel/Numbers)

## Estado de Resultado (`/finanzas/reportes/eerr`)

- [ ] Carga
- [ ] Suma vertical es coherente: Margen Bruto = Ingresos - Costos, EBITDA = MB - Opex, Net = EBITDA - Fin - Impuestos
- [ ] Toggle "vs. período anterior" agrega columna comparativa con Δ%
- [ ] Click en cuenta (futuro): debería abrir modal con líneas del journal
- [ ] Export PDF tiene 2 columnas si compare está activo
- [ ] Export Excel mantiene formato CLP en cantidades

## Balance General (`/finanzas/reportes/balance`)

- [ ] Carga
- [ ] Banner "Balance cuadrado" verde si Activo == Pasivo + Patrimonio (tolerancia 1)
- [ ] Banner ámbar si hay diferencia (muestra `imbalance`)
- [ ] Selector `asOf` cambia datos
- [ ] Toggle "vs. cierre mes anterior" agrega columna prevAmount
- [ ] Indicadores: liquidez corriente, ratio endeudamiento, capital de trabajo
- [ ] Layout 2 columnas en desktop, 1 columna en mobile

## Ventas matriz (`/finanzas/reportes/ventas`)

- [ ] Carga heatmap completo (cliente × mes)
- [ ] Celdas con valor 0 NO pintan; celdas con valor pintan con intensity proporcional
- [ ] Total mensual y total cliente cuadran
- [ ] Click en nombre de cliente navega a `/finanzas/reportes/ventas/[clienteId]`
- [ ] Drill-down muestra instalaciones del cliente con monto YTD
- [ ] Búsqueda por nombre de cliente filtra rows
- [ ] Filtros por sector (drawer) funcionan
- [ ] DTEs sin `crmAccountId` aparecen en row "(Sin cliente asignado)"

## Compras matriz (`/finanzas/reportes/compras`)

- [ ] Carga
- [ ] Accent rojo (rose) en lugar de verde
- [ ] Total cuadra con Libro IVA Compras del mismo período
- [ ] Solo se incluyen DTEs RECEIVED con `receptionStatus IN (NULL, ACCEPTED)`

## Rentabilidad (`/finanzas/reportes/rentabilidad`)

- [ ] Carga
- [ ] Cambio de método de prorrateo (`by_revenue` / `by_invoices_count` / `none`) recalcula opex y margen
- [ ] Filas con margen < 0 muestran badge ámbar y barra rose
- [ ] Alert visible si >= 3 clientes negativos
- [ ] Click en fila navega al drill-down de ventas del cliente

## Libro Mayor (`/finanzas/reportes/mayor`)

- [ ] Lista todas las cuentas con conteo de movimientos
- [ ] Filtros por tipo de cuenta funcionan (Activo/Pasivo/Patrimonio/Ingreso/Costo/Gasto)
- [ ] Toggle "Ocultar cuentas sin movimientos" oculta las de movementsCount=0
- [ ] Click en cuenta navega a `/finanzas/reportes/mayor/[accountId]`
- [ ] Saldo final del drill = openingBalance + (totalDebit - totalCredit) si nature=DEBIT
- [ ] Filtro de período cambia los movimientos
- [ ] Export PDF/Excel del libro mayor descarga archivo

## Permissions

- [ ] Usuario sin `finance_reports_view` Y sin `canView(finance, reportes)` → redirect a `/finanzas`
- [ ] Usuario con `finance_reports_view` pero SIN `finance_reports_export` → ve reportes pero export devuelve 403
- [ ] Owner y admin tienen los 3 caps automáticamente
- [ ] Roles operativos (supervisor, guardia, jefe_operaciones) NO tienen los caps

## Mobile

- [ ] Sidebar reportes se convierte en bottom-nav scrolleable
- [ ] Filtros se abren como drawer desde abajo
- [ ] Tablas matrix usan scroll horizontal con 1ra columna sticky
- [ ] PageHero compacto en mobile

## Multi-tenant

- [ ] Reportes solo muestran data del tenantId del usuario logueado
- [ ] Login como otro tenant → datos completamente distintos
- [ ] Ningún endpoint acepta `tenantId` por body (todas las queries usan `ctx.tenantId`)

## Períodos

- [ ] Mes actual: from = primer día, to = último día del mes calendario
- [ ] Trimestre: rango Q1 (Ene-Mar), Q2 (Abr-Jun), etc.
- [ ] YTD: from = 1 enero, to = último día del mes actual
- [ ] Año: 1 enero al 31 diciembre
- [ ] Custom: respeta from/to ingresados

## Cálculos críticos

- [ ] Ventas: solo DTEs ISSUED con `siiStatus IN (ACCEPTED, PENDING, SENT)`. Tipos 33/34/39/41/56 suman; 61 resta.
- [ ] Compras: solo DTEs RECEIVED con `receptionStatus IN (NULL, ACCEPTED)`. Tipos 33/34/46/56 suman; 61 resta.
- [ ] EE.RR./Balance: solo `FinanceJournalEntry.status = POSTED`. DRAFT/REVERSED nunca entran.
- [ ] DSO = (AR / Ventas YTD) × días_YTD

## Pendiente phase 2

- Drill-down con modal de líneas del journal desde EE.RR. y Balance.
- CSV export.
- Optimización del trend de 12 meses (cache Redis).
- Más métodos de prorrateo (por horas, por instalaciones).
- Tabs por unidad de negocio.
