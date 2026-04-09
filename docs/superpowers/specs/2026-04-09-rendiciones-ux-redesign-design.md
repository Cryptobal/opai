# Rediseño UX del Módulo de Rendiciones

**Fecha:** 2026-04-09
**Enfoque:** Lista Unificada con Panel de Acciones (Opción B)
**Alcance:** UX y frontend — sin cambios en el flujo de aprobación ni modelo de datos

---

## Problema

El módulo actual de rendiciones tiene problemas de usabilidad:

1. **Rendiciones y Pagos son páginas separadas** — el admin debe navegar entre ellas para completar el flujo aprobar → pagar → subir comprobante.
2. **Sin filtros avanzados** — no se puede filtrar por solicitante ni rango de fechas, solo por estado y texto.
3. **Selección confusa** — hacer click en cualquier parte de la fila navega al detalle, no hay forma rápida de seleccionar múltiples rendiciones. Las rendiciones en estado "Pagada" muestran checkbox sin sentido.
4. **Sin "select all"** visual — existe en la barra de acciones pero no como checkbox en el header de la tabla.
5. **Upload de comprobante limitado** — solo input file, sin drag & drop ni paste (Ctrl+V) desde clipboard.
6. **No es mobile-first** — el diseño desktop se oculta y se muestra un fallback de cards en mobile, pero no está optimizado para el flujo de trabajo admin.

## Decisiones de Diseño

- **Página única con 2 tabs**: "Rendiciones" y "Pagos" en la misma URL.
- **Client-side filtering**: con ~50-100 rendiciones/mes, cargar todo y filtrar client-side funciona bien (ya se cargan 200 max).
- **Flujo de aprobación**: se mantiene como está (single approver). El rediseño multi-approver es un proyecto futuro.
- **Mobile-first para admin/finanzas**: los guardias/solicitantes no usan esta vista.

---

## Sección 1: Tab de Rendiciones

### 1.1 Layout

```
┌─────────────────────────────────────────────────────┐
│ Rendiciones                          [+ Nueva]      │
│ Gestión de gastos y pagos                           │
├─────────────────────────────────────────────────────┤
│ [Rendiciones (31)] [Pagos (8)]                      │
├─────────────────────────────────────────────────────┤
│ 🔍 Buscar...  │ Solicitante ▾ │ 📅 Fechas ▾       │
│                                                     │
│ (Todos)(Enviadas)(En aprob.)(Aprobadas)(Rechaz.)(Pagadas) │
│                                                     │
│ [💰 Pagar aprobadas (N)]                            │
├─────────────────────────────────────────────────────┤
│ ☐ │ Código        │ Fecha │ ... │ Monto │ Estado    │
│ ☐ │ REN-2026-0031 │ 07abr │ ... │$30000 │ Pagada   │
│ ☑ │ REN-2026-0027 │ 05abr │ ... │ $4300 │ Enviada  │
│ ☐ │ REN-2026-0026 │ 31mar │ ... │$23300 │ Pagada   │
├─────────────────────────────────────────────────────┤
│ ▓▓ 1 seleccionada = $4.300  [Aprobar][Rechazar] ▓▓  │ ← sticky bottom
└─────────────────────────────────────────────────────┘
```

### 1.2 Filtros

| Filtro | Tipo | Comportamiento |
|--------|------|----------------|
| Búsqueda | Input text | Filtra por código, descripción, solicitante, ítem, beneficiario (client-side, ya existe) |
| Solicitante | Select/Combobox | Dropdown con lista de solicitantes únicos extraídos de las rendiciones cargadas |
| Rango de fechas | DateRangePicker | Filtra `rendicion.date` dentro del rango seleccionado. Presets: "Este mes", "Mes pasado", "Últimos 3 meses" |
| Estado (pills) | Toggle pills | Igual que hoy pero sin tab "Borrador" (los borradores no se ven en la lista admin). Cada pill muestra el conteo |
| Tipo | Se elimina como dropdown separado | Se puede buscar "Compra" o "Kilometraje" en el search, simplificando la UI |

**Botón "Pagar aprobadas"**: acceso directo visible siempre. Al clickearlo:
- Filtra la lista por estado "APPROVED"
- Selecciona todas las aprobadas automáticamente
- Muestra la barra de acciones con el botón "Crear pago"

### 1.3 Interacción de Filas

**Regla de click:**
- **Click en el código** (renderizado como link con estilo `text-primary underline`) → `router.push(/finanzas/rendiciones/${id})` → navega al detalle
- **Click en cualquier otra parte de la fila** → `toggleSelect(id)` → selecciona/deselecciona
- **Checkbox en el header** → selecciona/deselecciona todas las rendiciones filtradas actualmente

**Regla de selección por estado:**
- Rendiciones en estado `PAID` o `REJECTED` → NO muestran checkbox, no son seleccionables
- Rendiciones en `DRAFT` → NO muestran checkbox (no deberían verse en lista admin)
- Rendiciones en `SUBMITTED`, `IN_APPROVAL`, `APPROVED` → muestran checkbox y son seleccionables

### 1.4 Barra de Acciones Sticky

Aparece **solo cuando `selectedIds.size > 0`**. Sticky al bottom de la pantalla.

```
┌──────────────────────────────────────────────────────────┐
│ Seleccionar todo  │ 3 seleccionadas = $49.590           │
│                   │ [✓ Aprobar (2)] [✗ Rechazar (2)] [💰 Pagar (1)] │
└──────────────────────────────────────────────────────────┘
```

- Muestra conteo de seleccionadas y suma de montos
- Los botones se habilitan según los estados de las rendiciones seleccionadas:
  - "Aprobar (N)" → visible si hay seleccionadas en `SUBMITTED` o `IN_APPROVAL` y el usuario tiene `rendicion_approve`
  - "Rechazar (N)" → misma condición
  - "Pagar (N)" → visible si hay seleccionadas en `APPROVED` y el usuario tiene `rendicion_pay`
- Los diálogos de confirmación (approve, reject, pay) se mantienen como están

### 1.5 Mobile (< 768px)

- Tabs "Rendiciones | Pagos" se mantienen
- Filtros: search siempre visible, solicitante y fechas como chips horizontalmente scrolleables
- Status pills: scroll horizontal
- Cards en lugar de tabla:
  ```
  ┌─────────────────────────────────┐
  │ ☐  REN-2026-0027  [Enviada]    │
  │    Estacionamiento en Sa...     │
  │    05 abr · Patricio Villaga    │
  │                        $4.300   │
  └─────────────────────────────────┘
  ```
- Click en el checkbox o en el card body → selecciona
- Click en el código (link) → navega al detalle
- Barra sticky abajo con acciones, se adapta a ancho pequeño apilando botones

---

## Sección 2: Tab de Pagos

### 2.1 Layout

```
┌─────────────────────────────────────────────────────┐
│ [Rendiciones (31)] [Pagos (8)]                      │
├─────────────────────────────────────────────────────┤
│ ┌──────────┐ ┌──────────┐ ┌──────────┐             │
│ │Pendientes│ │  Monto   │ │  Pagos   │             │
│ │    3     │ │ $45.200  │ │    8     │             │
│ └──────────┘ └──────────┘ └──────────┘             │
├─────────────────────────────────────────────────────┤
│ Pendientes de pago         [☐ Selec. todo] [Crear]  │
│ ┌───────────────────────────────────────────────┐   │
│ │ ☑ REN-2026-0022 · Rafael Escalona   $21.990  │   │
│ │ ☑ REN-2026-0021 · Rafael Escalona   $23.848  │   │
│ │ ☐ REN-2026-0020 · Rafael Escalona    $3.856  │   │
│ └───────────────────────────────────────────────┘   │
│ 2 seleccionadas = $45.838          [Crear pago (2)] │
├─────────────────────────────────────────────────────┤
│ Historial de pagos                                  │
│ ┌───────────────────────────────────────────────┐   │
│ │ PAG-2026-0008 [Santander]           $58.300 ▲│   │
│ │ ─────────────────────────────────────────────│   │
│ │ REN-0026 — Rafael Escalona          $23.300  │   │
│ │ REN-0025 — Rafael Escalona           $5.490  │   │
│ │ REN-0031 — Patricio Villaga         $30.000  │   │
│ │                                              │   │
│ │ ┌──────────────────────────────────────────┐ │   │
│ │ │  📎 Arrastra comprobante aquí            │ │   │
│ │ │  o busca en tu PC · Ctrl+V para pegar   │ │   │
│ │ │  [JPG] [PNG] [PDF] [WEBP]               │ │   │
│ │ └──────────────────────────────────────────┘ │   │
│ └───────────────────────────────────────────────┘   │
│ ┌───────────────────────────────────────────────┐   │
│ │ PAG-2026-0007 [Manual] [✓Comprobante] $102K ▼│   │
│ └───────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### 2.2 KPIs

3 tarjetas arriba (ya existen en `PagosClient.tsx`, se reutilizan):
- Pendientes de pago (count)
- Monto pendiente (sum)
- Pagos realizados (count)

### 2.3 Sección "Pendientes de pago"

Lista de rendiciones en estado `APPROVED` que aún no tienen `paymentId`. Cada item es clickeable para seleccionar/deseleccionar. Flujo:

1. Seleccionar rendiciones a pagar (checkbox o click en fila)
2. Click "Crear pago (N)"
3. Dialog de confirmación: elegir tipo (Manual / Santander batch), agregar notas opcionales
4. Se crea el `FinancePayment`, las rendiciones pasan a `PAID`
5. Si tipo Santander → se descarga el archivo XLSX automáticamente

### 2.4 Historial de Pagos

Cards expandibles (ya existen, se mantiene el patrón):
- Collapsed: código, tipo (badge), fecha, cantidad de rendiciones, monto total, badge "Comprobante" si ya tiene uno
- Expanded: lista de rendiciones incluidas + zona de upload de comprobante

### 2.5 Upload de Comprobante

**Zona de upload** dentro de cada pago expandido. Soporta 3 métodos:

#### Drag & Drop
- Evento `onDragOver` / `onDrop` en la zona punteada
- Visual feedback: borde cambia a primary, fondo se ilumina
- Se acepta 1 archivo a la vez

#### Browse (click)
- Click en la zona o en el texto "busca en tu PC" abre `<input type="file">`
- Accept: `image/jpeg,image/png,image/webp,application/pdf`

#### Paste (Ctrl+V)
- Listener `paste` global en la página (o scoped al componente expandido)
- Detecta `clipboardData.items` con tipo `image/*`
- Convierte el blob del clipboard a `File` y sube
- Esto es clave para el workflow: screenshot de pantalla → Ctrl+V → listo

#### Preview del archivo subido
- Thumbnail (imagen) o ícono (PDF)
- Nombre del archivo + tamaño
- Botón para ver/descargar
- Botón para eliminar y reemplazar

#### API
- Se usa el endpoint existente `POST /api/finance/payments/[id]` con `FormData`
- Ya soporta upload de comprobante (campo `file`)

---

## Sección 3: Cambios Técnicos

### 3.1 Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `src/components/finance/RendicionesClient.tsx` | Refactor principal: nuevo layout con tabs, filtros avanzados, nueva lógica de click/selección, barra sticky |
| `src/components/finance/PagosClient.tsx` | Se integra como sub-componente dentro de RendicionesClient (tab "Pagos"), se agrega upload con drag/drop/paste |
| `src/app/(app)/finanzas/rendiciones/page.tsx` | Se agregan los datos de pagos al server component para pasarlos al cliente unificado |
| `src/app/(app)/finanzas/pagos/page.tsx` | Redirect a `/finanzas/rendiciones?tab=pagos` para backwards compat |

### 3.2 Nuevos Componentes

| Componente | Responsabilidad |
|------------|-----------------|
| `FileDropZone` (componente compartido) | Zona de upload reutilizable con drag & drop, click to browse, y paste. Props: `onFile(file: File)`, `accept`, `uploading`, `preview` |

### 3.3 No se Modifica

- Modelo de datos Prisma (sin migraciones)
- Endpoints de API (todos se reutilizan tal cual)
- Flujo de aprobación (single/multi approver)
- `RendicionForm.tsx` (crear/editar rendición)
- `RendicionDetail.tsx` (vista detalle)
- Permisos y capabilities

### 3.4 Filtro de Solicitante

Se extrae la lista única de solicitantes de las rendiciones cargadas:
```typescript
const submitters = useMemo(() => {
  const map = new Map<string, string>();
  for (const r of rendiciones) {
    map.set(r.submitterId, r.submitterName);
  }
  return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
}, [rendiciones]);
```

### 3.5 Filtro de Fechas

No existe un `DateRangePicker` ni `Calendar` en el proyecto. Se debe instalar `react-day-picker` y crear los componentes `Calendar` y `DateRangePicker` siguiendo el patrón shadcn/ui. Presets:
- Este mes
- Mes pasado
- Últimos 3 meses
- Personalizado (calendar picker)

### 3.6 Paste Listener

```typescript
useEffect(() => {
  const handler = (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) onPasteFile(file);
        break;
      }
    }
  };
  document.addEventListener("paste", handler);
  return () => document.removeEventListener("paste", handler);
}, [onPasteFile]);
```

---

## Resumen de Cambios UX

| Antes | Después |
|-------|---------|
| 2 páginas separadas (Rendiciones + Pagos) | 1 página con tabs |
| Filtros: solo texto + estado + tipo | Filtros: texto + estado + solicitante + rango fechas |
| Click en fila = navega al detalle | Click en código = detalle, click en fila = selecciona |
| Checkbox en Pagadas (sin sentido) | Checkbox solo en estados accionables |
| Barra de acciones inline (se pierde al scrollear) | Barra sticky al bottom |
| Upload solo con input file | Drag & drop + browse + Ctrl+V paste |
| Sin botón directo "Pagar aprobadas" | Botón prominente que filtra y selecciona |
| Mobile: fallback de cards básico | Mobile-first con cards optimizados y sticky bar |
