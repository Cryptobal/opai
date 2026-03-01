# ETAPA 8 — RONDAS 2.0: Dashboard de Cliente (Portal Externo)

## Reporte Pre-Implementación

---

## 1. Verificación Etapas 1-7

| Etapa | Estado |
|-------|--------|
| 1-7 | ✅ Todas completas |

---

## 2. Portal de cliente existente

**No existe ningún portal de cliente.** Solo existe el Portal del Guardia:
- `/portal/guardia` — autenticación por RUT + PIN
- APIs bajo `/api/portal/guardia/*`

El middleware ya marca `/portal/*` como público, así que `/portal/[token]` será accesible sin sesión OPAI.

---

## 3. Modelos relevantes

### CrmInstallation
- `id`, `tenantId`, `accountId`, `name`, `address`, `city`, `commune`, `lat`, `lng`, `isActive`
- **No tiene** `portalToken` → hay que agregar campos
- Relación: `account → CrmAccount`

### CrmAccount
- `id`, `tenantId`, `name`, `rut`, `legalName`, `website`, `status`
- Relación: `contacts → CrmContact[]`, `installations → CrmInstallation[]`

### CrmContact
- `id`, `accountId`, `firstName`, `lastName`, `email`, `phone`, `roleTitle`, `isPrimary`
- Email disponible para enviar link del portal

### Seguridad
- `CrmContact.email` → para enviar link al contacto principal del cliente
- **No exponer:** RUT de guardias, costos, datos payroll, datos de otros clientes

---

## 4. Patrón de autenticación por token

El proyecto usa tokens en varios contextos:
- **Firma electrónica:** `DocumentRecipient.token` (UUID en BD)
- **Postulación:** token fijo en env var
- **Marcación:** `marcacionCode` (8 chars) en CrmInstallation

**Para el portal de cliente:** Agregar campos directamente a `CrmInstallation`:
```
portalToken         String?   @unique
portalTokenEnabled  Boolean   @default(false)
portalTokenCreatedAt DateTime?
```

---

## 5. Email

- **Resend** (`src/lib/resend.ts`) — cliente configurado con `RESEND_API_KEY`
- `getTenantEmailConfig(tenantId)` — obtiene from/replyTo por tenant
- Plantillas React Email en `src/emails/`
- **Patrón:** crear `PortalClienteEmail.tsx` como plantilla React Email

---

## 6. Migración de esquema

Agregar 3 campos a `CrmInstallation`:

```sql
ALTER TABLE crm.installations ADD COLUMN IF NOT EXISTS portal_token TEXT UNIQUE;
ALTER TABLE crm.installations ADD COLUMN IF NOT EXISTS portal_token_enabled BOOLEAN DEFAULT false;
ALTER TABLE crm.installations ADD COLUMN IF NOT EXISTS portal_token_created_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_crm_installations_portal_token ON crm.installations(portal_token);
```

Actualizar `prisma/schema.prisma` — `CrmInstallation`:
```prisma
portalToken          String?   @unique @map("portal_token")
portalTokenEnabled   Boolean   @default(false) @map("portal_token_enabled")
portalTokenCreatedAt DateTime? @map("portal_token_created_at") @db.Timestamptz(6)
```

---

## 7. Plan de archivos

```
prisma/
├── schema.prisma                               # MODIFICAR: agregar portalToken a CrmInstallation
├── migrations/20260301000002_.../migration.sql  # NUEVO: migración SQL

src/
├── app/portal/[token]/
│   ├── layout.tsx                               # Layout standalone (sin sidebar OPAI)
│   └── page.tsx                                 # Server: validar token, fetch datos, pasar a client
│   └── PortalClienteClient.tsx                  # Client: KPIs, gráfico, top guardias, timeline, export
├── app/api/portal/[token]/
│   ├── validate/route.ts                        # GET: validar token
│   ├── summary/route.ts                         # GET: KPIs mes actual + anterior
│   ├── compliance/route.ts                      # GET: datos gráfico cumplimiento
│   ├── guards/route.ts                          # GET: top 3 guardias (sin datos sensibles)
│   ├── activity/route.ts                        # GET: últimas 20 actividades
│   └── export-pdf/route.ts                      # GET: generar PDF
├── app/api/ops/rondas/portal/
│   ├── generate-token/route.ts                  # POST: generar/regenerar token
│   └── send-email/route.ts                      # POST: enviar link por email
├── components/ops/rondas/
│   └── PortalClienteManager.tsx                 # Sección en config: toggle, link, copiar, enviar email
├── emails/
│   └── PortalClienteEmail.tsx                   # Plantilla React Email para enviar link
├── lib/rondas/
│   └── portal-helpers.ts                        # Helper: validar token, sanitizar nombres
```

---

## 8. APIs del portal (seguridad)

Cada API bajo `/api/portal/[token]/*`:
1. Lee `token` del path
2. Busca `CrmInstallation` con `portalToken = token` y `portalTokenEnabled = true`
3. Si no existe → 404
4. Todas las queries filtran por `installationId`
5. Nombres de guardias: `firstName + inicial apellido` (ej: "Juan P.")
6. NUNCA retorna: RUT, costos, datos bancarios, datos de otros clientes

---

## 9. Componentes del portal

### Layout `/portal/[token]/layout.tsx`
- Standalone (sin AppShell de OPAI)
- Dark theme, min-h-dvh
- Header: "Portal de Seguridad" + nombre instalación
- Footer: "Powered by Gard Security · Última actualización"

### KPIs (4 cards)
- Cumplimiento mensual (%) con trend vs mes anterior
- Rondas completadas (X/Y)
- Trust Score promedio con trend
- Alertas del mes con trend

### Gráfico cumplimiento
- Reutilizar `RondasComplianceChart` (Recharts BarChart)
- Selector: 7d / 14d / 30d

### Top guardias
- Solo primer nombre + inicial apellido
- Count rondas + Trust promedio
- Medallas (oro/plata/bronce)

### Timeline actividad
- Últimas 20 actividades combinadas (rondas completadas/incompletas + alertas)
- Iconos por tipo, formato hora + descripción

### Export PDF
- Reutilizar `@react-pdf/renderer` con layout similar a `RondasReportPDF`
- KPIs + gráfico (captura SVG) + top guardias + actividad

---

## 10. Gestión desde OPAI

Componente `PortalClienteManager` integrado en la página de configuración de rondas (`RondasConfiguracionClient`):
- Toggle habilitar/deshabilitar
- URL con botón copiar
- Botón regenerar token
- Botón enviar por email (usa contacto primario del CrmAccount)

---

## 11. Riesgos

| Riesgo | Mitigación |
|--------|------------|
| Token adivinable | UUID v4 (122 bits de entropía) |
| Token filtrado | Botón regenerar disponible |
| Datos sensibles expuestos | Sanitización estricta en cada API |
| CrmInstallation sin account | Mostrar solo nombre de instalación |
| Middleware ya cubre `/portal/*` | ✅ No requiere cambio |

---

## 12. Confirmación requerida

1. ¿Aprobar plan y estructura de archivos?
2. ¿Aplicar migración directa con SQL idempotente (como Etapa 1) o usar `prisma db push`?
   - **Recomendación:** SQL directo idempotente, consistente con Etapa 1.
3. ¿El componente `PortalClienteManager` va dentro de `RondasConfiguracionClient` (como nuevo tab) o como sección visible cuando se selecciona una instalación?
   - **Recomendación:** Sección visible cuando hay instalación seleccionada (debajo de los tabs existentes), similar a `PatrullajeLink`.

---

*Reporte generado como paso previo a la implementación de la Etapa 8.*
