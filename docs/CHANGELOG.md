# 📝 Changelog - Gard Docs

Todos los cambios notables del proyecto están documentados aquí.

---

## [0.5.1] - 2026-02-05

### ✨ AGREGADO: Preview de Email en Sidebar

**Sidebar flotante para ver el template de email antes de enviar.**

#### Agregado

**Frontend:**
- ✅ Sidebar flotante con tabs (Presentación / Email)
- ✅ Ruta `/preview/[sessionId]/email-preview` para ver template
- ✅ Preview con datos reales de la sesión
- ✅ Metadata del email (De, Para, Asunto)

**Archivos creados:**
- `src/components/preview/PreviewSidebar.tsx`
- `src/app/preview/[sessionId]/email-preview/page.tsx`

---

## [0.5.0] - 2026-02-05

### ✨ NUEVA FUNCIONALIDAD: Sistema de Email con Tracking

**Implementación completa del envío de presentaciones por email con tracking avanzado.**

#### Agregado

**Backend:**
- ✅ Endpoint `POST /api/presentations/send-email` para envío de emails
- ✅ Webhook `POST /api/webhook/resend` para tracking de eventos
- ✅ Integración completa con Resend API
- ✅ Template profesional de email con React Email
- ✅ Generación de uniqueId para links públicos
- ✅ Tracking de opens, clicks, delivered, bounces

**Frontend:**
- ✅ Modal de envío con campos CC dinámicos (hasta 5)
- ✅ Modal de confirmación con link público
- ✅ Botón compartir por WhatsApp
- ✅ Componente tracker de vistas automático
- ✅ Página pública `/p/[uniqueId]` sin autenticación

**Base de Datos:**
- ✅ 7 nuevos campos en modelo `Presentation`:
  - `ccEmails` (String[])
  - `deliveredAt` (DateTime?)
  - `firstOpenedAt` (DateTime?)
  - `lastOpenedAt` (DateTime?)
  - `openCount` (Int)
  - `clickCount` (Int)
  - `lastClickedAt` (DateTime?)

**Documentación:**
- ✅ `docs/EMAIL-SYSTEM.md` - Documentación completa
- ✅ `docs/QUICK-START-EMAIL.md` - Guía rápida de configuración
- ✅ `IMPLEMENTATION-SUMMARY.md` - Resumen de implementación
- ✅ `DEPLOYMENT-CHECKLIST.md` - Checklist de deployment

#### Modificado

- 🔄 `src/components/preview/PreviewActions.tsx` - Integración de modales
- 🔄 `prisma/schema.prisma` - Campos de tracking agregados
- 🔄 `docs/ESTADO-PROYECTO.md` - Actualizado a versión 0.5.0

#### Dependencias

**Agregadas:**
```json
{
  "resend": "^latest",
  "react-email": "^latest",
  "@react-email/components": "^latest",
  "@react-email/render": "^latest"
}
```

#### Archivos Creados

Total: **11 archivos nuevos**

```
src/emails/
└── PresentationEmail.tsx

src/lib/
└── resend.ts

src/app/api/
├── presentations/send-email/route.ts
└── webhook/resend/route.ts

src/app/
└── p/[uniqueId]/page.tsx

src/components/preview/
├── SendEmailModal.tsx
└── SuccessModal.tsx

src/components/presentation/
└── PublicPresentationTracker.tsx

docs/
├── EMAIL-SYSTEM.md
└── QUICK-START-EMAIL.md

./
├── IMPLEMENTATION-SUMMARY.md
└── DEPLOYMENT-CHECKLIST.md
```

#### Testing

- ✅ Build de producción exitoso
- ✅ Migración de BD aplicada
- ✅ Servidor de desarrollo funcionando
- ✅ Sin errores de linter

#### Métricas

- **Líneas de código:** ~2,000 nuevas
- **Tiempo de desarrollo:** ~3.5 horas
- **Progreso del MVP:** 85% → 95%

---

## [0.4.0] - 2026-02-06

### ✨ Integración Zoho CRM 100% Funcional

#### Agregado

- ✅ Webhook de Zoho operativo
- ✅ Preview de borradores con datos reales
- ✅ Mapeo completo de datos (Quote, Account, Contact, Deal, Products)
- ✅ Formato automático de moneda (UF/CLP)
- ✅ Productos con descripción completa
- ✅ Header personalizado por cotización

#### Documentación

- ✅ `docs/ZOHO-INTEGRATION.md` - Código Deluge completo
- ✅ `docs/TOKENS-ZOHO.md` - 85+ tokens disponibles
- ✅ `docs/ESTADO-PROYECTO.md` - Estado del proyecto

---

## [0.3.0] - 2026-02-05

### ✨ Backend con Prisma + Neon PostgreSQL

#### Agregado

- ✅ Base de datos Neon PostgreSQL
- ✅ 7 modelos de Prisma
- ✅ API endpoints CRUD para presentaciones
- ✅ Sistema de templates
- ✅ Tracking de vistas
- ✅ Audit log

#### Documentación

- ✅ `docs/DATABASE-SCHEMA.md`

---

## [0.2.0] - 2026-02-04

### ✨ Frontend Completo

#### Agregado

- ✅ 24 secciones de presentación
- ✅ Diseño premium y moderno
- ✅ Componentes animados
- ✅ Responsive design
- ✅ Sistema de templates

---

## [0.1.0] - 2026-02-03

### 🎉 Inicio del Proyecto

#### Agregado

- ✅ Configuración inicial de Next.js 15
- ✅ Tailwind CSS
- ✅ Estructura de carpetas
- ✅ Configuración de TypeScript

---

## Leyenda

- ✨ Nueva funcionalidad
- 🔄 Cambio/Actualización
- 🐛 Bug fix
- 🔒 Seguridad
- 📝 Documentación
- ⚡ Performance
- 🎨 UI/UX

---

**Última actualización:** 05 de Febrero de 2026  
**Versión actual:** 0.5.0
