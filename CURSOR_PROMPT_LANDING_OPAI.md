# CURSOR PROMPT — Landing opai.cl + Estrategia de marca y precios

> **Cómo usar este archivo:** Pégalo completo al inicio de una sesión en Cursor o Claude Code.
> También puedes referenciarlo con `@CURSOR_PROMPT_LANDING_OPAI.md` en Cursor.

---

## CONTEXTO DEL PROYECTO

Opai es un ERP vertical para empresas de seguridad privada en Chile.
Stack: **Next.js 16 App Router, TypeScript, Prisma, Tailwind CSS, Vercel.**
Dominio nuevo: **opai.cl** (ya registrado). El deploy actual está en `opai.gard.cl`.

### Estado actual de public/
La carpeta `public/` ya fue reorganizada:
```
public/
  brand/opai/           ← Brand kit oficial OPAI
    logotipo/           ← logo-horizontal-dark.png, logo-horizontal-white.png, logo-stacked-*.png
    isotipo/            ← isotipo-dark.png, isotipo-white.png, isotipo-dark-bg.png
    favicon/            ← favicon-16x16.png ... favicon-180x180.png
    pwa/                ← icon-192x192.png, icon-512x512.png, apple-touch-icon.png, icon-maskable-512.png
    social/             ← og-image.png
    svg/                ← logo-horizontal.svg, logo-stacked.svg, isotipo.svg, favicon.svg
  tenants/
    gard/               ← Assets del tenant Gard Security
      logo/
      clientes/         ← Logos de clientes de Gard
      images/
    _template/          ← Template para nuevos tenants
  media/
    guardias/           ← Fotos de guardias en servicio
    heroes/             ← Imágenes hero
    industrias/         ← Por industria
    servicios/          ← Servicios
```

**CRÍTICO — NO TOCAR:**
- `public/manifest*.json` — manifests PWA (la app los requiere en raíz)
- `public/sw*.js` y `public/rondas-sw.js` — service workers
- `public/uploads/` — archivos de usuarios (nunca mover ni eliminar)
- `public/fonts/`, `public/sounds/`, `public/icons/`, `public/iconos_azul/`

---

## TAREA PRINCIPAL: Crear la landing page opai.cl

### Archivo a crear
`src/app/(marketing)/page.tsx` — o donde corresponda según la estructura de rutas del proyecto.

Si el proyecto no tiene un grupo `(marketing)`, crear la landing en la ruta raíz del dominio `opai.cl`. 
El middleware ya diferencia entre dominios — revisar `src/middleware.ts` para entender cómo se enruta cada dominio.

### Tecnología
- Next.js App Router (Server Component por defecto)
- Tailwind CSS para estilos
- Componentes en `src/components/marketing/` (crear carpeta si no existe)
- SEO con `generateMetadata()` de Next.js
- Schema.org JSON-LD inline en el layout o page
- Imágenes con `next/image` apuntando a `/brand/opai/`

---

## DISEÑO VISUAL

### Paleta de colores (ya definida en el brand kit)
```css
--opai-teal:    #00D4AA   /* Color principal OPAI */
--opai-teal2:   #00B894   /* Hover */
--opai-navy:    #0B1120   /* Fondo dark */
--opai-obsidian:#06080F   /* Fondo más oscuro */
--opai-card:    #141E30   /* Cards */
--opai-text:    #E2E8F0   /* Texto principal */
--opai-muted:   #94A3B8   /* Texto secundario */
--opai-border:  rgba(255,255,255,0.07)
```

### Tipografía
- Display/Títulos: **Syne** (Google Fonts, weight 700-800)
- Cuerpo: **Plus Jakarta Sans** (Google Fonts, weight 300-600)
- Mono (datos técnicos): **JetBrains Mono**

### Modo
Dark mode como principal. La landing usa fondo oscuro (`#0B1120`).

### Logo en la landing
Usar: `/brand/opai/svg/logo-horizontal.svg` (nav, footer)
Favicon: `/brand/opai/svg/favicon.svg`
OG Image: `/brand/opai/social/og-image.png`

---

## ESTRUCTURA DE SECCIONES (en orden)

### 1. NAV
- Logo OPAI (`/brand/opai/svg/logo-horizontal.svg`)
- Links: Módulos | Portales | Precios | Add-ons | Recursos
- CTAs: "Ingresar" (ghost) + "Demo gratis" (teal filled)
- Sticky, blur backdrop, border-bottom al hacer scroll
- Mobile: hamburger menu

### 2. HERO
**Headline principal:**
> "Deja de administrar la operación. Dedícate a proteger."

**Subheadline:**
> Las empresas de seguridad privada en Chile pierden horas cada día controlando quién llegó, quién faltó, qué ronda se completó y qué guardia va de reemplazo. OPAI converge todo en un solo sistema con inteligencia artificial — para que tu equipo se concentre en lo que importa: proteger a tus clientes.

**CTAs:** "Solicitar demo gratis →" + "Ver cómo funciona"

**Visual:** Dashboard animado con mock de marcaciones GPS, ronda en curso, alerta de cobertura flotante.

**Social proof:** Guardias activos + Cobertura + Años en la industria

### 3. EL PROBLEMA (3 columnas comparativas)

**Columna 1 — "Antes: Excel y llamadas"**
El sistema de antes: planillas, llamadas para confirmar asistencia, nada integrado.

**Columna 2 — "Hoy: Sistemas tradicionales"**
ERP genérico, software de RRHH, sistema de rondas aislado, planilla de payroll aparte.
Cada sistema tiene su propio login. Nada habla con nada. La información está en silos.
El gerente de operaciones vive en reuniones tratando de integrar manualmente lo que los sistemas no integran.

**Columna 3 — "Con OPAI"**
Un solo sistema. Todo conectado. IA que detecta patrones y alerta antes de que el problema ocurra.
El guardia marca desde el celular → el supervisor ve en tiempo real → el cliente ve en su portal → payroll se calcula solo.

**Mensaje clave:** No compites solo con el papel. Compites con sistemas robustos pero aislados, costosos de mantener, sin movilidad, sin IA, y sin visibilidad para el cliente.

### 4. MÓDULOS (filtrable por plan)

Grid de 12 módulos con badge de plan (Starter / Pro / Suite) y tabs filtrables.

**Módulos STARTER (núcleo operacional — siempre incluido):**
- 🛡️ Gestión de Guardias de Seguridad — Fichas OS10, contratos digitales, documentos, estructura de personal
- 📅 Pautas y Turnos — Planificación mensual drag & drop, cobertura por puesto
- 📍 Marcaciones GPS — Check-in/out con geolocalización y foto. Sin llamadas, sin dudas
- 📱 Portal del Guardia — App iOS y Android. Marcaciones, documentos, liquidaciones, chat
- 🔔 Alertas de Cobertura — WhatsApp automático cuando falta un guardia. Reemplazos en minutos
- 💬 Chat + Documentos — Comunicación interna, protocolos digitales, firma electrónica

**Módulos OPS PRO:**
- 🔁 Rondas GPS — Checkpoints QR/GPS, monitoreo IA, evidencia fotográfica, informes automáticos al cliente
- 🔍 Supervisión de Campo — Visitas técnicas, hallazgos con foto, checklists, evaluación de guardias
- 🖥️ Portal del Cliente — Visibilidad 24/7: guardias activos, rondas, incidentes, documentos
- 👔 Portal del Supervisor — App de campo para supervisores: visitas, equipo, novedades
- 📍 Portal de Marcación — Terminal kiosko para marcación pública (iPad, tablet)
- 💼 CRM + Cotizaciones (CPQ) — Pipeline de ventas, propuestas PDF, contratos digitales
- 📦 Inventario — Equipamiento, activos, uniformes y líneas móviles por guardia

**Módulos SUITE:**
- 💰 Payroll Chile — Liquidaciones automáticas según LRE, anticipos, bonos, exportación DT
- 🧾 Finanzas + Facturación — DTE electrónico SII, contabilidad, bancos Fintoc, conciliación
- 🏛️ Fiscalización DT — Portal inspector laboral con datos verificables, hash auditables
- 🏆 Gamificación — Rankings, badges, desafíos y beneficios para retener y motivar guardias
- 🤖 IA Avanzada — Centro de IA: análisis de patrones, predicción de ausentismo, alertas proactivas

### 5. LOS 4 PORTALES (showcase visual)

Mostrar los 4 accesos como tarjetas con mockup visual. Énfasis en que CADA ROL tiene su app optimizada.

**Portal del Cliente**
> Tu cliente ve en tiempo real qué guardias están en su instalación, qué rondas se realizaron, qué incidentes ocurrieron. Sin llamarte. Sin esperar el informe de fin de mes.
- Marcaciones con foto y GPS
- Estado de rondas en vivo
- Documentos e informes
- Comunicación directa

**Portal del Guardia** (iOS + Android)
> El guardia llega, marca con su celular, ejecuta rondas escaneando QR, reporta incidentes con foto, ve su liquidación, recibe documentos. Sin papeles.
- Check-in/out GPS
- Rondas con QR
- Liquidaciones y anticipos
- Chat y protocolos

**Portal del Supervisor**
> El supervisor de campo lleva todo en el celular: sus instalaciones asignadas, evaluación de guardias, registro de visitas técnicas con foto, hallazgos y novedades.
- Visitas técnicas digitales
- Evaluación de guardias
- Gestión de su equipo
- Novedades en tiempo real

**Portal de Marcación** (kiosko)
> Terminal de marcación para instalaciones sin guardia propio del turno. iPad o tablet en recepción. El cliente registra entradas y salidas con PIN o QR.

### 6. ADD-ONS (sección separada, importante)

Título: "Suma lo que necesitas, cuando lo necesitas"

Add-ons se agregan SOBRE cualquier plan base. Facturación adicional en UF/mes.

**Tabla de Add-ons:**

| Add-on | Descripción | Precio |
|--------|-------------|--------|
| 🚪 Control de Acceso | Gestión de acceso físico a instalaciones: whitelist de visitantes, pre-registro, torniquetes, dispositivos IoT. Historial completo de accesos | +0.15 UF/dispositivo/mes |
| 🤖 Centro de IA | Predicción de ausentismo, análisis de patrones de rondas, alertas proactivas de riesgo operacional | +0.8 UF/mes |
| 📊 Reportes Avanzados | Dashboards ejecutivos personalizados, exportación automatizada, reportes programados por cliente | +0.5 UF/mes |
| 🏆 Gamificación | Sistema de badges, desafíos, rankings y beneficios para guardias | +0.1 UF/guardia/mes |
| 🔗 Integración API | Acceso a la API de OPAI para integrar con sistemas propios del cliente | +1.5 UF/mes |
| 📱 App White-label | App del guardia y portal del cliente con branding propio de tu empresa | Cotizar |
| 🌐 Dominio Propio | Portal del cliente en tu dominio: `portal.tuempresa.cl` | +0.3 UF/mes |

### 7. PRECIOS EN UF

**Métrica:** por guardia activo/mes, en UF.

**Toggle:** UF / CLP (1 UF ≈ $38.000 CLP, actualizar dinámicamente desde API CMF).

**Plan Starter** — 0.12 UF/guardia/mes
≈ $4.500 CLP · hasta 50 guardias
- Fichas de guardias de seguridad
- Puestos y pautas mensuales
- Marcaciones GPS + foto
- Portal del Guardia (iOS + Android)
- Alertas de cobertura por WhatsApp
- Chat interno + documentos digitales
- Soporte por email

**Plan Operaciones Pro** — 0.28 UF/guardia/mes ⭐ Más popular
≈ $10.600 CLP · hasta 200 guardias
- Todo Starter +
- Sistema de Control de Rondas GPS
- Supervisión de campo
- Portal del Cliente (visibilidad 24/7)
- Portal del Supervisor
- CRM + Cotizaciones
- Inventario y activos
- Control de turno y refuerzos
- Soporte prioritario

**Plan Suite Completa** — 0.46 UF/guardia/mes
≈ $17.500 CLP · guardias ilimitados
- Todo Operaciones Pro +
- Payroll Chile (liquidaciones LRE)
- Facturación electrónica SII
- Contabilidad + bancos (Fintoc)
- Fiscalización DT
- IA avanzada
- Onboarding dedicado + SLA

**Nota visible:** "Los precios en UF se actualizan automáticamente con el valor oficial del día publicado por el Banco Central de Chile."

**Trial:** 14 días gratis con Suite Completa. Sin tarjeta de crédito.

### 8. TESTIMONIOS
3 testimonios de gerentes de operaciones / directores de empresas de seguridad chilenas.
Énfasis en: tiempo ahorrado, visibilidad del cliente, reemplazo de sistemas legacy.

### 9. BLOG / RECURSOS (3 artículos)

**Keywords objetivo para los artículos:**
- "Software para empresas de seguridad privada Chile"
- "Sistema de control de rondas para guardias"
- "ERP para empresas de seguridad privada"

Artículos sugeridos:
1. "Cómo reducir el ausentismo en guardias de seguridad con tecnología" — ops
2. "LRE 2025: guía completa de payroll para empresas de seguridad OS10" — normativa
3. "Control de rondas GPS vs papel: lo que tu cliente realmente ve" — tecnología

### 10. FAQ (con schema FAQPage)

7 preguntas, acordeón accesible, JSON-LD incluido:

1. ¿Qué es OPAI y para qué tipo de empresa es?
2. ¿Cómo funciona el control de rondas con GPS y QR?
3. ¿OPAI reemplaza mi sistema actual (ERP, software de RRHH, planilla de payroll)?
4. ¿Cuánto cuesta OPAI en pesos chilenos?
5. ¿Qué incluye el Portal del Cliente y cómo accede mi cliente?
6. ¿OPAI cumple con la normativa laboral chilena (LRE, Dirección del Trabajo)?
7. ¿En cuánto tiempo puedo tener OPAI funcionando en mi empresa?

### 11. CTA FINAL
"Deja de apagar incendios. Empieza a prevenir."
Subtítulo: "14 días de prueba con Suite completo. Sin contrato. Sin tarjeta de crédito."
Botón: "Solicitar demo gratis →"
Nota: "Onboarding incluido · Soporte en español · Datos en Chile"

### 12. BIFURCACIÓN DE LOGIN

**Título:** "¿Cómo quieres ingresar?"

Dos tarjetas:
1. **Ingresar a mi empresa** → `[slug].opai.cl` (redirige al subdominio del tenant)
   - Input para escribir el nombre de la empresa o subdominio
   - Ejemplos: gard.opai.cl, prosegur.opai.cl
   - Botón: "Ingresar →"

2. **Panel de plataforma** → `/platform/login` (superadmin de OPAI)
   - Solo para administradores de la plataforma OPAI
   - Roles: Superadmin, Soporte, Operaciones OPAI

### 13. FOOTER

4 columnas:
- **OPAI** — Logo + descripción corta + "Hecho en Chile 🇨🇱"
- **Plataforma** — Módulos, Portales, Precios, Add-ons, Changelog
- **Recursos** — Blog, Documentación, FAQ, Guía LRE 2025, API
- **Empresa** — Nosotros, Contacto, Partners, hola@opai.cl

---

## SEO — IMPLEMENTACIÓN COMPLETA

### generateMetadata() — Next.js
```typescript
export const metadata: Metadata = {
  title: 'OPAI — ERP para Empresas de Seguridad Privada en Chile',
  description: 'Sistema de gestión integral para empresas de seguridad privada. Gestión de guardias, control de rondas GPS, marcaciones, payroll y portal del cliente. El único ERP con IA diseñado para la seguridad privada en Chile.',
  keywords: [
    'ERP empresas de seguridad privada',
    'software empresa de seguridad Chile',
    'sistema de guardia de seguridad',
    'control de rondas GPS',
    'sistema de control de rondas',
    'gestión guardias de seguridad',
    'sistema de seguridad privada',
    'portal del guardia de seguridad',
    'portal del cliente seguridad',
    'control de acceso empresas seguridad',
    'sistema de marcación guardias',
    'payroll empresa de seguridad Chile',
    'ERP seguridad privada Chile',
  ],
  openGraph: {
    title: 'OPAI — ERP para Empresas de Seguridad Privada en Chile',
    description: 'Un solo sistema con IA para gestionar guardias, rondas, marcaciones, payroll y portal del cliente.',
    images: [{ url: '/brand/opai/social/og-image.png', width: 1200, height: 630 }],
    locale: 'es_CL',
    type: 'website',
    url: 'https://opai.cl',
    siteName: 'OPAI',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'OPAI — ERP para Empresas de Seguridad Privada en Chile',
    description: 'Gestión de guardias, rondas GPS, payroll y portal del cliente en un solo sistema con IA.',
    images: ['/brand/opai/social/og-image.png'],
  },
  alternates: { canonical: 'https://opai.cl' },
  robots: { index: true, follow: true },
};
```

### JSON-LD Schema (inline en el page.tsx)
Incluir los siguientes schemas:
1. `SoftwareApplication` — con offers (3 planes en UF), featureList, availableCountry: CL
2. `Organization` — nombre, url, logo, address Santiago CL
3. `FAQPage` — con las 7 preguntas del FAQ
4. `WebPage` — breadcrumb, isPartOf

### Keywords en el HTML (H1, H2, H3)
- H1: "ERP para Empresas de Seguridad Privada" (en hero o cerca)
- H2 visible: "Sistema de Control de Rondas para Guardias de Seguridad"
- H2 visible: "Portal del Cliente, Portal del Guardia, Portal del Supervisor"
- H3: "Control de Acceso" en la sección de add-ons
- Alt text de imágenes: "guardia de seguridad", "sistema de rondas GPS", etc.

---

## COMPONENTES A CREAR

```
src/components/marketing/
  MarketingNav.tsx        — Nav con logo OPAI brand
  HeroSection.tsx         — Hero con dashboard mock animado
  ProblemSection.tsx      — 3 columnas: papel → legacy → OPAI
  ModulesSection.tsx      — Grid filtrable por plan
  PortalsSection.tsx      — Los 4 portales con mockup
  AddOnsSection.tsx       — Tabla de add-ons con precios en UF
  PricingSection.tsx      — 3 planes con toggle UF/CLP
  TestimonialsSection.tsx — 3 testimonios
  BlogSection.tsx         — 3 artículos
  FaqSection.tsx          — Acordeón accesible con JSON-LD
  CtaSection.tsx          — CTA final
  LoginGate.tsx           — Bifurcación de login (empresa vs plataforma)
  MarketingFooter.tsx     — Footer 4 columnas
```

---

## LÓGICA DEL PRECIO EN UF

Crear `src/lib/uf.ts` (si no existe) o usar el existente:

```typescript
// Obtener UF del día desde la tabla FxUfRate de Prisma
// o desde la API del CMF: https://mindicador.cl/api/uf
// Mostrar: "1 UF = $38.XXX CLP (Banco Central, hoy DD/MM/YYYY)"

export async function getUfHoy(): Promise<number> {
  // Primero intentar desde DB (tabla FxUfRate, ya existe en el schema)
  // Fallback: fetch a https://mindicador.cl/api/uf
}
```

En la sección de precios: `{(0.12 * ufValue).toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })}`

---

## CONTROL DE ACCESO — EXPLICACIÓN DE POSICIONAMIENTO

El Control de Acceso es un **add-on** porque:
- No todas las empresas de seguridad necesitan gestionar el acceso físico de sus clientes
- Implica hardware adicional (torniquetes, lectores, dispositivos IoT)
- El precio depende del número de dispositivos, no del número de guardias
- Permite venderlo separado a clientes que ya tienen el sistema principal

**Cómo describirlo en el landing:**
> "Controla quién entra y sale de cada instalación. Whitelist de visitantes autorizados, pre-registro digital, historial completo de accesos. Compatible con torniquetes y lectores de acceso. Todo visible desde el portal del cliente en tiempo real."

---

## MESSAGING ESTRATÉGICO — CÓMO HABLA OPAI

### El dolor real de las empresas de seguridad hoy:
No es solo que usen papel. Muchas ya tienen "sistemas":
- Un ERP genérico (SAP, Dynamics, Softland) que no entiende lo que es una "pauta de turno"
- Un software de rondas que no habla con el de RRHH
- Un sistema de planillas que no se conecta con el de marcaciones
- Cada módulo en un silo, con su propio proveedor, su propio login, su propio soporte

**El resultado:** El gerente de operaciones vive exportando Excel de un sistema e importándolo en otro. La información tiene 24 horas de delay. El cliente no ve nada. El guardia necesita 3 apps distintas.

### El ángulo de IA (OPAI lo tiene):
- IA detecta patrones de ausentismo antes de que ocurra
- IA analiza rutas de ronda y sugiere optimizaciones
- IA alerta cuando un guardia históricamente no cumple en cierta instalación
- IA genera informes automáticos para el cliente

### Frases clave para el copy:
- "El único ERP diseñado para la seguridad privada, no adaptado para ella"
- "Tu cliente no quiere llamarte. Quiere ver."
- "Converge todo: operación, personal, finanzas y cliente en un solo sistema"
- "Los sistemas aislados crean brechas. OPAI las cierra."
- "Deja de administrar la operación. Dedícate a proteger."
- "El guardia marca con el celular. Tú ves en tiempo real. Tu cliente también."

---

## MOBILE FIRST — REQUISITOS TÉCNICOS

- Viewport: la landing debe verse perfecta en 390px (iPhone 15)
- Touch targets mínimo 44x44px
- No hover-only interactions — todo debe funcionar con tap
- El toggle UF/CLP debe ser grande y fácil de tocar
- El FAQ acordeón debe ser touch-friendly
- La sección de módulos con tabs debe ser scrollable horizontalmente en mobile
- El nav en mobile debe ser hamburger con menú deslizable

---

## ARCHIVOS A CREAR / MODIFICAR

1. `src/app/(marketing)/page.tsx` — Landing principal
2. `src/app/(marketing)/layout.tsx` — Layout con metadata y JSON-LD
3. `src/components/marketing/*.tsx` — Todos los componentes listados arriba
4. `src/lib/uf.ts` — Helper para precio UF del día (usar el existente si ya existe)
5. `src/app/api/public/uf/route.ts` — Endpoint público para el precio UF (para el toggle client-side)

**NO MODIFICAR** (archivos críticos del sistema existente):
- Cualquier archivo en `src/app/(app)/` — es el ERP interno
- Cualquier archivo en `src/app/portal/` — son los portales
- `src/lib/auth.ts`, `src/lib/tenant.ts`, `src/lib/prisma.ts`
- `src/middleware.ts` — solo agregar regla para el host opai.cl si es necesario

---

## MIDDLEWARE — ROUTING OPAI.CL

En `src/middleware.ts`, agregar lógica para que cuando el host sea `opai.cl`:
- Rutas que empiecen en `/platform/` → solo accesibles desde `opai.cl`
- Rutas normales (`/`, `/blog`, `/precios`) → landing pública
- Rutas del ERP (`/(app)/`) → redirigir al login de plataforma si el host es `opai.cl`

El tenant `gard` sigue accediendo por `opai.gard.cl` (o eventualmente `gard.opai.cl`) sin cambios.

---

## RESUMEN DE KEYWORDS SEO (prioridad alta → baja)

**Tier 1 — Exactas, alta intención:**
- "ERP empresas de seguridad privada Chile"
- "software empresa de seguridad privada"
- "sistema de guardia de seguridad"
- "sistema de control de rondas"
- "gestión guardias de seguridad"

**Tier 2 — Relacionadas, volumen medio:**
- "sistema de seguridad privada"
- "control de acceso empresas seguridad"
- "portal del guardia de seguridad"
- "portal del cliente seguridad privada"
- "sistema marcación guardias"
- "payroll empresa de seguridad"
- "fiscalización DT guardias"

**Tier 3 — Long tail, alta conversión:**
- "cómo gestionar guardias de seguridad"
- "software rondas GPS guardias Chile"
- "ERP seguridad privada con IA"
- "portal cliente empresa de seguridad"
- "liquidaciones guardias de seguridad Chile"

---

*Prompt generado para Cursor/Claude Code · Proyecto OPAI · Abril 2025*
*Contexto acumulado en sesiones con Claude claude.ai · carlos.irigoyen@gmail.com*
