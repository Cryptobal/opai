# OPAI — FASE 6: Auditoría de Documentos

**Fecha:** 2026-03-12  
**Objetivo:** Mapear el sistema de documentos para implementar carpetas (6.1), toggle visibilidad portal (6.2) y QA portal (6.3).

---

## 6.1 Carpetas — Auditoría

### Modelos que manejan documentos

| Modelo | Schema | Uso | ¿Tiene folder/category/parentId? |
|--------|--------|-----|----------------------------------|
| **Document** | docs | Contratos, cartas laborales, propuestas. Asociado vía DocAssociation a crm_account, crm_deal, crm_installation, crm_contact, ops_guardia. | `category` = tipo de documento (contrato_servicio, etc.), **no** carpetas |
| **DocAssociation** | docs | Vincula Document a entidades (entityType + entityId) | No |
| **OpsDocumentoPersona** | ops | Documentos de guardias: certificados, OS-10, cédula, currículum, contrato, anexo. Campos: guardiaId, type, fileUrl, status, issuedAt, expiresAt | No |
| **CrmFile** + **CrmFileLink** | crm | Archivos adjuntos genéricos. entityType: lead, deal, account, contact, installation, guardia | No |
| **ProtocolDocument** | crm | PDFs del protocolo de instalación (scope: global | installation) | No |
| **ProtocolSection** | crm | Secciones del protocolo (items de texto). Tiene portalVisible | No (es sección, no documento) |

### ¿Sistema unificado o fragmentado?

**Fragmentado.** Hay 4 sistemas distintos:

1. **Document + DocAssociation** — Módulo docs (contratos firmados, plantillas, cartas). Usado en: cuentas CRM, deals, instalaciones, contactos, guardias.
2. **OpsDocumentoPersona** — Documentos de guardias (certificados, curriculum, etc.). Solo guardias.
3. **CrmFile + CrmFileLink** — Archivos adjuntos genéricos. Usado en: leads, deals, accounts, contacts, installations, guardias.
4. **ProtocolDocument** — PDFs del protocolo de instalación. Solo instalaciones.

### ¿Dónde se renderizan las listas de documentos?

| Ubicación | Componente | Modelo usado |
|-----------|------------|---------------|
| Ficha guardia | `DocumentosSection` | OpsDocumentoPersona |
| Ficha guardia | `FileAttachments` (tab "Documentos adicionales") | CrmFile |
| Ficha guardia | `DocsVinculadosSection` | Document + DocAssociation (ops_guardia) |
| Ficha instalación | `FileAttachments` (tab Documentos) | CrmFile |
| Ficha instalación | `InstalacionDocumentosGuardiasTab` | OpsDocumentoPersona (de guardias asignados) |
| Ficha cuenta | `AccountContractsSection` | Document (crm_account) |
| Ficha cuenta | `FileAttachments` (tab files) | CrmFile |
| Ficha deal | `FileAttachments` | CrmFile |
| Ficha contact | `FileAttachments` | CrmFile |
| Ficha lead | (no hay FileAttachments en lead?) | — |
| Módulo docs | `DocsClient` | Document |

### Tipos de documentos por entidad

| Entidad | OpsDocumentoPersona | Document | CrmFile |
|---------|---------------------|----------|---------|
| Guardia | ✅ (principal) | ✅ (contratos laborales, cartas) | ✅ (adicionales) |
| Instalación | — | ✅ (asociado) | ✅ |
| Cuenta | — | ✅ (contratos cliente) | ✅ |
| Deal | — | ✅ | ✅ |
| Contact | — | ✅ | ✅ |
| Lead | — | — | ✅ |

### Recomendación para carpetas (6.1)

**Opción A — Sistema unificado (DocumentFolder genérico):**
- Crear modelo `DocumentFolder` con: id, name, parentId (nullable), entityType, entityId, tenantId, sortOrder.
- entityType podría ser: "crm_account" | "crm_installation" | "ops_guardia" | etc.
- Agregar `folderId` nullable a: Document, OpsDocumentoPersona, CrmFileLink, ProtocolDocument.
- **Pro:** Un solo modelo de carpetas, reutilizable.
- **Contra:** 4 migraciones (una por tabla que recibe folderId).

**Opción B — Carpetas por sistema:**
- `DocumentFolder` solo para Document (docs).
- `OpsDocumentoFolder` para OpsDocumentoPersona.
- `CrmFileFolder` para CrmFileLink (o folderId en CrmFileLink).
- `ProtocolDocumentFolder` para ProtocolDocument.
- **Pro:** Cada módulo independiente.
- **Contra:** Duplicación de lógica, 4 implementaciones de UI.

**Recomendación:** Opción A con modelo genérico `DocumentFolder(entityType, entityId, name, parentId)`. Los documentos de cada sistema tendrían `folderId` opcional apuntando a carpetas de su entityType/entityId.

---

## 6.2 Toggle visibilidad portal — Auditoría

### ¿Existe campo portalVisible / clientVisible?

| Modelo | portalVisible | Default |
|--------|---------------|---------|
| **Document** | ✅ Sí | false |
| **OpsDocumentoPersona** | ❌ No | — |
| **CrmFile** / **CrmFileLink** | ❌ No | — |
| **ProtocolDocument** | ❌ No | — |
| **ProtocolSection** | ✅ Sí | true |

### ¿Document aplica a todos los tipos?

Sí. `Document` tiene `portalVisible` y se usa para contratos de cuenta (crm_account). El portal filtra por `portalVisible: true` en `/api/portal/cliente/contracts`.

### ¿OpsDocumentoPersona tiene visibilidad?

**No.** El portal `/api/portal/cliente/personal` devuelve **todos** los documentos del guardia sin filtrar. No hay forma de ocultar documentos sensibles del cliente.

### ¿El portal filtra por visibilidad?

| Endpoint | Filtra portalVisible |
|----------|----------------------|
| `/api/portal/cliente/contracts` | ✅ Sí (Document) |
| `/api/portal/cliente/personal` | ❌ No (OpsDocumentoPersona no tiene campo) |
| `/api/portal/cliente/protocolos` | ✅ Sí (ProtocolSection.portalVisible) |

### ¿Hay toggle en UI del ERP?

| Documento | Toggle en ERP |
|-----------|---------------|
| Document (contratos) | ✅ Sí — `AccountContractsSection` tiene botón ojo con/sin relleno |
| OpsDocumentoPersona | ❌ No |
| CrmFile | ❌ No |
| ProtocolDocument | ❌ No |

### Acciones requeridas (6.2)

1. **OpsDocumentoPersona:** Agregar `portalVisible Boolean @default(false)`.
2. **API `/api/portal/cliente/personal`:** Filtrar documentos por `portalVisible: true`.
3. **UI DocumentosSection (ficha guardia):** Agregar toggle ojo para cada documento.
4. **CrmFile / CrmFileLink:** Decidir si agregar `portalVisible`. Hoy el portal **no** muestra CrmFile en ninguna vista. Si en el futuro se muestran archivos adjuntos de instalación/guardia en el portal, haría falta.
5. **ProtocolDocument:** Hoy el portal no muestra ProtocolDocument directamente (solo ProtocolSection con items de texto). Si se agregan PDFs de protocolo al portal, haría falta portalVisible.

---

## 6.3 QA Portal — Auditoría

### ¿Qué endpoint usa el portal para documentos?

| Sección portal | Endpoint | Datos |
|----------------|----------|-------|
| **Documentos > Contratos** | `/api/portal/cliente/contracts` | Document con portalVisible=true, module=crm, category en CONTRACT_CATEGORIES |
| **Documentos > Protocolos** | `/api/portal/cliente/protocolos` | ProtocolSection con portalVisible=true (secciones + items, no PDFs) |
| **Personal** | `/api/portal/cliente/personal` | Guardias con OpsDocumentoPersona (sin filtro portalVisible) |

### ¿Filtra por portalVisible?

- Contratos: ✅ Sí
- Protocolos: ✅ Sí (secciones)
- Personal (documentos guardias): ❌ No — OpsDocumentoPersona no tiene el campo

### ¿Muestra documentos de guardias?

Sí. En **PortalPersonal** (sección "Personal asignado") se expande cada guardia y se listan sus `documentos` (OpsDocumentoPersona). **Todos** se muestran porque no hay filtro.

### ¿Muestra documentos de instalación?

**No.** No hay endpoint ni UI en el portal para:
- CrmFile de instalación (FileAttachments)
- ProtocolDocument (PDFs del protocolo)
- Document asociado a crm_installation

El portal solo muestra: contratos de cuenta, protocolos (secciones de texto), documentos de guardias en Personal.

### ¿Hay sección de documentos de instalación en el portal?

No. El tab "Documentos" del portal tiene: Contratos y Protocolos. No hay "Documentos de instalación" ni "Documentos de guardias" como sección separada — los de guardias están dentro de "Personal".

### Verificaciones y correcciones (6.3)

1. **OpsDocumentoPersona sin portalVisible:** Al agregar el campo (6.2), actualizar `/api/portal/cliente/personal` para filtrar `documents: { where: { portalVisible: true } }`.
2. **Documentos con portalVisible=true por defecto:** ProtocolSection tiene `@default(true)`. Document tiene `@default(false)`. OpsDocumentoPersona (nuevo) debe ser `@default(false)` para no exponer nada sin decisión explícita.
3. **Documentos de instalación en portal:** Hoy no se muestran. Si el requerimiento es "documentos de la instalación (con portalVisible=true)", habría que:
   - Agregar `portalVisible` a CrmFile o CrmFileLink (o crear tabla intermedia).
   - Crear endpoint `/api/portal/cliente/instalaciones/[id]/documentos` o similar.
   - Agregar sección en PortalDocumentos o en la vista de instalación del portal.

---

## Resumen consolidado para decisiones

### 6.1 Carpetas

- **Estado:** No existe ningún campo de carpetas. Listas planas en todos los módulos.
- **Sistemas afectados:** Document, OpsDocumentoPersona, CrmFileLink, ProtocolDocument.
- **Decisión:** ¿Unificar con DocumentFolder genérico o carpetas por módulo?
- **Migración:** Depende de la opción. Ejemplo para Opción A:
  - Crear tabla `document_folders`.
  - Agregar `folder_id` nullable a `documents`, `documentos_persona`, `file_links`, `protocol_documents`.

### 6.2 Toggle visibilidad

- **Document:** Ya tiene portalVisible y toggle en AccountContractsSection. ✅
- **OpsDocumentoPersona:** Falta campo y toggle. Alta prioridad porque el portal ya muestra estos documentos sin filtro.
- **CrmFile:** No se muestra en portal. Baja prioridad salvo que se agregue esa funcionalidad.
- **ProtocolDocument:** No se muestra en portal. Baja prioridad.

### 6.3 QA Portal

- **Contratos:** Correcto. Filtra portalVisible.
- **Protocolos:** Correcto. Filtra portalVisible en secciones.
- **Personal (documentos guardias):** Incorrecto. Muestra todos los OpsDocumentoPersona. Requiere 6.2 primero.
- **Documentos de instalación:** No existen en el portal. ¿Se requieren? Si sí, hay que diseñar endpoint + UI + portalVisible en CrmFile/ProtocolDocument.

---

## Archivos clave (referencia)

### 6.1 Carpetas
- `prisma/schema.prisma` — Document, OpsDocumentoPersona, CrmFileLink, ProtocolDocument
- `src/components/crm/FileAttachments.tsx`
- `src/components/ops/guardia-sections/DocumentosSection.tsx`
- `src/components/crm/AccountContractsSection.tsx` (Document)
- `src/components/crm/InstalacionDocumentosGuardiasTab.tsx`

### 6.2 Toggle
- `prisma/schema.prisma` — OpsDocumentoPersona
- `src/app/api/portal/cliente/personal/route.ts`
- `src/components/ops/guardia-sections/DocumentosSection.tsx`
- `src/app/api/personas/guardias/[id]/documents/route.ts` — PATCH con documentId. Agregar `portalVisible` al schema y al update.
- `src/lib/validations/ops.ts` — `createGuardiaDocumentSchema` / `updateGuardiaDocumentSchema`

### 6.3 QA
- `src/app/api/portal/cliente/personal/route.ts`
- `src/app/api/portal/cliente/contracts/route.ts`
- `src/components/portal/cliente/PortalPersonal.tsx`
- `src/components/portal/cliente/PortalDocumentos.tsx`
