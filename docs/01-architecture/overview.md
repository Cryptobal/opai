# Arquitectura General - OPAI Docs

**Resumen:** Arquitectura técnica completa del módulo Docs de OPAI Suite, incluyendo stack, componentes y flujo de datos.

**Estado:** Vigente - Documentación actualizada

**Scope:** OPAI Docs

---

**Versión:** 2.0  
**Fecha:** 05 de Febrero de 2026  

---

## 🎯 VISIÓN DEL PRODUCTO

**OPAI Docs** es el módulo de presentaciones comerciales dinámicas de la suite OPAI, accesible en `opai.gard.cl/docs`. Permite crear, personalizar y enviar cotizaciones y propuestas profesionales a clientes con integración a Zoho CRM, tracking de visualizaciones, y gestión multi-tenant.

### Propósito Principal
Transformar datos de Zoho CRM en presentaciones comerciales visualmente impactantes, enviables por email y compartibles por WhatsApp, con trazabilidad completa. Accesible bajo el dominio principal `opai.gard.cl/docs` como parte de la suite OPAI.

### Diferenciadores Clave
- ✅ Integración nativa con Zoho CRM vía webhooks
- ✅ Diseño estilo Qwilr (scroll vertical, secciones interactivas)
- ✅ Sistema de tokens dinámicos para personalización automática
- ✅ Trazabilidad completa de visualizaciones
- ✅ Templates editables por IA (Cursor) sin editor manual
- ✅ Envío por email (Resend) y WhatsApp (URL scheme)
- ✅ Dashboard administrativo con analytics

---

## 🏗️ ARQUITECTURA DEL SISTEMA

### Stack Tecnológico

#### Frontend
- **Framework:** Next.js 15 (App Router)
- **Lenguaje:** TypeScript
- **Estilos:** TailwindCSS + shadcn/ui
- **Animaciones:** Framer Motion
- **Iconos:** Lucide React
- **Formularios:** React Hook Form + Zod

#### Backend
- **Runtime:** Next.js API Routes (Edge Functions)
- **Base de datos:** Neon PostgreSQL
- **ORM:** Prisma
- **Autenticación:** Auth.js v5 (NextAuth v5) con Credentials + tabla Admin (bcrypt)
- **Email:** Resend
- **Validación:** Zod

#### Infraestructura
- **Hosting:** Vercel
- **Base de datos:** Neon (PostgreSQL serverless)
- **CDN:** Vercel Edge Network
- **Analytics:** Vercel Analytics

### Componentes Principales

```
┌─────────────────────────────────────────────────────────────┐
│  ZOHO CRM (ingest legacy) · Futuro: CRM OPAI                 │
│                  Envía webhook con datos                     │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              WEBHOOK ENDPOINT (/api/webhook/zoho)            │
│  • Valida secret                                             │
│  • Parsea datos del cliente                                  │
│  • Guarda en BD temporal                                     │
│  • Retorna ID de sesión                                      │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│           MODAL DE SELECCIÓN DE TEMPLATE (React)             │
│  • Muestra templates disponibles                             │
│  • Preview rápido de cada uno                                │
│  • Botón "Usar este template"                                │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│         VISTA PREVIA DE BORRADOR (/preview/[sessionId])      │
│  • Renderiza template con tokens reemplazados                │
│  • Estilo Qwilr (scroll vertical)                            │
│  • Botón "Enviar por Email"                                  │
│  • Botón "Enviar por WhatsApp" (después de email)            │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│            ENVÍO POR EMAIL (Resend API)                      │
│  • Guarda presentación en BD con ID único                    │
│  • Genera URL: opai.gard.cl/docs/p/[uniqueId]                │
│  • Envía email con template personalizado                    │
│  • Email incluye link a la presentación                      │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│     PRESENTACIÓN PÚBLICA (/p/[uniqueId])                     │
│  • Lee datos de BD por uniqueId                              │
│  • Renderiza presentación estilo Qwilr                       │
│  • Tracking de visualizaciones (analytics)                   │
│  • Botón "Descargar PDF" (opcional)                          │
└──────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│         DASHBOARD ADMIN (/inicio)                            │
│  • Login con Auth.js v5 (Credentials + Admin bcrypt)         │
│  • Lista de presentaciones enviadas (filtro por tenant)        │
│  • Analytics y trazabilidad                                  │
│  • Gestión de templates                                      │
│  • Tenant switcher (admins con más de un tenant)             │
└──────────────────────────────────────────────────────────────┘
```

---

## 📁 ESTRUCTURA DE DIRECTORIOS

```
gard-docs/
├── README.md
├── package.json
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
├── .env.local                       ← Variables de entorno
├── .gitignore
│
├── prisma/
│   ├── schema.prisma                ← Schema de BD
│   └── migrations/
│
├── public/
│   ├── logos/
│   │   ├── gard-white.svg
│   │   └── gard-blue.svg
│   └── images/
│       └── placeholder.webp
│
├── src/
│   ├── app/
│   │   ├── layout.tsx               ← Root layout
│   │   ├── page.tsx                 ← Landing page (opcional)
│   │   │
│   │   ├── api/                     ← API Routes
│   │   │   ├── webhook/
│   │   │   │   └── zoho/
│   │   │   │       └── route.ts     ← Webhook endpoint
│   │   │   ├── presentations/
│   │   │   │   ├── send-email/
│   │   │   │   │   └── route.ts     ← Enviar por email
│   │   │   │   └── [id]/
│   │   │   │       ├── route.ts     ← Get presentación
│   │   │   │       └── track/
│   │   │   │           └── route.ts ← Tracking de vistas
│   │   │   ├── templates/
│   │   │   │   ├── route.ts         ← Listar templates
│   │   │   │   └── [id]/
│   │   │   │       └── route.ts     ← Get template
│   │   │   └── auth/
│   │   │       └── [...nextauth]/
│   │   │           └── route.ts     ← NextAuth config
│   │   │
│   │   ├── select-template/
│   │   │   └── page.tsx             ← Modal selección template
│   │   │
│   │   ├── preview/
│   │   │   └── [sessionId]/
│   │   │       └── page.tsx         ← Vista previa borrador
│   │   │
│   │   ├── p/                       ← Presentaciones públicas
│   │   │   └── [uniqueId]/
│   │   │       └── page.tsx         ← Vista pública cliente
│   │   │
│   │   └── admin/                   ← Dashboard admin
│   │       ├── layout.tsx           ← Layout admin (con auth)
│   │       ├── page.tsx             ← Dashboard principal
│   │       ├── presentations/
│   │       │   ├── page.tsx         ← Lista presentaciones
│   │       │   └── [id]/
│   │       │       └── page.tsx     ← Detalle presentación
│   │       ├── templates/
│   │       │   ├── page.tsx         ← Lista templates
│   │       │   └── [id]/
│   │       │       └── page.tsx     ← Ver template
│   │       └── settings/
│   │           └── page.tsx         ← Configuración
│   │
│   ├── components/
│   │   ├── ui/                      ← shadcn/ui components
│   │   ├── layout/
│   │   ├── presentation/
│   │   ├── admin/
│   │   └── shared/
│   │
│   ├── lib/
│   │   ├── prisma.ts                ← Prisma client singleton
│   │   ├── auth.ts                  ← NextAuth config
│   │   ├── resend.ts                ← Resend client
│   │   ├── tokens.ts                ← Sistema de reemplazo de tokens
│   │   ├── validators.ts            ← Zod schemas
│   │   └── utils.ts                 ← Utilidades generales
│   │
│   ├── templates/
│   │   ├── presentations/
│   │   └── emails/
│   │
│   ├── types/
│   │   ├── index.ts                 ← Tipos generales
│   │   ├── zoho.ts                  ← Tipos de Zoho webhook
│   │   ├── presentation.ts          ← Tipos de presentación
│   │   └── template.ts              ← Tipos de template
│   │
│   └── styles/
│       └── globals.css              ← Estilos globales + Tailwind
│
└── tests/                           ← Tests (opcional)
    ├── api/
    └── components/
```

---

## 🔧 TECNOLOGÍAS Y BIBLIOTECAS

### Core
```json
{
  "dependencies": {
    "next": "^15.0.3",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "typescript": "^5.6.3"
  }
}
```

### Base de Datos y ORM
```json
{
  "dependencies": {
    "@prisma/client": "^6.1.0",
    "prisma": "^6.1.0"
  }
}
```

### UI y Estilos
```json
{
  "dependencies": {
    "tailwindcss": "^3.4.17",
    "@tailwindcss/forms": "^0.5.10",
    "@tailwindcss/typography": "^0.5.16",
    "autoprefixer": "^10.4.21",
    "postcss": "^8.4.31",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.6.0",
    "class-variance-authority": "^0.7.1"
  }
}
```

### Animaciones
```json
{
  "dependencies": {
    "framer-motion": "^11.11.17"
  }
}
```

### Formularios y Validación
```json
{
  "dependencies": {
    "react-hook-form": "^7.55.0",
    "zod": "^3.24.2",
    "@hookform/resolvers": "^4.1.3"
  }
}
```

### Email (Resend)
```json
{
  "dependencies": {
    "resend": "^4.0.0",
    "@react-email/components": "^0.0.25"
  }
}
```

### Utilidades
```json
{
  "dependencies": {
    "lucide-react": "^0.460.0",
    "date-fns": "^4.1.0",
    "nanoid": "^5.0.0"
  }
}
```

---

## 🔒 SEGURIDAD Y CONSIDERACIONES

### Validación de Webhooks
- ✅ Verificar `X-Webhook-Secret` header
- ✅ Validar estructura de datos con Zod
- ✅ Rate limiting (máximo 10 requests/min por IP)
- ✅ Logging de intentos fallidos

### Autenticación Admin
- ✅ Passwords con bcrypt (hash)
- ✅ JWT con expiración (30 min)
- ✅ HTTPS only en producción
- ✅ CSRF protection (NextAuth built-in)

### Datos Sensibles
- ✅ No guardar passwords en texto plano
- ✅ No loggear datos de clientes completos
- ✅ Encriptar datos sensibles en BD (opcional)
- ✅ GDPR compliance (política de retención)

### Rate Limiting
- ✅ Webhook: 10 req/min
- ✅ API pública: 60 req/min
- ✅ Admin dashboard: ilimitado (con auth)

---

**Última actualización:** 05 de Febrero de 2026
