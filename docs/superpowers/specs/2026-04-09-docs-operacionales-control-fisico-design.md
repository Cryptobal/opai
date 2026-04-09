# Documentos Operacionales: Control Digital + Físico

**Fecha:** 2026-04-09
**Estado:** Draft
**Autor:** Claude + Carlos Irigoyen

---

## Resumen Ejecutivo

Sistema centralizado de control de documentos operacionales que combina dos dimensiones: **verificación digital** (archivos cargados en OPAI) y **verificación física** (chequeo presencial por supervisores en terreno). Incluye una vista matricial en el módulo Documentos y un flujo de chequeo ágil dentro de las visitas de supervisión.

---

## Problema

1. **Sin visibilidad centralizada:** Para ver el estado documental hay que entrar instalación por instalación en "Docs. Operacionales".
2. **Verificación física incompleta:** El toggle "Obligatorio en visita" solo existe en Docs. Instalación; falta en Docs. Globales y Docs. Guardias.
3. **Sin tracking de chequeos físicos:** No hay historial de cuándo, quién y qué supervisor verificó un documento presencialmente.
4. **Chequeo del supervisor limitado:** El wizard de supervisión tiene checklist de documentos pero no cubre las 3 capas (global, instalación, guardia) de forma consistente.

---

## Alcance

### En scope

1. **Configuración:** Agregar toggle "Obligatorio en visita" a Docs. Globales y Docs. Guardias (ya existe en Docs. Instalación).
2. **Módulo Documentos — Vista Docs Operativos:** Nueva sección con dos pestañas:
   - "Por Instalación" — Grilla matricial de instalaciones × documentos (globales + instalación).
   - "Por Guardia" — Instalaciones expandibles con guardias y sus documentos.
3. **Drawer lateral:** Panel con detalle del documento y timeline de verificaciones físicas.
4. **Supervisor mobile:** Flujo de chequeo documental dentro de la visita de supervisión (toggle + foto por documento, por guardia).
5. **Modelo de datos:** Tabla para registrar verificaciones físicas con historial.

### Fuera de scope

- Alertas/notificaciones automáticas por documentos no verificados.
- Dashboard/reportes de cumplimiento documental.
- Integración con el portal del cliente.
- Flujo independiente de chequeo documental fuera de la visita de supervisión.

---

## Arquitectura

### Capas de documentos existentes

| Capa | Modelo Prisma | Config "Obligatorio en visita" | Cambio requerido |
|------|---------------|-------------------------------|-----------------|
| Global | `DocOperacional` (capa: global) | **No existe** | Agregar campo `obligatorioEnVisita` a `TipoDocOperacional` |
| Instalación | `DocOperacional` (capa: instalacion) | Ya existe en config supervisión | Migrar a `TipoDocOperacional.obligatorioEnVisita` |
| Guardia | `OpsDocumentoPersona` | **No existe** | Agregar campo `obligatorioEnVisita` a config de guardia-documentos |

### Nuevo modelo: Verificación Física

```prisma
model DocVerificacionFisica {
  id              String   @id @default(cuid())
  tenantId        String
  
  // Qué documento se verificó
  tipoDocId       String?           // FK → TipoDocOperacional (para global/instalación)
  guardiaDocType  String?           // código del tipo de doc guardia (para guardia)
  capa            String            // "global" | "instalacion" | "guardia"
  
  // Dónde se verificó
  installationId  String            // FK → CrmInstallation
  guardiaId       String?           // FK → Guardia (solo si capa=guardia)
  
  // Resultado
  presente        Boolean           // true=verificado OK, false=no encontrado
  photoUrl        String?           // URL de la foto subida
  photoKey        String?           // storage key
  notes           String?           // notas opcionales
  
  // Contexto de la visita
  supervisionId   String            // FK → OpsSupervision (la visita)
  supervisorId    String            // FK → User (el supervisor)
  
  // Hallazgo automático
  hallazgoId      String?           // FK → OpsHallazgo (si presente=false)
  
  createdAt       DateTime @default(now())
  
  // Relations
  tenant          Tenant            @relation(fields: [tenantId], references: [id])
  installation    CrmInstallation   @relation(fields: [installationId], references: [id])
  supervision     OpsSupervision    @relation(fields: [supervisionId], references: [id])
  supervisor      User              @relation(fields: [supervisorId], references: [id])
  tipoDoc         TipoDocOperacional? @relation(fields: [tipoDocId], references: [id])
  
  @@index([tenantId, installationId])
  @@index([tenantId, installationId, guardiaId])
  @@index([tenantId, tipoDocId])
}
```

### Cambios en modelos existentes

```prisma
// En TipoDocOperacional — agregar:
model TipoDocOperacional {
  // ... campos existentes ...
  obligatorioEnVisita  Boolean @default(false)  // NUEVO
  
  verificaciones  DocVerificacionFisica[]       // NUEVO relation
}
```

```typescript
// En guardia-documentos-config.ts — agregar a cada tipo:
{
  code: "certificado_os10",
  label: "Certificado OS-10",
  obligatorio: true,
  visibleFormulario: true,
  visibleFormTE: true,
  vence: true,
  diasAlerta: 90,
  obligatorioEnVisita: true,  // NUEVO
}
```

---

## Diseño de Vistas

### 1. Módulo Documentos — Navegación

Se agrega una tercera pestaña al subnav existente de Documentos:

```
Envíos (Presentaciones) | Gestión Documental | Docs Operativos [NUEVO]
```

Ruta: `/opai/documentos-operativos`

Dentro de Docs Operativos, dos sub-pestañas:
- **Por Instalación** (default)
- **Por Guardia**

### 2. Vista "Por Instalación" — Grilla Matricial

**Layout:** Tabla con scroll horizontal. Primera columna (instalación + % cumplimiento) sticky.

**Filas:** Una por instalación activa. Ordenadas por % cumplimiento ascendente (peores primero).

**Columnas:**
- Col 1 (sticky): Nombre instalación + "Última visita: hace X días" + barra de progreso mini.
- Col 2: % cumplimiento total (color-coded: verde ≥80%, amarillo 50-79%, rojo <50%).
- Col 3..N: Una columna por tipo de documento marcado como "obligatorio en visita" (filtro default) o todos (filtro alternativo).

**Header de columnas:** Nombre del documento + etiqueta de capa (Global / Instalación) en texto pequeño.

**Celdas:** Cada celda muestra 2 indicadores lado a lado:
- 📄 **Digital:** Verde si hay archivo cargado vigente, amarillo si por vencer, rojo si sin documento o vencido.
- 👁 **Físico:** Verde si última verificación fue positiva (presente=true), amarillo-dash si nunca verificado, rojo si última verificación fue negativa.

**Nota sobre documentos globales:** El indicador digital de un documento global es el mismo para todas las instalaciones (apunta al mismo archivo). El indicador físico es independiente por instalación.

**Filtros:**
- Búsqueda por nombre de instalación.
- Toggle de documentos: "Obligatorio en visita" (default) | "Todos".
- Opcional: filtro por capa (Global / Instalación).

**Click en celda:** Abre drawer lateral derecho.

### 3. Vista "Por Guardia" — Grilla con Acordeón

**Layout:** Tabla con instalaciones como filas colapsables.

**Fila de instalación (colapsada):**
- ▶ Nombre instalación + "X guardias" + "Última visita: hace X días".
- % cumplimiento promedio de guardias.
- "Click para expandir guardias".

**Fila de instalación (expandida):**
- ▼ Header con fondo púrpura sutil.
- Sub-filas: una por guardia asignado a esa instalación.
  - Avatar con iniciales (color-coded por % cumplimiento).
  - Nombre completo + RUT.
  - % cumplimiento individual.
  - Celdas de documentos con los mismos 2 indicadores (📄 + 👁).

**Columnas:** Tipos de documento de guardia marcados como "obligatorio en visita" (default) o todos.

**Filtros:** Mismos que vista por instalación + búsqueda por nombre o RUT de guardia.

**Múltiples instalaciones** pueden estar expandidas simultáneamente.

### 4. Drawer Lateral — Detalle de Documento

**Trigger:** Click en cualquier celda de las grillas.

**Ancho:** ~400px desktop. En mobile: bottom sheet full-screen.

**Contenido:**

**A. Cabecera:**
- Nombre del documento.
- Instalación (y guardia + RUT si aplica).
- Capa (Global / Instalación / Guardia).
- Badge "Obligatorio en visita" si aplica.

**B. Estado actual (2 tarjetas):**
- **Digital:** Estado del archivo (vigente / por_vencer / vencido / sin_documento). Si tiene archivo: nombre, tamaño, fecha de carga.
- **Físico:** Última verificación (fecha, resultado). Si nunca verificado: "Sin verificación".

**C. Historial de verificaciones físicas:**
- Timeline cronológico descendente (más reciente primero).
- Cada entrada muestra:
  - Indicador verde (presente) o rojo (no encontrado).
  - Nombre del supervisor.
  - Fecha y hora.
  - Link a la visita de supervisión (ej: "Visita #SVT-0412").
  - Thumbnail de la foto (click para ver full).
  - Si presente=false: badge de hallazgo crítico con código de ticket.

### 5. Supervisor Mobile — Chequeo en Visita

**Ubicación:** Paso 3 del wizard de supervisión existente (Step3Checklist). Se extiende el paso actual para cubrir las 3 capas de documentos de forma consistente.

**Layout mobile-first:**

**A. Sección: Documentos de la Instalación**
- Barra de progreso: "X de Y verificados".
- Lista de documentos (globales + instalación combinados, solo los marcados obligatorioEnVisita).
- Cada documento es una tarjeta con:
  - Nombre + etiqueta de capa + "Obligatorio".
  - Toggle switch (on = presente, off = no presente).
  - Si on: botón 📷 para tomar foto (obligatoria). Al tomar foto muestra thumbnail + "Foto cargada ✓".
  - Si off: mensaje de advertencia "Se generará hallazgo crítico".

**B. Sección: Documentos por Guardia**
- Header: "Documentos por Guardia" + "X guardias en turno".
- Acordeón por guardia (un guardia expandido a la vez).
- Cada guardia colapsado muestra: nombre, RUT, conteo rápido (ej: "2/3 ✓" o "0/3").
- Guardia expandido: lista de documentos con mismo patrón (toggle + foto).

**Comportamiento:**
- Toggle es de un tap (ágil).
- Foto abre cámara nativa directamente.
- Si un documento obligatorio queda en off al avanzar al siguiente paso → se crea hallazgo crítico automático con ticket.
- Los guardias mostrados son los asignados a la instalación en ese momento.
- Solo aparecen documentos de guardia marcados como `obligatorioEnVisita`.

---

## Configuración — Cambios en UI de Admin

### Docs. Globales (`/opai/configuracion/documentos-globales`)

Agregar toggle "Obligatorio en visita" a cada tipo de documento global, junto a los controles existentes de editar/eliminar.

### Docs. Guardias (`/opai/configuracion/ops?tab=docs-guardias`)

Agregar toggle "Obligatorio en visita" a cada tipo de documento de guardia, junto a los toggles existentes (Obligatorio, Visible formulario, Visible form. TE, Vence).

### Docs. Instalación (`/opai/configuracion/ops?tab=docs-instalacion`)

Ya tiene el toggle. No requiere cambios.

---

## API Endpoints

### Nuevos

```
GET  /api/operacional/verificaciones-fisicas
     ?installationId=X&tipoDocId=Y&guardiaId=Z&capa=global|instalacion|guardia
     → Lista de verificaciones con paginación

GET  /api/operacional/grilla-docs
     ?filtro=obligatorio_visita|todos&capa=global|instalacion
     → Datos agregados para la grilla: por instalación, con estado digital + último chequeo físico

GET  /api/operacional/grilla-guardias
     ?filtro=obligatorio_visita|obligatorio|todos&installationId=X
     → Datos agregados para la grilla de guardias: por instalación→guardia

POST /api/operacional/verificaciones-fisicas
     body: { supervisionId, installationId, verificaciones: [...] }
     → Guardar batch de verificaciones desde la visita del supervisor
```

### Modificados

```
GET  /api/ops/supervision/document-types
     → Agregar campo obligatorioEnVisita en la respuesta

POST /api/ops/supervision/{visitId}/checklist
     → Extender para incluir verificaciones de las 3 capas + fotos
```

---

## Cálculo de Cumplimiento

### Por Instalación (vista "Por Instalación")

```
% = (docs con estado digital vigente + docs con verificación física positiva) 
    / (total docs obligatorios × 2 dimensiones)
```

Simplificado: se cuentan los "checks verdes" sobre el total posible.

### Por Guardia (vista "Por Guardia")

```
% guardia = checks verdes del guardia / (total docs guardia obligatorioEnVisita × 2)
% instalación = promedio de % de todos sus guardias
```

---

## Responsive Design

| Componente | Desktop (≥1024px) | Tablet (768-1023px) | Mobile (<768px) |
|-----------|-------------------|---------------------|-----------------|
| Grilla instalación | Tabla completa, scroll-x, col sticky | Tabla con scroll-x, col sticky | Tabla con scroll-x, col sticky más angosta |
| Grilla guardias | Tabla con acordeón | Tabla con acordeón | Cards con acordeón (sin tabla) |
| Drawer | Panel lateral 400px | Panel lateral 350px | Bottom sheet full-screen |
| Supervisor chequeo | N/A (portal mobile-only) | Cards full-width | Cards full-width (diseño primario) |

### Mobile-specific para grillas

- Primera columna (instalación/guardia) fija con ancho reducido.
- Resto de columnas con scroll horizontal.
- Touch-friendly: celdas con min 44px tap target.
- Swipe horizontal habilitado.

---

## Flujo de Datos

```
Configuración (Admin)
  └→ TipoDocOperacional.obligatorioEnVisita = true/false
  └→ guardia-documentos-config.obligatorioEnVisita = true/false

Supervisor hace visita (Mobile)
  └→ Wizard Step 3: ve docs con obligatorioEnVisita=true
  └→ Toggle + foto por documento (instalación + guardia)
  └→ Al guardar: POST /api/operacional/verificaciones-fisicas
      └→ Crea DocVerificacionFisica por cada documento chequeado
      └→ Si presente=false → crea OpsHallazgo automático

Módulo Documentos (Desktop/Tablet)
  └→ GET /api/operacional/grilla-docs → renderiza grilla
  └→ Click celda → GET /api/operacional/verificaciones-fisicas?... → drawer con historial
```

---

## Archivos Clave a Modificar/Crear

### Nuevos archivos
- `src/app/(app)/opai/documentos-operativos/page.tsx` — Página principal
- `src/components/docs/DocsOperativosClient.tsx` — Client component principal
- `src/components/docs/GrillaDocsInstalacion.tsx` — Grilla por instalación
- `src/components/docs/GrillaDocsGuardias.tsx` — Grilla por guardia
- `src/components/docs/DocVerificacionDrawer.tsx` — Drawer lateral
- `src/app/api/operacional/verificaciones-fisicas/route.ts` — CRUD verificaciones
- `src/app/api/operacional/grilla-docs/route.ts` — API grilla instalación
- `src/app/api/operacional/grilla-guardias/route.ts` — API grilla guardias

### Archivos a modificar
- `prisma/schema.prisma` — Nuevo modelo DocVerificacionFisica + campo obligatorioEnVisita en TipoDocOperacional
- `src/lib/guardia-documentos-config.ts` — Agregar obligatorioEnVisita a cada tipo
- `src/lib/instalacion-documentos.ts` — Alinear con TipoDocOperacional
- `src/components/supervision/wizard/Step3Checklist.tsx` — Extender para 3 capas + fotos
- `src/components/opai/DocumentosSubnav.tsx` — Agregar pestaña "Docs Operativos"
- `src/lib/module-nav.ts` — Agregar ruta docs-operativos
- `src/app/(app)/opai/configuracion/documentos-globales/` — Toggle obligatorioEnVisita
- `src/app/(app)/opai/configuracion/ops/` — Toggle en tab docs-guardias

---

## Mockups

Los mockups interactivos se encuentran en:
- `.superpowers/brainstorm/94592-1775762582/content/mockup-grilla-instalacion.html`
- `.superpowers/brainstorm/94592-1775762582/content/mockup-grilla-guardias.html`
- `.superpowers/brainstorm/94592-1775762582/content/mockup-drawer.html`
- `.superpowers/brainstorm/94592-1775762582/content/mockup-supervisor-mobile.html`
