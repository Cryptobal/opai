# Código deprecated - No usar en código nuevo

Este directorio documenta los módulos marcados como deprecated.

## Sistema de Presentación Comercial (29 secciones)
- Estado: Funcional pero **no expuesto al cliente final**
- Razón: El flujo real envía al cliente al Portal del Cliente, no a `/p/[uniqueId]`
- Plan: Borrar físicamente después de 2026-06-15 (60 días desde 2026-04-16)
- Archivos afectados:
  - `src/components/presentation/**`
  - `src/lib/cpq-mapper.ts` (función `buildSectionsDefaults`)
  - `src/lib/themes.ts`
  - `src/types/presentation.ts`
  - `src/app/(templates)/p/[uniqueId]/`
  - `src/app/(templates)/preview/[sessionId]/`
  - `src/app/(templates)/templates/commercial/`
  - `src/app/(templates)/templates/pricing-format/`
  - `src/app/api/presentations/**`
  - `src/app/api/pdf/generate-presentation/`
  - `src/components/preview/**`
  - `src/components/admin/PresentationsList.tsx`
  - `src/components/admin/TemplatePreviewWrapper.tsx`
  - `src/components/presentation/DownloadPresentationSection.tsx`
  - `src/lib/mock-data.ts`
- Lo que SÍ se mantiene:
  - Modelo Prisma `Presentation` (usado por portal cliente, deal page)
  - Modelo Prisma `Template` (FK desde Presentation)
  - `mapCpqDataToPresentation()` simplificado en `send-quote-to-portal.ts`
  - Tracking de open/view en webhooks Resend
