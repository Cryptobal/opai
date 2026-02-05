# 📋 DOCUMENTO MAESTRO - GARD DOCS
## Sistema de Presentaciones Comerciales Inteligente

**Versión:** 1.0  
**Fecha:** 04 de Febrero de 2026  
**Dominio:** docs.gard.cl  
**Tipo:** Aplicación web independiente de gard.cl

---

## 🎯 VISIÓN DEL PRODUCTO

**Gard Docs** es una plataforma de presentaciones comerciales dinámicas tipo Qwilr, optimizada específicamente para Gard Security. Permite crear, personalizar y enviar cotizaciones y propuestas profesionales a clientes de manera automatizada, con integración directa a Zoho CRM.

### Propósito Principal
Transformar datos de Zoho CRM en presentaciones comerciales visualmente impactantes, enviables por email y compartibles por WhatsApp, con trazabilidad completa y diseño world-class.

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
- **Autenticación:** NextAuth.js v5 (Auth.js)
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
│                    ZOHO CRM (Externo)                        │
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
│  • Genera URL: docs.gard.cl/p/[uniqueId]                     │
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
│         DASHBOARD ADMIN (/admin)                             │
│  • Login con NextAuth.js                                     │
│  • Lista de presentaciones enviadas                          │
│  • Analytics y trazabilidad                                  │
│  • Gestión de templates                                      │
└──────────────────────────────────────────────────────────────┘
```

---

## 🔄 FLUJO COMPLETO DETALLADO

### FLUJO 1: Creación y Envío de Presentación

#### Paso 1: Recepción de Webhook
```
1. Zoho CRM envía POST a /api/webhook/zoho
2. Headers incluyen: X-Webhook-Secret para validación
3. Body incluye:
   {
     "quote": { ... datos de cotización ... },
     "account": { ... datos de cuenta/cliente ... },
     "contact": { ... datos de contacto ... },
     "deal": { ... datos de negocio ... }
   }
4. Sistema valida secret
5. Guarda datos en tabla temporal: webhook_sessions
6. Genera session_id único
7. Retorna: { success: true, sessionId: "abc123" }
```

#### Paso 2: Modal de Selección (UI)
```
1. Zoho CRM (en el navegador del usuario) recibe sessionId
2. Abre modal con iframe: docs.gard.cl/select-template?session=abc123
3. Modal muestra:
   - Lista de templates disponibles
   - Preview thumbnail de cada uno
   - Botón "Usar este template"
4. Usuario selecciona template
5. Redirecciona a: /preview/abc123?template=commercial
```

#### Paso 3: Vista Previa de Borrador
```
1. Sistema lee session_id de BD (webhook_sessions)
2. Lee template seleccionado de BD (templates)
3. Reemplaza tokens:
   [NOMBRE_CLIENTE] → datos.account.Account_Name
   [CONTACTO] → datos.contact.Full_Name
   [TOTAL] → datos.quote.Grand_Total
   ... etc.
4. Renderiza preview estilo Qwilr:
   - Scroll vertical
   - Secciones animadas
   - Diseño responsive
5. Muestra botones:
   - "Enviar por Email" (principal)
   - "Cancelar" (secundario)
```

#### Paso 4: Envío por Email
```
1. Usuario hace click en "Enviar por Email"
2. Sistema:
   a. Genera uniqueId para la presentación (ej: "gard_pres_abc123xyz")
   b. Guarda en BD tabla: presentations
      - uniqueId
      - datos del cliente
      - template_id
      - contenido renderizado (JSON)
      - estado: "enviado"
      - created_at
   c. Llama a Resend API:
      - From: comercial@gard.cl
      - To: datos.contact.Email
      - Subject: "Propuesta Comercial - Gard Security"
      - Template HTML personalizado
      - Incluye link: docs.gard.cl/p/gard_pres_abc123xyz
   d. Actualiza BD: presentations.email_sent_at = NOW()
3. Muestra confirmación:
   - "✅ Email enviado exitosamente"
   - "Link de la presentación: [copiar]"
   - Botón "Enviar por WhatsApp" ahora visible
```

#### Paso 5: Compartir por WhatsApp (Opcional)
```
1. Botón "Enviar por WhatsApp" se activa después del email
2. Al hacer click:
   - Lee número de teléfono de datos.contact.Mobile
   - Formatea número (ej: +56912345678 → 56912345678)
   - Genera mensaje pre-llenado:
     "Hola [NOMBRE],
     
     Te envío nuestra propuesta comercial para [NOMBRE_EMPRESA].
     Puedes verla aquí: https://docs.gard.cl/p/gard_pres_abc123xyz
     
     Saludos,
     Equipo Gard Security"
   - Abre URL: wa.me/56912345678?text=[mensaje_encoded]
3. Se abre WhatsApp (web o app) con mensaje pre-llenado
4. Usuario solo presiona "Enviar"
5. Sistema registra en BD: presentations.whatsapp_shared_at = NOW()
```

### FLUJO 2: Visualización por Cliente

#### Paso 1: Cliente Recibe Email
```
1. Cliente abre email de Resend
2. Ve preview de la propuesta
3. Click en botón "Ver Propuesta Completa"
4. Abre: docs.gard.cl/p/gard_pres_abc123xyz
```

#### Paso 2: Renderizado de Presentación
```
1. Sistema busca presentación por uniqueId en BD
2. Valida que exista y esté activa
3. Registra visualización:
   - presentations.view_count += 1
   - presentation_views.create({
       presentation_id,
       ip_address,
       user_agent,
       viewed_at: NOW()
     })
4. Renderiza presentación estilo Qwilr:
   - Header con logo Gard
   - Scroll vertical suave
   - Secciones animadas (fade-in on scroll)
   - Diseño responsive (mobile-first)
   - Footer con CTA
5. (Opcional) Botón "Descargar PDF" al final
```

### FLUJO 3: Dashboard Administrativo

#### Paso 1: Login
```
1. Admin accede a: docs.gard.cl/admin
2. Muestra página de login (NextAuth.js)
3. Ingresa credenciales:
   - Email: carlos.irigoyen@gard.cl
   - Password: (de .env.local)
4. NextAuth valida contra hash en .env
5. Genera session JWT
6. Redirecciona a: /admin/dashboard
```

#### Paso 2: Dashboard Principal
```
1. Muestra estadísticas generales:
   - Total presentaciones enviadas
   - Presentaciones vistas
   - Tasa de apertura
   - Última actividad
2. Lista de presentaciones recientes:
   - Cliente
   - Template usado
   - Fecha de envío
   - Vistas
   - Estado (enviado/visto/no visto)
3. Acciones rápidas:
   - Ver presentación
   - Reenviar email
   - Ver analytics
   - Editar template
```

#### Paso 3: Gestión de Templates
```
1. Admin accede a: /admin/templates
2. Muestra lista de templates:
   - Nombre
   - Última modificación
   - Veces usado
   - Preview thumbnail
3. Click en template → /admin/templates/[id]
4. Muestra:
   - Vista previa estilo Qwilr (solo lectura)
   - Botón "Ver código fuente" (para Cursor)
   - Botón "Duplicar template"
   - Botón "Eliminar" (con confirmación)
5. IMPORTANTE: NO hay editor visual
   - Para editar: Se dan instrucciones a Cursor
   - Cursor edita el archivo del template directamente
   - Sistema recarga preview automáticamente
```

---

## 🎨 DISEÑO Y EXPERIENCIA DE USUARIO

### Estilo Visual: Inspirado en Qwilr

#### Características Principales
1. **Scroll Vertical Continuo**: No hay navegación slide-por-slide
2. **Secciones Diferenciadas**: Cada sección con su propio diseño
3. **Animaciones Suaves**: Fade-in, slide-in on scroll
4. **Spacing Generoso**: Mucho espacio en blanco
5. **Tipografía Jerárquica**: Títulos grandes, cuerpo legible
6. **CTAs Prominentes**: Botones de acción claros
7. **Responsive Total**: Mobile-first design

#### Ejemplo de Estructura de Presentación Tipo Qwilr

```html
<!-- Sección 1: Hero / Portada -->
<section class="hero-section min-h-screen flex items-center bg-gradient-to-br from-blue-900 to-teal-700">
  <div class="container mx-auto px-6">
    <h1 class="text-6xl font-bold text-white mb-4">
      Propuesta Comercial
    </h1>
    <p class="text-2xl text-white/80 mb-2">
      Para [NOMBRE_CLIENTE]
    </p>
    <p class="text-lg text-white/60">
      Preparado por Gard Security · [FECHA]
    </p>
    <button class="mt-8 bg-white text-blue-900 px-8 py-4 rounded-full">
      Ver propuesta →
    </button>
  </div>
</section>

<!-- Sección 2: Resumen Ejecutivo -->
<section class="executive-summary py-24 bg-white">
  <div class="container mx-auto max-w-4xl px-6">
    <span class="text-sm text-teal-600 font-semibold uppercase tracking-wide">
      Resumen Ejecutivo
    </span>
    <h2 class="text-4xl font-bold text-gray-900 mt-4 mb-6">
      Tu desafío, nuestra solución
    </h2>
    <p class="text-xl text-gray-600 leading-relaxed">
      [DESCRIPCIÓN_PROBLEMA_CLIENTE]
    </p>
    <div class="grid grid-cols-3 gap-8 mt-12">
      <!-- Stats cards -->
    </div>
  </div>
</section>

<!-- Sección 3: Problema / Oportunidad -->
<section class="problem-section py-24 bg-gray-50">
  <!-- Contenido con iconos y bullets -->
</section>

<!-- Sección 4: Nuestra Solución -->
<section class="solution-section py-24 bg-white">
  <!-- 3 columnas con features -->
</section>

<!-- Sección 5: Alcance del Servicio -->
<section class="scope-section py-24 bg-gradient-to-br from-gray-900 to-gray-800 text-white">
  <!-- Tabla responsiva o cards -->
</section>

<!-- Sección 6: Timeline de Implementación -->
<section class="timeline-section py-24 bg-white">
  <!-- Timeline visual con íconos -->
</section>

<!-- Sección 7: Propuesta Económica -->
<section class="pricing-section py-24 bg-gray-50">
  <!-- Tabla de precios interactiva (estilo Qwilr) -->
  <!-- Cantidad, descripción, precio unitario, subtotal -->
</section>

<!-- Sección 8: Casos de Éxito -->
<section class="case-studies-section py-24 bg-white">
  <!-- Logos de clientes + testimonios -->
</section>

<!-- Sección 9: Próximos Pasos / CTA Final -->
<section class="cta-section min-h-screen flex items-center bg-gradient-to-br from-teal-600 to-blue-700 text-white">
  <div class="container mx-auto text-center px-6">
    <h2 class="text-5xl font-bold mb-6">
      ¿Listo para comenzar?
    </h2>
    <p class="text-xl mb-8 text-white/80">
      Hablemos sobre cómo podemos ayudarte
    </p>
    <div class="flex gap-4 justify-center">
      <button class="bg-white text-teal-600 px-8 py-4 rounded-full font-semibold">
        Agendar reunión
      </button>
      <button class="border-2 border-white text-white px-8 py-4 rounded-full font-semibold">
        Descargar PDF
      </button>
    </div>
  </div>
</section>

<!-- Footer -->
<footer class="bg-gray-900 text-white py-12">
  <!-- Contacto, logo, legal -->
</footer>
```

### Animaciones On-Scroll

```typescript
// Usar Framer Motion + Intersection Observer
import { motion } from 'framer-motion'
import { useInView } from 'react-intersection-observer'

function Section({ children }) {
  const [ref, inView] = useInView({
    triggerOnce: true,
    threshold: 0.1
  })
  
  return (
    <motion.section
      ref={ref}
      initial={{ opacity: 0, y: 50 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, ease: 'easeOut' }}
    >
      {children}
    </motion.section>
  )
}
```

### Responsive Design

```css
/* Mobile-first approach */
.container {
  @apply px-4 md:px-6 lg:px-8;
}

/* Typography scaling */
h1 {
  @apply text-3xl md:text-5xl lg:text-6xl;
}

/* Grid layouts adaptables */
.feature-grid {
  @apply grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6;
}

/* Tables → Cards en móvil */
.pricing-table {
  @apply hidden md:table;
}
.pricing-cards {
  @apply md:hidden;
}
```

---

## 📁 ESTRUCTURA DE DIRECTORIOS

```
gard-docs/
├── README.md
├── DOCUMENTO-MAESTRO-APLICACION.md  ← Este documento
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
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── input.tsx
│   │   │   └── ...
│   │   │
│   │   ├── layout/
│   │   │   ├── Header.tsx
│   │   │   ├── Footer.tsx
│   │   │   └── AdminSidebar.tsx
│   │   │
│   │   ├── presentation/
│   │   │   ├── PresentationRenderer.tsx  ← Renderiza presentación
│   │   │   ├── SectionHero.tsx
│   │   │   ├── SectionExecutiveSummary.tsx
│   │   │   ├── SectionProblem.tsx
│   │   │   ├── SectionSolution.tsx
│   │   │   ├── SectionScope.tsx
│   │   │   ├── SectionTimeline.tsx
│   │   │   ├── SectionPricing.tsx
│   │   │   ├── SectionCaseStudies.tsx
│   │   │   └── SectionCTA.tsx
│   │   │
│   │   ├── admin/
│   │   │   ├── DashboardStats.tsx
│   │   │   ├── PresentationsList.tsx
│   │   │   ├── TemplateCard.tsx
│   │   │   └── AnalyticsChart.tsx
│   │   │
│   │   └── shared/
│   │       ├── LoadingSpinner.tsx
│   │       ├── ErrorBoundary.tsx
│   │       └── Toast.tsx
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
│   │   │   ├── commercial.tsx       ← Template comercial
│   │   │   ├── technical.tsx        ← Template técnico
│   │   │   └── company-profile.tsx  ← Perfil de empresa
│   │   │
│   │   └── emails/
│   │       ├── presentation-sent.tsx    ← Email enviado
│   │       └── presentation-viewed.tsx  ← Notif. vista (opcional)
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

**Schema Prisma Básico:**
```prisma
// prisma/schema.prisma

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model WebhookSession {
  id            String   @id @default(cuid())
  sessionId     String   @unique
  zohoData      Json     // Datos completos del webhook
  status        String   // "pending", "completed", "expired"
  expiresAt     DateTime
  createdAt     DateTime @default(now())
}

model Template {
  id            String         @id @default(cuid())
  name          String
  slug          String         @unique
  type          String         // "presentation", "email"
  content       Json           // Estructura del template
  active        Boolean        @default(true)
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
  presentations Presentation[]
}

model Presentation {
  id              String              @id @default(cuid())
  uniqueId        String              @unique
  templateId      String
  template        Template            @relation(fields: [templateId], references: [id])
  clientData      Json                // Datos del cliente (de Zoho)
  renderedContent Json                // Contenido renderizado con tokens
  status          String              // "draft", "sent", "viewed"
  emailSentAt     DateTime?
  whatsappSharedAt DateTime?
  viewCount       Int                 @default(0)
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt
  views           PresentationView[]
}

model PresentationView {
  id             String       @id @default(cuid())
  presentationId String
  presentation   Presentation @relation(fields: [presentationId], references: [id], onDelete: Cascade)
  ipAddress      String?
  userAgent      String?
  viewedAt       DateTime     @default(now())
}

model Admin {
  id        String   @id @default(cuid())
  email     String   @unique
  password  String   // Hash bcrypt
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### Autenticación
```json
{
  "dependencies": {
    "next-auth": "^5.0.0-beta",
    "bcryptjs": "^2.4.3",
    "@types/bcryptjs": "^2.4.6"
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

### Componentes UI (shadcn/ui)
```bash
# Instalar shadcn/ui CLI
npx shadcn@latest init

# Componentes a instalar:
npx shadcn@latest add button
npx shadcn@latest add card
npx shadcn@latest add dialog
npx shadcn@latest add input
npx shadcn@latest add label
npx shadcn@latest add table
npx shadcn@latest add toast
npx shadcn@latest add dropdown-menu
npx shadcn@latest add avatar
npx shadcn@latest add badge
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

### PDF Generation (Opcional - para futuro)
```json
{
  "dependencies": {
    "playwright": "^1.48.0",
    "@sparticuz/chromium": "^130.0.0"
  }
}
```

---

## 🔐 VARIABLES DE ENTORNO

### Archivo: `.env.local`

```bash
# ─── URLs Base ────────────────────────────
NEXT_PUBLIC_URL=http://localhost:3000
NEXT_PUBLIC_BASE_URL=http://localhost:3000
NEXT_PUBLIC_SITE_URL=https://docs.gard.cl
NEXT_PUBLIC_APP_URL=http://localhost:3000

# ─── Base de Datos Neon PostgreSQL ────────
DATABASE_URL="postgresql://neondb_owner:npg_tWPbnpd7yh9i@ep-falling-pond-ahxb0r41-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require"

# ─── Autenticación y Seguridad ────────────
# Email del administrador
ADMIN_EMAIL="carlos.irigoyen@gard.cl"
# Password en texto plano SOLO para desarrollo local
ADMIN_PASSWORD_DEV="GardSecurity2026!"
# Hash para producción
ADMIN_PASSWORD_HASH="$2b$10$f6gLWyadKS4dzJ11OMQEz.TBEOx7fGKD6HrVdsQLBKy/6XkXFDdOm"
# JWT Secret
JWT_SECRET="dev-jwt-secret-local-2026"
JWT_SECRET_KEY="dev-jwt-secret-local-2026"
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# ─── NextAuth.js ──────────────────────────
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET="dev-nextauth-secret-2026-change-in-production"

# ─── Zoho CRM (Webhook) ───────────────────
# IMPORTANTE: Usa este mismo secret en la función Deluge de Zoho
ZOHO_WEBHOOK_SECRET="2da045c6e8e4edb4d02b03907c223ed1d8ab401410e20788acaf39b30497ac0d"

# ─── Email (Resend) ───────────────────────
# https://resend.com
RESEND_API_KEY="re_538ThYJQ_CpovK1ZzEU4kdfny3UwhvyDu"
EMAIL_FROM="comercial@gard.cl"

# ─── Node Environment ─────────────────────
NODE_ENV=development
```

### Variables para Producción (Vercel)

```bash
# Actualizar en Vercel Dashboard → Settings → Environment Variables:

NEXT_PUBLIC_SITE_URL=https://docs.gard.cl
NEXT_PUBLIC_APP_URL=https://docs.gard.cl
NEXTAUTH_URL=https://docs.gard.cl
NODE_ENV=production

# Las demás mantienen los mismos valores
```

---

## 🎯 SISTEMA DE TOKENS DINÁMICOS

### Tokens Disponibles (desde Zoho CRM)

#### De la Cotización (Quote)
```
[QUOTE_ID]           → quote.id
[QUOTE_NUMBER]       → quote.Quote_Number
[QUOTE_SUBJECT]      → quote.Subject
[QUOTE_DESCRIPTION]  → quote.Descripcion_Al
[QUOTE_SUBTOTAL]     → quote.Sub_Total
[QUOTE_TAX]          → quote.Tax
[QUOTE_TOTAL]        → quote.Grand_Total
[QUOTE_CURRENCY]     → quote.Currency
[QUOTE_VALID_UNTIL]  → quote.Valid_Till
[QUOTE_CREATED_DATE] → quote.Created_Time
```

#### De la Cuenta (Account)
```
[ACCOUNT_NAME]       → account.Account_Name
[ACCOUNT_PHONE]      → account.Phone
[ACCOUNT_WEBSITE]    → account.Website
[ACCOUNT_INDUSTRY]   → account.Industry
[ACCOUNT_RUT]        → account.RUT__c
[ACCOUNT_GIRO]       → account.Giro__c
[ACCOUNT_ADDRESS]    → account.Billing_Street
[ACCOUNT_CITY]       → account.Billing_City
[ACCOUNT_STATE]      → account.Billing_State
[ACCOUNT_ZIP]        → account.Billing_Code
```

#### Del Contacto (Contact)
```
[CONTACT_NAME]       → contact.Full_Name
[CONTACT_FIRST_NAME] → contact.First_Name
[CONTACT_LAST_NAME]  → contact.Last_Name
[CONTACT_TITLE]      → contact.Title
[CONTACT_DEPARTMENT] → contact.Department
[CONTACT_EMAIL]      → contact.Email
[CONTACT_PHONE]      → contact.Phone
[CONTACT_MOBILE]     → contact.Mobile
```

#### Del Negocio (Deal)
```
[DEAL_NAME]          → deal.Deal_Name
[DEAL_STAGE]         → deal.Stage
[DEAL_AMOUNT]        → deal.Amount
[DEAL_PROBABILITY]   → deal.Probability
[DEAL_CLOSING_DATE]  → deal.Closing_Date
[DEAL_TYPE]          → deal.Type
[DEAL_DESCRIPTION]   → deal.Description
[DEAL_LOCATION]      → deal.Direcci_n_Google_Maps
```

#### Tokens de Sistema
```
[CURRENT_DATE]       → new Date().toLocaleDateString('es-CL')
[CURRENT_YEAR]       → new Date().getFullYear()
[PRESENTATION_ID]    → uniqueId de la presentación
[PRESENTATION_URL]   → docs.gard.cl/p/[uniqueId]
```

### Implementación de Reemplazo de Tokens

```typescript
// src/lib/tokens.ts

type ZohoData = {
  quote: Record<string, any>
  account: Record<string, any>
  contact: Record<string, any>
  deal: Record<string, any>
}

export function replaceTokens(template: string, data: ZohoData): string {
  let result = template
  
  // Mapeo de tokens
  const tokenMap: Record<string, any> = {
    // Quote
    '[QUOTE_ID]': data.quote?.id,
    '[QUOTE_NUMBER]': data.quote?.Quote_Number,
    '[QUOTE_SUBJECT]': data.quote?.Subject,
    '[QUOTE_DESCRIPTION]': data.quote?.Descripcion_Al,
    '[QUOTE_SUBTOTAL]': formatCurrency(data.quote?.Sub_Total),
    '[QUOTE_TAX]': formatCurrency(data.quote?.Tax),
    '[QUOTE_TOTAL]': formatCurrency(data.quote?.Grand_Total),
    '[QUOTE_CURRENCY]': data.quote?.Currency || 'CLP',
    '[QUOTE_VALID_UNTIL]': formatDate(data.quote?.Valid_Till),
    '[QUOTE_CREATED_DATE]': formatDate(data.quote?.Created_Time),
    
    // Account
    '[ACCOUNT_NAME]': data.account?.Account_Name,
    '[ACCOUNT_PHONE]': data.account?.Phone,
    '[ACCOUNT_WEBSITE]': data.account?.Website,
    '[ACCOUNT_INDUSTRY]': data.account?.Industry,
    '[ACCOUNT_RUT]': data.account?.RUT__c,
    '[ACCOUNT_GIRO]': data.account?.Giro__c,
    '[ACCOUNT_ADDRESS]': data.account?.Billing_Street,
    '[ACCOUNT_CITY]': data.account?.Billing_City,
    '[ACCOUNT_STATE]': data.account?.Billing_State,
    '[ACCOUNT_ZIP]': data.account?.Billing_Code,
    
    // Contact
    '[CONTACT_NAME]': data.contact?.Full_Name,
    '[CONTACT_FIRST_NAME]': data.contact?.First_Name,
    '[CONTACT_LAST_NAME]': data.contact?.Last_Name,
    '[CONTACT_TITLE]': data.contact?.Title,
    '[CONTACT_DEPARTMENT]': data.contact?.Department,
    '[CONTACT_EMAIL]': data.contact?.Email,
    '[CONTACT_PHONE]': data.contact?.Phone,
    '[CONTACT_MOBILE]': data.contact?.Mobile,
    
    // Deal
    '[DEAL_NAME]': data.deal?.Deal_Name,
    '[DEAL_STAGE]': data.deal?.Stage,
    '[DEAL_AMOUNT]': formatCurrency(data.deal?.Amount),
    '[DEAL_PROBABILITY]': data.deal?.Probability,
    '[DEAL_CLOSING_DATE]': formatDate(data.deal?.Closing_Date),
    '[DEAL_TYPE]': data.deal?.Type,
    '[DEAL_DESCRIPTION]': data.deal?.Description,
    '[DEAL_LOCATION]': data.deal?.Direcci_n_Google_Maps,
    
    // System
    '[CURRENT_DATE]': new Date().toLocaleDateString('es-CL'),
    '[CURRENT_YEAR]': new Date().getFullYear(),
  }
  
  // Reemplazar todos los tokens
  Object.entries(tokenMap).forEach(([token, value]) => {
    const regex = new RegExp(escapeRegExp(token), 'g')
    result = result.replace(regex, value ?? '')
  })
  
  return result
}

function formatCurrency(value: number | string | undefined): string {
  if (!value) return '$0'
  const num = typeof value === 'string' ? parseFloat(value) : value
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
  }).format(num)
}

function formatDate(date: string | undefined): string {
  if (!date) return ''
  return new Date(date).toLocaleDateString('es-CL', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
```

---

## 📧 TEMPLATES DE EMAIL

### Email: Presentación Enviada

```tsx
// src/templates/emails/presentation-sent.tsx

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'

interface PresentationSentEmailProps {
  clientName: string
  contactName: string
  presentationUrl: string
  quoteName: string
}

export default function PresentationSentEmail({
  clientName = 'Cliente',
  contactName = 'Estimado/a',
  presentationUrl = 'https://docs.gard.cl/p/example',
  quoteName = 'Propuesta Comercial',
}: PresentationSentEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Tu propuesta comercial de Gard Security está lista</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Img
              src="https://docs.gard.cl/logos/gard-white.svg"
              width="120"
              height="40"
              alt="Gard Security"
            />
          </Section>
          
          <Section style={content}>
            <Heading style={h1}>
              Tu propuesta está lista, {contactName}
            </Heading>
            
            <Text style={text}>
              Hemos preparado una propuesta comercial personalizada para{' '}
              <strong>{clientName}</strong>.
            </Text>
            
            <Text style={text}>
              <strong>{quoteName}</strong>
            </Text>
            
            <Section style={buttonContainer}>
              <Button style={button} href={presentationUrl}>
                Ver Propuesta Completa
              </Button>
            </Section>
            
            <Text style={textSmall}>
              O copia este enlace en tu navegador:
              <br />
              <Link href={presentationUrl} style={link}>
                {presentationUrl}
              </Link>
            </Text>
            
            <Text style={text}>
              Esta propuesta ha sido diseñada específicamente para tus
              necesidades. Si tienes alguna pregunta, no dudes en contactarnos.
            </Text>
          </Section>
          
          <Section style={footer}>
            <Text style={footerText}>
              © {new Date().getFullYear()} Gard Security
              <br />
              <Link href="https://gard.cl" style={footerLink}>
                gard.cl
              </Link>{' '}
              ·{' '}
              <Link href="mailto:comercial@gard.cl" style={footerLink}>
                comercial@gard.cl
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

// Estilos inline (requerido por email clients)
const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
}

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  marginTop: '40px',
  marginBottom: '40px',
  borderRadius: '8px',
  overflow: 'hidden',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
}

const header = {
  backgroundColor: '#1e3a5f',
  padding: '30px',
  textAlign: 'center' as const,
}

const content = {
  padding: '40px',
}

const h1 = {
  color: '#1e3a5f',
  fontSize: '28px',
  fontWeight: '700',
  lineHeight: '1.3',
  margin: '0 0 20px',
}

const text = {
  color: '#374151',
  fontSize: '16px',
  lineHeight: '1.6',
  margin: '0 0 16px',
}

const textSmall = {
  color: '#6b7280',
  fontSize: '14px',
  lineHeight: '1.5',
  margin: '20px 0',
}

const buttonContainer = {
  textAlign: 'center' as const,
  margin: '32px 0',
}

const button = {
  backgroundColor: '#00d4aa',
  borderRadius: '6px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '14px 32px',
}

const link = {
  color: '#00d4aa',
  textDecoration: 'underline',
  wordBreak: 'break-all' as const,
}

const footer = {
  backgroundColor: '#f9fafb',
  padding: '24px',
  textAlign: 'center' as const,
  borderTop: '1px solid #e5e7eb',
}

const footerText = {
  color: '#6b7280',
  fontSize: '14px',
  lineHeight: '1.5',
  margin: '0',
}

const footerLink = {
  color: '#1e3a5f',
  textDecoration: 'none',
}
```

---

## 🚀 ROADMAP DE IMPLEMENTACIÓN

### FASE 0: Setup Inicial (1 día)

#### Tareas:
- [ ] ✅ Crear proyecto Next.js 15
- [ ] ✅ Configurar TailwindCSS + shadcn/ui
- [ ] ✅ Configurar variables de entorno (.env.local)
- [ ] ✅ Configurar Prisma con Neon
- [ ] ✅ Crear schema inicial de BD
- [ ] ✅ Ejecutar primera migración
- [ ] ✅ Setup de TypeScript y ESLint
- [ ] ✅ Deploy inicial a Vercel (solo landing vacío)

#### Entregables:
- Proyecto funcional en localhost:3000
- Base de datos conectada
- Deploy en docs.gard.cl (página "Coming Soon")

---

### FASE 1: Webhook y Sistema de Tokens (2-3 días)

#### Tareas:
- [ ] Crear endpoint `/api/webhook/zoho`
- [ ] Validación de webhook secret
- [ ] Parser de datos de Zoho
- [ ] Guardado en tabla `webhook_sessions`
- [ ] Sistema de tokens (lib/tokens.ts)
- [ ] Tests del webhook con Postman/curl

#### Entregables:
- Webhook funcional que recibe y guarda datos
- Sistema de reemplazo de tokens operativo
- Documentación de cómo probar desde Zoho

---

### FASE 2: Templates Base (3-4 días)

#### Tareas:
- [ ] Crear estructura de directorios para templates
- [ ] Diseñar template "Commercial" (estilo Qwilr):
  - Sección Hero/Portada
  - Resumen Ejecutivo
  - Problema/Oportunidad
  - Nuestra Solución
  - Alcance del Servicio
  - Timeline de Implementación
  - Propuesta Económica
  - Casos de Éxito
  - CTA Final
- [ ] Implementar componentes de secciones reutilizables
- [ ] Sistema de animaciones on-scroll
- [ ] Responsive design (mobile-first)
- [ ] Guardar templates en BD

#### Entregables:
- Template comercial completo y responsive
- Componentes reutilizables documentados
- Preview funcional del template

---

### FASE 3: Modal de Selección y Preview (2 días)

#### Tareas:
- [ ] Crear página `/select-template`
- [ ] Modal con lista de templates
- [ ] Thumbnails de preview
- [ ] Selección de template → sessionId
- [ ] Crear página `/preview/[sessionId]`
- [ ] Renderizar template con tokens reemplazados
- [ ] Botón "Enviar por Email"
- [ ] Botón "Cancelar"

#### Entregables:
- Modal funcional de selección
- Preview de borrador con datos reales
- UX fluida entre pasos

---

### FASE 4: Envío de Email y Generación de Links (2-3 días)

#### Tareas:
- [ ] Integración con Resend API
- [ ] Crear template de email (React Email)
- [ ] Endpoint `/api/presentations/send-email`
- [ ] Generación de uniqueId para presentación
- [ ] Guardado en tabla `presentations`
- [ ] Envío de email con link
- [ ] Confirmación de envío en UI
- [ ] Botón "Enviar por WhatsApp" post-envío

#### Entregables:
- Emails enviados correctamente
- Links únicos generados
- Notificación de éxito al usuario

---

### FASE 5: Vista Pública de Presentaciones (2 días)

#### Tareas:
- [ ] Crear página `/p/[uniqueId]`
- [ ] Buscar presentación en BD por uniqueId
- [ ] Renderizar presentación estilo Qwilr
- [ ] Tracking de visualizaciones (IP, user agent, timestamp)
- [ ] Incrementar view_count
- [ ] Header con logo Gard
- [ ] Footer con CTA
- [ ] (Opcional) Botón "Descargar PDF"

#### Entregables:
- Presentaciones públicas accesibles por link
- Tracking de vistas funcional
- Diseño pulido y profesional

---

### FASE 6: Autenticación y Dashboard Admin (3-4 días)

#### Tareas:
- [ ] Configurar NextAuth.js v5
- [ ] Página de login `/admin`
- [ ] Validación de credenciales (email + password hash)
- [ ] Generación de session JWT
- [ ] Middleware de protección de rutas admin
- [ ] Crear layout de admin con sidebar
- [ ] Dashboard principal `/admin/dashboard`:
  - Stats generales
  - Lista de presentaciones recientes
  - Gráfico de actividad (opcional)
- [ ] Página `/admin/presentations`:
  - Lista completa con filtros
  - Ver detalle de cada presentación
  - Analytics individuales

#### Entregables:
- Login funcional con sesiones seguras
- Dashboard con estadísticas en tiempo real
- Lista de presentaciones con trazabilidad

---

### FASE 7: Gestión de Templates (2 días)

#### Tareas:
- [ ] Página `/admin/templates`
- [ ] Lista de templates con cards
- [ ] Click en template → preview (solo lectura)
- [ ] Botón "Ver código fuente" (abre archivo en VS Code)
- [ ] Botón "Duplicar template"
- [ ] Botón "Eliminar template" (con confirmación)
- [ ] Documentación interna de cómo editar templates

#### Entregables:
- UI de gestión de templates
- Preview de templates en admin
- Documentación para editar con Cursor

---

### FASE 8: WhatsApp Share (1 día)

#### Tareas:
- [ ] Implementar botón "Enviar por WhatsApp"
- [ ] Formateo de número de teléfono
- [ ] Generación de URL wa.me con mensaje pre-llenado
- [ ] Apertura de WhatsApp (web o app)
- [ ] Registro en BD: `whatsapp_shared_at`
- [ ] Mostrar confirmación en UI

#### Entregables:
- Funcionalidad de compartir por WhatsApp operativa
- Mensaje pre-llenado personalizado
- Tracking de compartidos

---

### FASE 9: Polish y Optimización (2-3 días)

#### Tareas:
- [ ] Optimización de imágenes (next/image)
- [ ] Loading states y spinners
- [ ] Error handling (ErrorBoundary)
- [ ] Toasts y notificaciones
- [ ] Validación de formularios
- [ ] Accesibilidad (a11y)
- [ ] SEO básico
- [ ] Testing en distintos dispositivos
- [ ] Performance optimization (Lighthouse)

#### Entregables:
- Aplicación pulida y optimizada
- UX suave sin errores
- Score de Lighthouse >90

---

### FASE 10: Documentación y Deploy Final (1 día)

#### Tareas:
- [ ] Documentar endpoints de API
- [ ] Documentar estructura de templates
- [ ] Guía de uso para admins
- [ ] README completo
- [ ] Deploy a producción en Vercel
- [ ] Configurar variables de entorno en Vercel
- [ ] Configurar dominio docs.gard.cl
- [ ] Testing en producción
- [ ] Backup de BD

#### Entregables:
- Aplicación en producción funcionando
- Documentación completa
- Sistema listo para uso

---

## 📊 ESTIMACIÓN TOTAL

| Fase                    | Duración  | Complejidad |
|-------------------------|-----------|-------------|
| 0. Setup Inicial        | 1 día     | Baja        |
| 1. Webhook y Tokens     | 2-3 días  | Media       |
| 2. Templates Base       | 3-4 días  | Alta        |
| 3. Modal y Preview      | 2 días    | Media       |
| 4. Email y Links        | 2-3 días  | Media       |
| 5. Vista Pública        | 2 días    | Media       |
| 6. Auth y Dashboard     | 3-4 días  | Alta        |
| 7. Gestión Templates    | 2 días    | Baja        |
| 8. WhatsApp Share       | 1 día     | Baja        |
| 9. Polish               | 2-3 días  | Media       |
| 10. Docs y Deploy       | 1 día     | Baja        |

**TOTAL:** 21-27 días de desarrollo (~4-5 semanas)

---

## 🎨 EJEMPLO DE TEMPLATE COMERCIAL

### Estructura de Secciones

```typescript
// src/templates/presentations/commercial.tsx

export const commercialTemplate = {
  id: 'commercial',
  name: 'Propuesta Comercial',
  sections: [
    {
      id: 'hero',
      component: 'SectionHero',
      props: {
        title: 'Propuesta Comercial',
        subtitle: 'Para [ACCOUNT_NAME]',
        description: 'Preparado por Gard Security · [CURRENT_DATE]',
        backgroundImage: '/images/hero-bg.jpg',
        ctaText: 'Ver propuesta',
      },
    },
    {
      id: 'executive-summary',
      component: 'SectionExecutiveSummary',
      props: {
        eyebrow: 'Resumen Ejecutivo',
        title: 'Tu desafío, nuestra solución',
        description: '[QUOTE_DESCRIPTION]',
        stats: [
          { value: '15+', label: 'Años de experiencia' },
          { value: '200+', label: 'Clientes activos' },
          { value: '98%', label: 'Tasa de retención' },
        ],
      },
    },
    {
      id: 'problem',
      component: 'SectionProblem',
      props: {
        eyebrow: 'El Desafío',
        title: 'Los retos de seguridad que enfrentas',
        challenges: [
          {
            icon: 'AlertTriangle',
            title: 'Falta de supervisión continua',
            description: 'Sin control en tiempo real de tu equipo de guardias.',
          },
          {
            icon: 'FileText',
            title: 'Reportabilidad limitada',
            description: 'Informes manuales que llegan tarde.',
          },
          {
            icon: 'Shield',
            title: 'Incidentes sin respuesta rápida',
            description: 'Tiempo de reacción elevado ante emergencias.',
          },
        ],
      },
    },
    {
      id: 'solution',
      component: 'SectionSolution',
      props: {
        eyebrow: 'Nuestra Solución',
        title: 'Cómo te ayudamos',
        features: [
          {
            icon: 'Eye',
            title: 'Supervisión 24/7',
            description: 'Monitoreo continuo de tu equipo de seguridad.',
          },
          {
            icon: 'BarChart',
            title: 'Reportabilidad ejecutiva',
            description: 'Informes automáticos en tiempo real.',
          },
          {
            icon: 'Zap',
            title: 'Respuesta inmediata',
            description: 'Protocolos de acción ante cualquier incidente.',
          },
        ],
      },
    },
    {
      id: 'scope',
      component: 'SectionScope',
      props: {
        eyebrow: 'Alcance del Servicio',
        title: 'Qué incluye esta propuesta',
        items: [
          { name: 'Guardias de seguridad 24/7', included: true },
          { name: 'Supervisión en terreno', included: true },
          { name: 'Central de monitoreo', included: true },
          { name: 'Reportes semanales', included: true },
          { name: 'Equipamiento (radios, linternas)', included: true },
          { name: 'Seguros y cumplimiento legal', included: true },
          { name: 'Cámaras de seguridad', included: false, note: 'Cotización aparte' },
          { name: 'Control de acceso biométrico', included: false, note: 'Cotización aparte' },
        ],
      },
    },
    {
      id: 'timeline',
      component: 'SectionTimeline',
      props: {
        eyebrow: 'Implementación',
        title: 'Cómo comenzamos',
        steps: [
          { week: 'Semana 1', title: 'Levantamiento', description: 'Reunión inicial y visita en terreno.' },
          { week: 'Semana 2', title: 'Diseño', description: 'Propuesta de dotación y turnos.' },
          { week: 'Semana 3', title: 'Reclutamiento', description: 'Selección y capacitación de guardias.' },
          { week: 'Semana 4', title: 'Go-live', description: 'Inicio del servicio con supervisión.' },
        ],
      },
    },
    {
      id: 'pricing',
      component: 'SectionPricing',
      props: {
        eyebrow: 'Propuesta Económica',
        title: 'Inversión mensual',
        items: [
          { quantity: 4, description: 'Guardias 24/7 (turnos 6x1)', unitPrice: 950000, subtotal: 3800000 },
          { quantity: 1, description: 'Supervisor de seguridad', unitPrice: 1200000, subtotal: 1200000 },
          { quantity: 1, description: 'Central de monitoreo', unitPrice: 300000, subtotal: 300000 },
        ],
        subtotal: 5300000,
        tax: 1007000,
        total: 6307000,
        currency: 'CLP',
        notes: [
          'Valor mensual en pesos chilenos',
          'Incluye seguros y cumplimiento legal',
          'Mínimo 12 meses de contrato',
        ],
      },
    },
    {
      id: 'case-studies',
      component: 'SectionCaseStudies',
      props: {
        eyebrow: 'Casos de Éxito',
        title: 'Clientes que confían en nosotros',
        clients: [
          { name: 'Polpaico', logo: '/logos/polpaico.svg' },
          { name: 'International Paper', logo: '/logos/ipaper.svg' },
          { name: 'Tritec', logo: '/logos/tritec.svg' },
          { name: 'Sparta', logo: '/logos/sparta.svg' },
        ],
        testimonial: {
          quote: 'Gard Security transformó nuestra operación de seguridad. La trazabilidad y reportabilidad son excepcionales.',
          author: 'Gerente de Operaciones',
          company: 'Cliente Industrial',
        },
      },
    },
    {
      id: 'cta',
      component: 'SectionCTA',
      props: {
        title: '¿Listo para mejorar tu seguridad?',
        description: 'Hablemos sobre cómo podemos ayudarte',
        primaryCta: {
          text: 'Agendar reunión',
          href: 'https://gard.cl/contacto',
        },
        secondaryCta: {
          text: 'Descargar PDF',
          href: '/api/presentations/[uniqueId]/pdf',
        },
      },
    },
  ],
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

## 📈 MÉTRICAS Y ANALYTICS

### Métricas a Trackear

#### Por Presentación
- Número de vistas
- Fecha/hora de cada vista
- IP y user agent (opcional)
- Tiempo promedio en la página
- Scroll depth (opcional - con analytics avanzado)
- Conversión (si hay CTA con tracking)

#### Globales
- Total presentaciones enviadas
- Tasa de apertura (vistas / enviadas)
- Presentaciones más vistas
- Templates más usados
- Clientes más activos

#### Dashboard Admin
- Últimas 10 presentaciones
- Actividad de los últimos 7 días (gráfico)
- Presentaciones pendientes de ver
- Tasa de conversión (opcional)

---

## 🎓 GUÍA DE USO PARA EDITAR TEMPLATES

### Para Editar un Template (Sin Editor Visual)

1. **Acceder al código del template:**
   ```
   /src/templates/presentations/[nombre-template].tsx
   ```

2. **Dar instrucciones a Cursor:**
   ```
   "En el template commercial.tsx, en la sección de pricing,
   agrega una nueva fila en la tabla con:
   - Descripción: 'Equipamiento especial'
   - Cantidad: 1
   - Precio unitario: $500.000
   - Calcular automáticamente el subtotal"
   ```

3. **Cursor edita el archivo directamente**

4. **Recargar preview en el navegador**

5. **Verificar cambios**

### Ventajas de este Enfoque
- ✅ No hay bugs de editor WYSIWYG
- ✅ Control total del código
- ✅ Cambios versionados en Git
- ✅ Más rápido para desarrolladores
- ✅ Cursor entiende el contexto completo

---

## ✅ CHECKLIST FINAL PRE-LANZAMIENTO

### Funcionalidad
- [ ] Webhook de Zoho recibe datos correctamente
- [ ] Modal de selección muestra templates
- [ ] Preview de borrador renderiza con tokens
- [ ] Email se envía correctamente via Resend
- [ ] Link de presentación pública funciona
- [ ] Tracking de vistas se registra en BD
- [ ] WhatsApp share abre con mensaje pre-llenado
- [ ] Login admin funciona
- [ ] Dashboard muestra estadísticas correctas
- [ ] Templates se pueden visualizar

### Seguridad
- [ ] Webhook secret validado
- [ ] Passwords hasheados
- [ ] Rutas admin protegidas
- [ ] HTTPS en producción
- [ ] Variables de entorno en Vercel

### Performance
- [ ] Imágenes optimizadas
- [ ] CSS/JS minificados
- [ ] Lighthouse score >90
- [ ] Tiempo de carga <3s

### UX/UI
- [ ] Responsive en todos los dispositivos
- [ ] Animaciones suaves
- [ ] Loading states
- [ ] Error handling
- [ ] Accesibilidad básica (a11y)

### Deploy
- [ ] Deploy en Vercel exitoso
- [ ] Dominio docs.gard.cl apuntando correctamente
- [ ] Base de datos Neon accesible
- [ ] Variables de entorno configuradas
- [ ] Backup de BD realizado

---

## 🎉 CONCLUSIÓN

Este documento define completamente la aplicación **Gard Docs**, un sistema tipo Qwilr optimizado para Gard Security que transforma datos de Zoho CRM en presentaciones comerciales visualmente impactantes y trackables.

**Características principales:**
- ✅ Integración directa con Zoho CRM
- ✅ Diseño estilo Qwilr (scroll vertical elegante)
- ✅ Sistema de tokens dinámicos
- ✅ Envío por email y WhatsApp
- ✅ Dashboard administrativo con analytics
- ✅ Templates editables por IA (Cursor)

**Próximo paso:**
Usar este documento como referencia para implementar fase por fase según el roadmap definido.

---

**Versión:** 1.0  
**Última actualización:** 04 de Febrero de 2026  
**Autor:** Definido por Carlos Irigoyen (Gard Security)  
**Implementación:** Cursor AI + Desarrollador

---

## 📞 CONTACTO Y SOPORTE

Para dudas o cambios en este documento:
- Email: carlos.irigoyen@gard.cl
- Proyecto: docs.gard.cl
- Repositorio: (a definir)

---

**FIN DEL DOCUMENTO MAESTRO**
