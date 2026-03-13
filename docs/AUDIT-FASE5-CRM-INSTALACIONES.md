# Auditoría Fase 5: CRM / Instalaciones

**Fecha:** 2026-03-12  
**Objetivo:** Documentar el estado actual antes de implementar 5.1, 5.2 y 5.3.

---

## 5.1 Tres estados de instalación: Prospecto → Activa → Inactiva

### Estado actual

| Aspecto | Hallazgo |
|--------|----------|
| **Campo de estado** | `CrmInstallation` usa **boolean `isActive`** (`@default(false)`). No hay enum. |
| **Valor por defecto** | `false` (Prospecto implícito). `true` = Activa. No existe "Inactiva" explícita. |
| **Índice** | `idx_crm_installations_is_active` en `is_active` |

### Lugares donde se crea instalación

| Origen | Archivo | Valor asignado |
|-------|---------|----------------|
| **API CRM** | `src/app/api/crm/installations/route.ts` | `isActive: body.isActive ?? false` |
| **API Ops** | `src/app/api/ops/instalaciones/route.ts` | **No asigna `isActive`** → usa default del schema (`false`) |
| **Aprobar lead** | `src/app/api/crm/leads/[id]/approve/route.ts` | **No asigna `isActive`** en `crmInstallation.create` (líneas 529, 834) → default `false` |
| **Script migración** | `scripts/migrate-ops-data.ts` | Asigna explícitamente (scripts legacy) |

### Queries que filtran por `isActive` (CrmInstallation)

**Solo activas (`isActive: true`):**

- `src/app/api/ops/instalaciones/route.ts` — GET: `account: { type: "client", isActive: true }, isActive: true`
- `src/app/api/public/marcacion/*` — validar, registrar, lookup-guardia, face-verify, face-register, mis-marcaciones
- `src/app/api/public/ronda/*` — validar, pendientes, iniciar, autenticar, panico
- `src/app/api/portal/rondas/*` — iniciar-libre, mis-rondas, panico, incidente
- `src/app/api/ops/rondas/*` — monitoreo, turno/start, dashboard, control-nocturno
- `src/app/api/ops/control-nocturno/route.ts`
- `src/app/api/chat/channels/provision/route.ts` — `chatEnabled: true, isActive: true`
- `src/app/api/portal/cliente/*` — personal, empresa, cotizaciones, comparativa, access-control, rondas, tickets, encuestas, posta, contract-data, forgot-pin
- `src/lib/portal-cliente.ts` — `installations: { where: { isActive: true } }`
- `src/lib/portal-chat-auth.ts`
- `src/lib/docs/token-resolver.ts` — `where: { isActive: true }` en instalaciones
- `src/app/api/access-control/*` — device, lists, validate-rut, ocr-plate
- `src/app/api/patrol/login/route.ts`
- `src/app/api/search/global/route.ts` — filtros para supervisor hub
- `src/app/api/crm/search/route.ts`
- `src/app/(app)/hub/_lib/hub-queries.ts`
- `src/app/(app)/ops/page.tsx` — count `isActive: true`
- `src/app/(app)/crm/page.tsx` — count `isActive: true`
- `src/lib/payroll/resolve-attendance.ts` — `some: { isActive: true }`
- `src/app/api/cron/portal-reportes/route.ts`
- `src/app/api/cron/rondas/generar/route.ts`
- `src/lib/rondas/alert-engine.ts`
- `src/lib/rondas/guardia-assignment.ts`
- `src/lib/rondas/generate-grid.ts`
- `src/lib/pwa/push-service.ts`

**Solo prospectos (`isActive: false`):**

- `src/app/api/portal/supervisor/search-installations/route.ts` — búsqueda para visita técnica
- `src/app/api/portal/supervisor/visitas-tecnicas/route.ts` — permite activas O prospectos

**Lista CRM (condicional):**

- `src/app/(app)/crm/installations/page.tsx` — si `!canSeeDeals` → `isActive: true`; si `canSeeDeals` → sin filtro (muestra todas)

**PATCH / toggle:**

- `src/app/api/crm/installations/[id]/route.ts` — PATCH acepta `isActive`, puede activar/desactivar cuenta
- `src/components/crm/CrmInstallationDetailClient.tsx` — botón toggle Activar/Desactivar
- `src/components/portal/supervisor/SupervisorInstalacionDetail.tsx` — muestra "Activa" / "Prospecto"

### Portal cliente / prospecto

- **portal-cliente.ts:** `installations: { where: { isActive: true } }` — el portal del cliente **solo ve instalaciones activas**.
- Prospectos no aparecen en el portal cliente (correcto para el flujo actual).

### Cantidad de instalaciones en DB

No se ejecutó query. Para obtener conteo:

```sql
SELECT is_active, COUNT(*) FROM crm.installations GROUP BY is_active;
```

---

## 5.2 Mover Instalaciones de CRM a Operaciones en sidebar

### Configuración del sidebar

| Archivo | Rol |
|---------|-----|
| `src/components/opai/AppLayoutClient.tsx` | Define `navItems` con estructura principal (sidebar izquierdo) |
| `src/lib/module-nav.ts` | Define `CRM_ITEMS`, `OPS_ITEMS`, `MODULE_DETECTIONS` para **bottom nav** (según ruta) |

### Estructura actual

**AppLayoutClient.tsx (sidebar):**

- **Comercial** (children): Leads, Cuentas, **Instalaciones**, Negocios, Contactos, Cotizaciones
- **Operaciones** (children): Pautas, Supervisión, Tickets, Rondas, Inventario

**module-nav.ts (bottom nav):**

- `CRM_ITEMS`: leads, accounts, **installations**, deals, contacts, quotes
- `OPS_ITEMS`: pauta_mensual, pauta_diaria, refuerzos, marcaciones, ppc, rondas, tickets
- `MODULE_DETECTIONS`: si path `/crm/*` → CRM_ITEMS; si path `/ops/*` → OPS_ITEMS

### Permisos

- Instalaciones usan **`crm.installations`** (`SUBMODULE_META`, `canView(perms, 'crm', 'installations')`).
- No existe `ops.installations` como submódulo.
- Si se mueve visualmente a Operaciones: un usuario con acceso a Ops pero no a CRM **no vería Instalaciones** hoy, porque el permiso es `crm.installations`.

### Rutas

- Instalaciones: `/crm/installations` y `/crm/installations/[id]`
- **No cambiar rutas** — solo posición en sidebar.

### Impacto de mover

1. **AppLayoutClient.tsx:** Mover el item `{ href: '/crm/installations', label: 'Instalaciones', ... }` de `children` de Comercial a `children` de Operaciones.
2. **module-nav.ts:** Si el usuario está en `/crm/installations` o `/crm/installations/[id]`, el bottom nav sigue usando `CRM_ITEMS` porque `MODULE_DETECTIONS` usa `p.startsWith("/crm/")`. Habría que decidir si Instalaciones debe aparecer en bottom nav cuando está en Ops (path seguiría siendo `/crm/...`).
3. **Permisos:** Para que un usuario con Ops pero sin CRM vea Instalaciones, habría que:
   - Añadir `ops.installations` como submódulo y dar permiso, **o**
   - Hacer que el item Instalaciones se muestre si `canView(perms, 'crm', 'installations')` **o** `canView(perms, 'ops', 'X')` (donde X sea un submódulo que tenga sentido). La especificación dice: "un usuario con acceso a Operaciones pero no CRM debería poder ver Instalaciones" — eso implica **cambiar el modelo de permisos** para Instalaciones (o duplicar el permiso en ops).

---

## 5.3 Documentos de guardias en ficha de instalación

### Vinculación guardias ↔ instalaciones

| Modelo | Relación |
|-------|----------|
| **OpsAsignacionGuardia** | `installationId` → `CrmInstallation`. Guardias asignados a puestos de una instalación. |
| **OpsGuardia.currentInstallationId** | Instalación actual del guardia (derivada de asignación activa). |

Para obtener guardias de una instalación:

```ts
prisma.opsAsignacionGuardia.findMany({
  where: { installationId, isActive: true },
  include: { guardia: { include: { persona: true } } }
})
```

O vía `installation.opsAsignacionGuardias` (relación en schema).

### Documentos de guardia

| Modelo | Uso |
|--------|-----|
| **OpsDocumentoPersona** | Documentos del guardia: certificados, OS-10, cédula, currículum, contrato, anexo, etc. Campos: `guardiaId`, `type`, `fileUrl`, `status`, `issuedAt`, `expiresAt`. **No tiene campo `hidden`/`portalVisible`.** |
| **Document + DocAssociation** | Documentos del módulo docs (contratos laborales, cartas) asociados a `entityType: "ops_guardia"`. Tienen `portalVisible`. |

### Vista actual en ficha de instalación

- **CrmInstallationDetailClient.tsx** — Tabs: General, Puestos, Dotación, Protocolo, Rondas, Control Acceso, **Documentos** (FileAttachments por `entityType: "installation"`), Actividad.
- El tab "Documentos" usa `FileAttachments` con `entityType="installation"` — son archivos adjuntos de la instalación, **no** documentos de guardias.

### Tipos de documento (OpsDocumentoPersona)

Definidos en `DOC_LABEL` (DocumentosSection.tsx): certificado_antecedentes, certificado_os10, cedula_identidad, curriculum, contrato, anexo_contrato, certificado_ensenanza_media, certificado_afp, certificado_fonasa_isapre.

### Toggle de visibilidad

- **OpsDocumentoPersona:** no tiene campo de visibilidad.
- **Document (docs):** tiene `portalVisible`. Si se incluyen documentos de tipo Document en la vista, habría que filtrar por `portalVisible` si aplica.

---

## Resumen de decisiones pendientes

### 5.1 (Estados)

1. **Migración:** `isActive` boolean → enum `installation_status` con `prospect` | `active` | `inactive`.
2. **Mapeo de datos:** `false` → `prospect`; `true` → `active`. No hay "inactive" hoy; habría que definir si las instalaciones desactivadas pasan a `inactive` o se mantiene lógica especial.
3. **Transiciones UI:** Prospecto → Activa (botón "Activar"); Activa → Inactiva (botón "Desactivar"). ¿Inactiva → Activa? (reactivar)
4. **Queries:** Reemplazar `isActive: true` por `status: 'active'` (y equivalentes para prospect/inactive según contexto).
5. **Portal cliente:** Mantener `status: 'active'` para instalaciones visibles.
6. **API Ops instalaciones GET:** Hoy filtra `isActive: true` y `account.type: "client"`. Con enum: `status: 'active'`.

### 5.2 (Sidebar)

1. Mover item Instalaciones de Comercial a Operaciones en `AppLayoutClient.tsx`.
2. Actualizar `module-nav.ts` si se quiere que en rutas `/crm/installations` el bottom nav muestre items de Ops (o dejar que siga en CRM por path).
3. **Permisos:** Definir si Instalaciones se controla por `crm.installations`, `ops.installations` o ambos. Si "usuario con Ops pero sin CRM debe ver Instalaciones", hace falta `ops.installations` o lógica equivalente.

### 5.3 (Documentos de guardias)

1. Nueva tab "Documentos de Guardias" en `CrmInstallationDetailClient.tsx`.
2. Query: `opsAsignacionGuardia` (activas) → `guardia` → `OpsDocumentoPersona` (documentos).
3. Opcional: incluir `Document` con `DocAssociation` a `ops_guardia` (filtrar `portalVisible` si aplica).
4. OpsDocumentoPersona no tiene toggle de visibilidad; mostrar todos los documentos del guardia.
5. Lista agrupada por guardia, cada documento con link para ver/descargar (`fileUrl`).

---

## Archivos clave a modificar (referencia)

### 5.1

- `prisma/schema.prisma` — CrmInstallation
- Migración SQL (generar con `prisma migrate dev` o manual)
- `src/app/api/crm/installations/route.ts`, `[id]/route.ts`
- `src/app/api/ops/instalaciones/route.ts`
- `src/app/api/crm/leads/[id]/approve/route.ts`
- `src/lib/validations/crm.ts`
- Todos los archivos listados en "Queries que filtran por isActive"
- `src/components/crm/CrmInstallationDetailClient.tsx`
- `src/components/portal/supervisor/SupervisorInstalacionDetail.tsx`
- `src/lib/portal-cliente.ts`

### 5.2

- `src/components/opai/AppLayoutClient.tsx`
- `src/lib/module-nav.ts` (opcional)
- `src/lib/permissions.ts` (si se añade ops.installations)

### 5.3

- `src/components/crm/CrmInstallationDetailClient.tsx` — nueva tab
- Nueva API o extensión de API de instalación para documentos de guardias (o fetch en cliente)
