# 📝 Changelog - OPAI Docs

**Resumen:** Historial completo de cambios, versiones y nuevas funcionalidades del módulo Docs.

**Estado:** Vigente - Actualizado continuamente

**Scope:** OPAI Docs

---

Todos los cambios notables del proyecto están documentados aquí.

---

## [1.2.1] - 2026-02-05 👁️

### 🔧 MODO PREVIEW - VISTAS DE ADMIN NO SE CONTABILIZAN

**Implementado sistema para que vistas desde dashboard no inflen los datos.**

#### ✅ Features Implementadas

**Modo Preview:**
- ✅ Parámetro `?preview=true` en links de admin
- ✅ Detección automática en página pública
- ✅ No se trackean vistas con preview=true
- ✅ Banner amarillo: "Vista Previa de Administrador"
- ✅ Links copiados y WhatsApp sin parámetro (trackean normal)

**Archivos Modificados:**
- `src/app/p/[uniqueId]/page.tsx` - Detección de preview mode
- `src/components/admin/PresentationsList.tsx` - Links con preview
- `src/components/admin/DashboardHeader.tsx` - Notificaciones con preview

**Beneficio:**
- Datos precisos sin inflación
- Admin puede revisar sin afectar métricas
- Banner claro indica cuándo no se trackea

---

## [1.2.0] - 2026-02-05 🔔

### 🚀 DASHBOARD v2.0 - REDISEÑO COMPLETO + NOTIFICACIONES

**Dashboard ultra simplificado con sistema de notificaciones inteligentes.**

#### ✅ Features Implementadas

**1. Sistema de Notificaciones:**
- ✅ Campana en header con badge de alertas
- ✅ Detecta presentaciones sin vistas después de 3 días
- ✅ Panel lateral con lista de pendientes
- ✅ Link directo a cada presentación alertada
- ✅ Configurable (días ajustables)

**2. Simplificación del Dashboard:**
- ❌ Eliminados KPIs confusos (6 cards)
- ❌ Eliminado embudo de conversión
- ❌ Removido badge "sent" duplicado
- ✅ Vista limpia con solo información esencial
- ✅ Mobile-first optimizado

**3. Filtros Mejorados:**
- ✅ Grid de 4 filtros (Búsqueda, Vistas, Estado Email, Fecha)
- ✅ Filtro de Vistas: Todas / Vistas / No vistas / Borradores
- ✅ Filtro de Estado Email: Enviado / Entregado / Abierto / Clicked
- ✅ Filtro de Fecha: Hoy / Semana / Mes / Trimestre

**4. Estados en Español:**
- ✅ "Enviado" (antes: Sent)
- ✅ "Entregado" (antes: Delivered)
- ✅ "Abierto" (antes: Opened)
- ✅ "Clicked" (se mantiene en inglés)
- ✅ "Borrador" (antes: Draft)

**5. Email Status Badge:**
- ✅ Componente dedicado para mostrar estado del email
- ✅ Colores distintivos por estado
- ✅ Tooltips explicativos
- ✅ Prioridad automática (muestra el estado más avanzado)

**6. Tracking Mejorado:**
- ✅ Contador de vistas con ícono verde
- ✅ Badge de estado email al lado
- ✅ Vista compacta sin duplicados

#### 📁 Archivos Creados/Modificados

**Nuevos:**
- `src/components/admin/EmailStatusBadge.tsx` - Badge de estado email
- `src/components/admin/DashboardContent.tsx` - Wrapper client
- `docs/RESEND-WEBHOOK-CONFIG.md` - Configuración webhooks
- `.env.example` - Variables de entorno

**Modificados:**
- `src/app/inicio/page.tsx` - Simplificado
- `src/components/admin/DashboardHeader.tsx` - + Notificaciones
- `src/components/admin/PresentationsList.tsx` - + Filtros mejorados
- Eliminados: `StatsCards.tsx`, `ConversionChart.tsx`

#### 🎯 UX/UI

**Antes:**
- Dashboard sobrecargado con 6 KPIs
- Embudo de conversión confuso
- Información duplicada
- Métricas no claras

**Ahora:**
- Vista limpia y directa
- Solo información esencial
- Notificaciones proactivas
- Filtros específicos y claros

#### 🔧 Configuración

**Webhook de Resend:**
- Secret agregado a `.env.example`
- Documentación completa en `RESEND-WEBHOOK-CONFIG.md`
- Estados: delivered, opened, clicked, bounced

**Notificaciones:**
- Configurable en `DashboardHeader.tsx`
- Por defecto: 3 días sin vistas
- Badge rojo en campana

---

## [1.1.0] - 2026-02-05 🎛️

### 🚀 DASHBOARD ADMINISTRATIVO COMPLETO

**Panel de control profesional para gestionar presentaciones.**

#### ✅ Features Implementadas

**Dashboard Principal (`/inicio`):**
- ✅ Header con logo y botón para templates
- ✅ 6 cards de estadísticas principales:
  - Total de presentaciones
  - Enviadas
  - Vistas (con total de vistas)
  - Emails abiertos (con total de aperturas)
  - Clicks (con total de clicks)
  - Tasa de conversión
- ✅ Gráfico de embudo de conversión
- ✅ Insights de tasas (vista, apertura, click)

**Lista de Presentaciones:**
- ✅ Vista de todas las presentaciones enviadas
- ✅ Filtros por status (todos, enviados, vistos, borradores)
- ✅ Búsqueda por empresa, contacto o asunto
- ✅ Analytics inline para cada presentación
- ✅ Botones de acción:
  - Ver presentación pública
  - Copiar link al portapapeles
  - Compartir por WhatsApp

**UX/UI:**
- ✅ **Mobile-first**: 100% responsive
- ✅ **Sin scroll horizontal en mobile**
- ✅ Layout compacto y moderno
- ✅ Gradientes y efectos visuales premium
- ✅ Animaciones suaves en hover

**Navegación Unificada:**
- ✅ Botón "Volver al Dashboard" en template previews
- ✅ Botón "Volver al Dashboard" en preview de borradores
- ✅ Dashboard como hub central de la aplicación

#### 📁 Archivos Creados

**Páginas:**
- `src/app/inicio/page.tsx` - Dashboard principal

**Componentes:**
- `src/components/admin/DashboardHeader.tsx` - Header del dashboard
- `src/components/admin/StatsCards.tsx` - Tarjetas de estadísticas
- `src/components/admin/ConversionChart.tsx` - Gráfico de embudo
- `src/components/admin/PresentationsList.tsx` - Lista con filtros

**Modificaciones:**
- `src/components/admin/TemplateSidebar.tsx` - Agregado botón dashboard
- `src/app/preview/[sessionId]/page.tsx` - Agregado botón dashboard

#### 📊 Estadísticas Mostradas

**Cards:**
1. Total Presentaciones
2. Enviadas
3. Vistas (+ total de vistas)
4. Emails Abiertos (+ total de aperturas)
5. Clicks (+ total de clicks)
6. Tasa de Conversión (%)

**Embudo de Conversión:**
1. Enviadas (100%)
2. Vistas (% de conversión)
3. Abiertas (% de apertura)
4. Con Clicks (% de click)

**Insights:**
- Tasa de Vista: vistas / enviadas
- Tasa de Apertura: aperturas / enviadas
- Tasa de Click: clicks / aperturas

#### 🎨 Diseño

**Colores por Métrica:**
- Azul: Total presentaciones
- Morado: Enviadas
- Verde: Vistas
- Amarillo: Aperturas
- Naranja: Clicks
- Rosa: Conversión

**Layout:**
- Grid 2 columnas en mobile
- Grid 3 columnas en tablet
- Grid 6 columnas en desktop
- Espaciado consistente (sm:gap-4)
- Padding adaptativo (px-4 sm:px-6 lg:px-8)

#### 🔄 Flujo de Navegación

```
/inicio (Dashboard)
  ↓
  ├─→ /templates/commercial/preview (Ver Templates)
  │     └─→ Botón "Volver al Dashboard"
  │
  ├─→ /p/[uniqueId] (Ver Presentación Pública)
  │
  └─→ /preview/[sessionId] (Preview Borrador)
        └─→ Botón "Volver al Dashboard"
```

#### 💡 Características Técnicas

- **Server Component**: Datos en servidor, sin estados del cliente
- **Prisma Include**: Relaciones con views y template
- **date-fns**: Formato de fechas relativas
- **Responsive**: Mobile-first con Tailwind
- **Sin paginación**: Por ahora muestra todas (agregar después)
- **Filtros locales**: useState + useMemo para rendimiento

---

## [1.0.0] - 2026-02-05 🎉

### 🚀 VERSIÓN 1.0 - MVP COMPLETO EN PRODUCCIÓN

**Sistema de email 100% funcional y operativo en producción.**

#### ✅ Features Completadas

**Sistema de Email:**
- ✅ Envío de emails con Resend + React Email
- ✅ Template profesional con logo de Gard
- ✅ Destinatario editable (nombre + email)
- ✅ CC adicionales (hasta 5 emails)
- ✅ Links públicos correctos: `https://docs.gard.cl/p/[uniqueId]`
- ✅ WhatsApp share con número del contacto de Zoho
- ✅ Tracking completo (opens, clicks, delivered)
- ✅ Preview de email en sidebar y página dedicada

**Fixes Importantes:**
- 🔧 URL pública correcta (sin "undefined")
- 🔧 WhatsApp abre directo al número del contacto
- 🔧 Logo de Gard visible en emails
- 🔧 Destinatario editable en modal
- 🔧 Build de Prisma automático en Vercel

**Archivos Principales:**
- Template: `src/emails/PresentationEmail.tsx`
- Endpoint: `src/app/api/presentations/send-email/route.ts`
- Webhook: `src/app/api/webhook/resend/route.ts`
- Modales: `SendEmailModal.tsx`, `SuccessModal.tsx`
- Preview: `src/app/templates/email/preview/page.tsx`

#### 📊 Commits de esta versión

Total: ~8 commits desde v0.5.0
- feat: sistema de email con tracking completo
- fix: prisma generate en build script
- feat: destinatario principal editable
- fix: url pública correcta y whatsapp con número
- fix: interfaz TypeScript de SendEmailModal
- Múltiples fixes de hidratación y rendering

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
