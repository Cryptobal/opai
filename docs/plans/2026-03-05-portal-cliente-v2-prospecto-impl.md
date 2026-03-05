# Portal del Cliente v2.0 — Modo Prospecto Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the Portal del Cliente to use a single layout for both prospect and active modes, with demo data for prospects, a guided tour, proposal acceptance flow, company data section, and CPQ integration.

**Architecture:** Single portal layout with conditional data source (demo constants vs real API). `account.status` field (already exists) discriminates mode. New Prisma models for representantes legales and personeria. Hook into existing CPQ send-email flow. Chat system extended with DIRECT channels for prospect-ejecutivo communication.

**Tech Stack:** Next.js 14 App Router, Prisma ORM, Tailwind CSS, Resend email, Pusher chat, React (client components), DM Sans font.

**Design doc:** `docs/plans/2026-03-05-portal-cliente-v2-prospecto-design.md`

---

## Phase 1: Data Layer (Models + Demo Data)

### Task 1: Add Prisma models and Account fields

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add new fields to CrmAccount**

In `prisma/schema.prisma`, find the CrmAccount model (~line 1266). Add after `portalConfig`:

```prisma
  portalEjecutivoId   String?   @map("portal_ejecutivo_id")
  portalTourShown     Boolean   @default(false) @map("portal_tour_shown")
  portalEjecutivo     User?     @relation("PortalEjecutivo", fields: [portalEjecutivoId], references: [id])
```

Note: Check if User model needs a reverse relation added. Add to User model:
```prisma
  portalProspectAccounts CrmAccount[] @relation("PortalEjecutivo")
```

**Step 2: Add AccountRepresentanteLegal model**

Add after CrmAccount model:

```prisma
model AccountRepresentanteLegal {
  id        String   @id @default(cuid())
  tenantId  String   @map("tenant_id")
  accountId String   @map("account_id") @db.Uuid
  nombre    String
  rut       String
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  account CrmAccount @relation(fields: [accountId], references: [id], onDelete: Cascade)

  @@index([accountId])
  @@map("account_representantes_legales")
  @@schema("crm")
}
```

Add relation in CrmAccount:
```prisma
  representantesLegales AccountRepresentanteLegal[]
```

**Step 3: Add AccountPersoneria model**

```prisma
model AccountPersoneria {
  id              String   @id @default(cuid())
  tenantId        String   @map("tenant_id")
  accountId       String   @unique @map("account_id") @db.Uuid
  fechaEscritura  DateTime? @map("fecha_escritura")
  tipoEscritura   String?  @map("tipo_escritura")
  notaria         String?
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  account CrmAccount @relation(fields: [accountId], references: [id], onDelete: Cascade)

  @@map("account_personerias")
  @@schema("crm")
}
```

Add relation in CrmAccount:
```prisma
  personeria AccountPersoneria?
```

**Step 4: Run migration**

```bash
npx prisma migrate dev --name add-portal-prospecto-models
```

**Step 5: Verify migration**

```bash
npx prisma generate
```

Expected: No errors, new models available in PrismaClient.

**Step 6: Commit**

```bash
git add prisma/
git commit -m "feat(portal): add Prisma models for representantes legales, personeria, and portal ejecutivo fields"
```

---

### Task 2: Create demo data constants

**Files:**
- Create: `src/lib/portal/demo-data.ts`

**Step 1: Create demo data file**

```typescript
// src/lib/portal/demo-data.ts
// Hardcoded demo data for prospect portal mode.
// Identical for all prospects. No DB storage needed.

export const DEMO_KPI = [
  { label: "CUMPLIMIENTO", value: "97.3%", sub: "+2.1% vs mes anterior", color: "#2dd4bf" },
  { label: "RONDAS HOY", value: "24/28", sub: "85.7% completado", color: "#60a5fa" },
  { label: "TRUST SCORE", value: "8.6", sub: "+0.3 este mes", color: "#a78bfa" },
  { label: "ALERTAS", value: "2", sub: "0 criticas", color: "#f97316" },
] as const;

export const DEMO_CHART_DATA = [
  92, 95, 88, 97, 94, 96, 93, 98, 91, 95,
  97, 94, 96, 99, 93, 95, 97, 92, 96, 98,
  94, 97, 95, 93, 96, 98, 97, 95, 94, 97,
];

export const DEMO_GUARDIAS_RANKING = [
  { nombre: "Roberto Munoz", score: 9.4, rondas: "98%", puntualidad: "100%", meses: 14, avatar: "RM" },
  { nombre: "Carolina Soto", score: 9.1, rondas: "96%", puntualidad: "98%", meses: 8, avatar: "CS" },
  { nombre: "Miguel Vera", score: 8.8, rondas: "94%", puntualidad: "97%", meses: 22, avatar: "MV" },
  { nombre: "Patricia Lagos", score: 8.5, rondas: "92%", puntualidad: "95%", meses: 6, avatar: "PL" },
] as const;

export const DEMO_BITACORA = [
  { fecha: "Hoy, 07:15", tipo: "Normal" as const, texto: "Cambio de turno sin novedades. Perimetro asegurado. Guardia saliente: R. Munoz." },
  { fecha: "Hoy, 03:22", tipo: "Alerta" as const, texto: "Sensor de movimiento activado en sector B3. Verificado por guardia: causa animal callejero. Sin riesgo." },
  { fecha: "Ayer, 22:40", tipo: "Normal" as const, texto: "Ronda nocturna #1 completada. 8 checkpoints verificados. Sin hallazgos." },
  { fecha: "Ayer, 18:05", tipo: "Info" as const, texto: "Visita de supervisor semanal. Evaluacion positiva. Informe adjunto." },
] as const;

export const DEMO_MODULOS = [
  { icon: "MessageSquare", name: "Chat", desc: "Comunicacion directa" },
  { icon: "Ticket", name: "Tickets", desc: "Solicitudes y soporte" },
  { icon: "FileText", name: "Documentos", desc: "Contratos y archivos" },
  { icon: "BarChart3", name: "Reportes", desc: "Informes mensuales" },
  { icon: "Bell", name: "Alertas", desc: "Notificaciones real-time" },
  { icon: "GitCompare", name: "Comparativa", desc: "Benchmarks del servicio" },
] as const;

export const DEMO_CHAT_CHANNELS = [
  { icon: "Shield", name: "Supervision Operaciones", desc: "Equipo de supervisores asignados", locked: true },
  { icon: "Users", name: "RRHH & Dotacion", desc: "Consultas sobre guardias y dotacion", locked: true },
  { icon: "DollarSign", name: "Finanzas & Facturacion", desc: "Estado de cuenta y facturas", locked: true },
  { icon: "Building2", name: "Administracion", desc: "Contratos y documentacion legal", locked: true },
] as const;

export const DEMO_GUARDIAS_INSTALACION = [
  { name: "Roberto Munoz", turno: "Turno dia", status: "En servicio", online: true },
  { name: "Carolina Soto", turno: "Turno noche", status: "Proximo turno 22:00", online: false },
] as const;

export const DEMO_PERSONAL = [
  {
    nombre: "Roberto Munoz",
    avatar: "RM",
    turno: "Turno dia (08:00 - 20:00)",
    status: "En servicio",
    online: true,
    documentos: [
      { tipo: "Certificado OS-10", status: "validated", destacado: true },
      { tipo: "Cert. antecedentes", status: "validated", destacado: true },
      { tipo: "Cedula de identidad", status: "validated", destacado: false },
      { tipo: "Curriculum", status: "validated", destacado: false },
      { tipo: "Contrato", status: "validated", destacado: false },
    ],
  },
  {
    nombre: "Carolina Soto",
    avatar: "CS",
    turno: "Turno noche (20:00 - 08:00)",
    status: "Proximo turno",
    online: false,
    documentos: [
      { tipo: "Certificado OS-10", status: "validated", destacado: true },
      { tipo: "Cert. antecedentes", status: "validated", destacado: true },
      { tipo: "Cedula de identidad", status: "validated", destacado: false },
      { tipo: "Cert. Fonasa / Isapre", status: "validated", destacado: false },
    ],
  },
  {
    nombre: "Miguel Vera",
    avatar: "MV",
    turno: "Turno dia (08:00 - 20:00)",
    status: "Dia libre",
    online: false,
    documentos: [
      { tipo: "Certificado OS-10", status: "validated", destacado: true },
      { tipo: "Cert. antecedentes", status: "pending", destacado: true },
      { tipo: "Cedula de identidad", status: "validated", destacado: false },
    ],
  },
] as const;

export const DEMO_RONDAS = [
  { hora: "06:00", guardia: "Roberto Munoz", checkpoints: 8, completados: 8, status: "completada" },
  { hora: "04:00", guardia: "Carolina Soto", checkpoints: 8, completados: 8, status: "completada" },
  { hora: "02:00", guardia: "Carolina Soto", checkpoints: 8, completados: 7, status: "completada" },
  { hora: "00:00", guardia: "Carolina Soto", checkpoints: 8, completados: 8, status: "completada" },
  { hora: "22:00", guardia: "Roberto Munoz", checkpoints: 8, completados: 8, status: "completada" },
] as const;

export const DEMO_POSTA = [
  { hora: "08:00", entrante: "Roberto Munoz", saliente: "Carolina Soto", novedades: "Sin novedades. Perimetro asegurado.", status: "completada" },
  { hora: "20:00", entrante: "Carolina Soto", saliente: "Roberto Munoz", novedades: "Puerta sector B requiere mantencion. Reportado a administracion.", status: "completada" },
] as const;

export const DEMO_INSTALACIONES = [
  {
    name: "Edificio Corporativo Central",
    address: "Av. Providencia 1234, Providencia",
    guardCount: 4,
    status: "active",
    checkpoints: 8,
    lastRonda: "Hace 45 min",
  },
] as const;

export const DEMO_SUMMARY = {
  compliance: 97.3,
  completedRounds: 24,
  totalRounds: 28,
  trustScore: 8.6,
  alerts: 2,
  criticalAlerts: 0,
} as const;

export const DEMO_ACTIVITY = [
  { type: "ronda", description: "Ronda completada - 8/8 checkpoints", time: "Hace 45 min", guard: "Roberto Munoz" },
  { type: "alerta", description: "Sensor sector B3 - verificado sin riesgo", time: "Hace 3 horas", guard: "Carolina Soto" },
  { type: "posta", description: "Cambio de turno completado sin novedades", time: "Hace 5 horas", guard: "Roberto Munoz" },
  { type: "ronda", description: "Ronda nocturna #1 - 8/8 checkpoints", time: "Hace 8 horas", guard: "Carolina Soto" },
] as const;
```

**Step 2: Commit**

```bash
git add src/lib/portal/demo-data.ts
git commit -m "feat(portal): add hardcoded demo data constants for prospect mode"
```

---

## Phase 2: Portal Navigation + Mode Detection

### Task 3: Create PreviewBadge component

**Files:**
- Create: `src/components/portal/cliente/PreviewBadge.tsx`

**Step 1: Create component**

```tsx
"use client";

export function PreviewBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border"
      style={{
        color: "#2dd4bf",
        borderColor: "rgba(45, 212, 191, 0.3)",
        backgroundColor: "rgba(45, 212, 191, 0.08)",
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
      Vista previa
    </span>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/portal/cliente/PreviewBadge.tsx
git commit -m "feat(portal): add PreviewBadge component for demo sections"
```

---

### Task 4: Update PortalClienteNav for prospect mode

**Files:**
- Modify: `src/components/portal/cliente/PortalClienteNav.tsx`

**Step 1: Read the current file**

Read `src/components/portal/cliente/PortalClienteNav.tsx` fully to understand structure.

**Step 2: Add prospect-only sections to nav items**

The nav currently has 12 items. Add 3 more for prospect mode: Personal, Propuesta, Nosotros, Empresa.

Add these to the `items` array (or create a conditional items list):

```typescript
// New sections added conditionally
const prospectOnlyItems = [
  { key: "personal", label: "Personal", icon: UserCheck, configKey: null },
  { key: "propuesta", label: "Propuesta", icon: FileCheck, configKey: null },
  { key: "nosotros", label: "Nosotros", icon: Building, configKey: null },
  { key: "empresa", label: "Empresa", icon: Briefcase, configKey: null },
];
```

Modify the component to accept `isProspect` prop and conditionally include these items in the "Mas" menu. For active mode, only include Personal and Empresa in "Mas".

The first 4 visible tabs remain: Dashboard, Instalaciones, Rondas, Posta (same for both modes).

**Step 3: Commit**

```bash
git add src/components/portal/cliente/PortalClienteNav.tsx
git commit -m "feat(portal): add prospect-specific nav items (Personal, Propuesta, Nosotros, Empresa)"
```

---

### Task 5: Update PortalClienteClient for mode detection

**Files:**
- Modify: `src/app/portal/cliente/PortalClienteClient.tsx`

**Step 1: Read the full file**

Read `src/app/portal/cliente/PortalClienteClient.tsx`.

**Step 2: Add new section types**

Add to the PortalSection type union:
```typescript
type PortalSection = ... | "personal" | "propuesta" | "nosotros" | "empresa";
```

**Step 3: Pass isProspect to PortalClienteNav**

The session already has `isProspect`. Pass it:
```tsx
<PortalClienteNav
  active={section}
  onNavigate={setSection}
  isProspect={session.isProspect}
  portalConfig={session.portalConfig}
/>
```

**Step 4: Add section rendering for new tabs**

In the section rendering switch/conditional:
```tsx
{section === "personal" && <PortalPersonal session={session} />}
{section === "propuesta" && <PortalPropuesta session={session} />}
{section === "nosotros" && <PortalNosotros />}
{section === "empresa" && <PortalEmpresa session={session} />}
```

**Step 5: Remove PortalDemoOverlay usage**

Remove the `<PortalDemoOverlay>` component rendering. It's being replaced by PreviewBadge on individual sections.

**Step 6: Add Tour button to header**

Add a "Tour" button in the header (visible after tour has been shown/skipped):
```tsx
{session.isProspect && (
  <button onClick={() => setShowTour(true)} className="text-xs text-teal-400 border border-teal-400/30 rounded px-2 py-1">
    Tour
  </button>
)}
```

**Step 7: Commit**

```bash
git add src/app/portal/cliente/PortalClienteClient.tsx
git commit -m "feat(portal): add prospect mode detection, new sections, remove demo overlay"
```

---

## Phase 3: Dashboard with Cotizaciones Cards (Prospect)

### Task 6: Modify PortalDashboard to support prospect mode

**Files:**
- Modify: `src/components/portal/cliente/PortalDashboard.tsx`
- Create: `src/components/portal/cliente/ProspectCotizacionCarousel.tsx`

**Step 1: Read PortalDashboard.tsx fully**

**Step 2: Add prospect mode logic**

The dashboard currently fetches from APIs. When `isProspect`, use demo data constants instead:

```typescript
import { DEMO_SUMMARY, DEMO_CHART_DATA, DEMO_GUARDIAS_RANKING, DEMO_BITACORA, DEMO_ACTIVITY } from "@/lib/portal/demo-data";

// In the component:
const isProspect = props.isProspect;

useEffect(() => {
  if (isProspect) {
    setSummary({
      compliance: DEMO_SUMMARY.compliance,
      completedRounds: DEMO_SUMMARY.completedRounds,
      totalRounds: DEMO_SUMMARY.totalRounds,
      trustScore: DEMO_SUMMARY.trustScore,
      alerts: DEMO_SUMMARY.alerts,
      criticalAlerts: DEMO_SUMMARY.criticalAlerts,
    });
    // ... set other demo data
    setLoadingData(false);
    return;
  }
  // existing API fetch logic
}, [isProspect]);
```

Add `<PreviewBadge />` next to each KPI section title when `isProspect`.

**Step 3: Create ProspectCotizacionCarousel component**

```tsx
// src/components/portal/cliente/ProspectCotizacionCarousel.tsx
"use client";

import { useState, useRef } from "react";
import type { ClienteSession } from "@/lib/portal-cliente-types";

interface Quote {
  id: string;
  code: string;
  status: string;
  monthlyCost: number;
  totalPositions: number;
  totalGuards: number;
  dealTitle: string;
}

interface Props {
  session: ClienteSession;
  onViewDetail: () => void; // navigate to Propuesta tab
}

export function ProspectCotizacionCarousel({ session, onViewDetail }: Props) {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch real cotizaciones from API
  useEffect(() => {
    fetch("/api/portal/cliente/cotizaciones")
      .then(r => r.json())
      .then(data => { setQuotes(data.quotes || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="animate-pulse h-32 rounded-xl bg-zinc-800/50" />;
  if (quotes.length === 0) return null;

  return (
    <div className="mb-6">
      {/* Banner */}
      <div className="flex items-center gap-2 mb-3 px-1">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-teal-400" />
        </span>
        <span className="text-sm font-medium text-white">
          Tienes {quotes.length} cotizaci{quotes.length === 1 ? "on" : "ones"} pendiente{quotes.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Mobile: Carousel */}
      <div className="md:hidden">
        <div ref={scrollRef} className="flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-2">
          {quotes.map((q, i) => (
            <CotizacionCard key={q.id} quote={q} onViewDetail={onViewDetail} />
          ))}
        </div>
        {/* Dots */}
        {quotes.length > 1 && (
          <div className="flex justify-center gap-1.5 mt-2">
            {quotes.map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i === current ? "w-4 bg-teal-400" : "w-1.5 bg-zinc-600"}`} />
            ))}
          </div>
        )}
      </div>

      {/* Desktop: Grid */}
      <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        {quotes.map(q => (
          <CotizacionCard key={q.id} quote={q} onViewDetail={onViewDetail} />
        ))}
      </div>
    </div>
  );
}

function CotizacionCard({ quote, onViewDetail }: { quote: Quote; onViewDetail: () => void }) {
  return (
    <div className="min-w-[280px] snap-center rounded-xl p-4 border transition-all hover:-translate-y-0.5"
      style={{
        background: "linear-gradient(145deg, #1E293B, #1A2332)",
        borderColor: "rgba(255,255,255,0.06)",
      }}
    >
      <div className="flex justify-between items-start mb-2">
        <span className="text-xs text-zinc-400">{quote.code}</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400">Pendiente</span>
      </div>
      <div className="text-lg font-bold text-white mb-1">
        {quote.monthlyCost?.toLocaleString("es-CL")} UF/mes
      </div>
      <div className="text-xs text-zinc-400 mb-3">
        {quote.totalPositions} puestos · {quote.totalGuards} guardias
      </div>
      <div className="flex gap-2">
        <button
          onClick={onViewDetail}
          className="flex-1 text-xs font-medium py-2 rounded-lg text-center"
          style={{ background: "linear-gradient(135deg, #2dd4bf, #14b8a6)", color: "#042F2E" }}
        >
          Ver propuesta
        </button>
        <button className="text-xs text-teal-400 border border-teal-400/30 rounded-lg px-3 py-2">
          Consultar
        </button>
      </div>
    </div>
  );
}
```

**Step 4: Insert carousel at top of Dashboard when prospect**

In PortalDashboard, before KPIs section:
```tsx
{isProspect && (
  <ProspectCotizacionCarousel
    session={session}
    onViewDetail={() => onNavigate("propuesta")}
  />
)}
```

**Step 5: Commit**

```bash
git add src/components/portal/cliente/ProspectCotizacionCarousel.tsx src/components/portal/cliente/PortalDashboard.tsx
git commit -m "feat(portal): add cotizacion carousel to prospect dashboard with demo KPIs"
```

---

## Phase 4: New Sections (Propuesta, Nosotros, Empresa, Personal)

### Task 7: Create PortalPropuesta component

**Files:**
- Create: `src/components/portal/cliente/PortalPropuesta.tsx`

**Step 1: Create the component**

This component shows all deals with their quotations. It reuses the existing `/api/portal/cliente/cotizaciones` endpoint for data, and adds "Aceptar propuesta" flow with the accept logic.

Key functionality:
- Fetch quotes grouped by deal
- Each deal section shows active quote highlighted, older quotes collapsed
- "Descargar PDF" button (hits existing CPQ PDF generation or a new route)
- "Aceptar propuesta" button → confirmation modal → POST to new endpoint
- "Consultar" button → navigates to chat

The accept endpoint will be at `/api/portal/cliente/cotizaciones/[id]/accept-proposal` and handles:
1. Approve the quote (existing flow)
2. Set deal stage to "Ganado"
3. Set account status to "client_active"
4. Create chat channels
5. Send email to comercial@gard.cl

**Step 2: Create the accept-proposal API route**

Create: `src/app/api/portal/cliente/cotizaciones/[id]/accept-proposal/route.ts`

This route orchestrates the full transition:
```typescript
// 1. Approve quote (reuse existing logic from approve route)
// 2. Find the "Ganado" stage in the pipeline
// 3. Update deal: stageId = ganadoStage.id, status = "closed"
// 4. Update account: status = "client_active"
// 5. Create ChatChannel (type: INSTALLATION) for each installation
// 6. Create ChatChannel (type: GROUP, internal) for each installation
// 7. Send email to comercial@gard.cl via Resend
// 8. Return success
```

**Step 3: Commit**

```bash
git add src/components/portal/cliente/PortalPropuesta.tsx src/app/api/portal/cliente/cotizaciones/\[id\]/accept-proposal/
git commit -m "feat(portal): add Propuesta tab with full accept-proposal flow"
```

---

### Task 8: Create PortalNosotros component

**Files:**
- Create: `src/components/portal/cliente/PortalNosotros.tsx`

**Step 1: Create static showroom component**

Static content, no API calls. Gard Security institutional information:
- Hero with logo and tagline
- Key figures (anos experiencia, clientes, guardias, retencion)
- Differentiators (OPAI, gamification, portal, response time)
- Certifications (OS-10, D.S. 44, ISO 45001, ACHS)

Style: dark cards with teal accents matching the portal design system.

**Step 2: Commit**

```bash
git add src/components/portal/cliente/PortalNosotros.tsx
git commit -m "feat(portal): add Nosotros institutional showroom tab"
```

---

### Task 9: Create PortalEmpresa component

**Files:**
- Create: `src/components/portal/cliente/PortalEmpresa.tsx`
- Create: `src/app/api/portal/cliente/empresa/route.ts`
- Create: `src/app/api/portal/cliente/empresa/representantes/route.ts`
- Create: `src/app/api/portal/cliente/empresa/personeria/route.ts`

**Step 1: Create API routes**

**GET/PUT `/api/portal/cliente/empresa`:**
- GET: Returns account data (razonSocial, rut, address), contacts, installations, representantes legales, personeria
- PUT: Updates account fields, syncs to CRM

**GET/POST/DELETE `/api/portal/cliente/empresa/representantes`:**
- GET: List representantes for account
- POST: Add new representante (nombre, rut)
- DELETE: Remove representante by id

**GET/PUT `/api/portal/cliente/empresa/personeria`:**
- GET: Get personeria for account
- PUT: Create or update personeria

**Step 2: Create PortalEmpresa component**

Sections:
1. **Datos de la empresa** — razon social, RUT empresa, direccion (editable inputs)
2. **Representantes legales** — list with add/remove buttons
3. **Personeria** — fecha escritura, tipo (select), notaria
4. **Contactos** — list of contacts with nombre, email, cargo (editable)
5. **Instalaciones** — nombre and ubicacion (editable)

All fields auto-save on blur or have explicit "Guardar" button per section.

**Step 3: Commit**

```bash
git add src/components/portal/cliente/PortalEmpresa.tsx src/app/api/portal/cliente/empresa/
git commit -m "feat(portal): add Empresa tab with editable company data synced to CRM"
```

---

### Task 10: Create PortalPersonal component

**Files:**
- Create: `src/components/portal/cliente/PortalPersonal.tsx`
- Create: `src/app/api/portal/cliente/personal/route.ts`

**Step 1: Create API route**

**GET `/api/portal/cliente/personal`:**
- If prospect: return demo data from constants
- If active: query OpsGuardia with OpsDocumentoPersona for guards assigned to client's installations
- Return: guard name, avatar, turno, status, documents list (tipo, status, fileUrl)

**Step 2: Create PortalPersonal component**

- List of guard cards (expandable)
- Each card shows: name, avatar initials, turno, online status
- Expanded view: documents list with OS-10 and antecedentes highlighted at top
- Each document with "Ver" button to view/download (links to fileUrl)
- If prospect: PreviewBadge + explanation text
- If active: real data from API

**Step 3: Commit**

```bash
git add src/components/portal/cliente/PortalPersonal.tsx src/app/api/portal/cliente/personal/
git commit -m "feat(portal): add Personal tab with guard documents (OS-10, antecedentes)"
```

---

## Phase 5: Tour Guiado

### Task 11: Create Tour component

**Files:**
- Create: `src/components/portal/cliente/tour/TourOverlay.tsx`
- Create: `src/components/portal/cliente/tour/tour-steps.ts`

**Step 1: Create tour steps data**

```typescript
// src/components/portal/cliente/tour/tour-steps.ts
export const TOUR_STEPS_PROSPECT = [
  {
    title: "Bienvenido a tu portal",
    icon: "Layout",
    content: "Este es tu centro de control personalizado. Desde aqui podras monitorear en tiempo real, gestionar cotizaciones y comunicarte con tu equipo Gard.",
  },
  {
    title: "Tus cotizaciones",
    icon: "FileCheck",
    content: "Revisa tus propuestas activas. Puedes comparar, consultar y aceptar sin intermediarios, todo desde aqui.",
  },
  {
    title: "Dashboard operacional",
    icon: "BarChart3",
    content: "KPIs en tiempo real: cumplimiento, rondas, trust score, alertas. Cuando estes activo, estos seran datos reales de tu instalacion.",
  },
  {
    title: "Gamificacion de guardias",
    icon: "Trophy",
    content: "Scorecard individual por guardia: puntualidad, rondas, presentacion, desempeno. Ranking mensual con premios para los mejores.",
  },
  {
    title: "Bitacora digital",
    icon: "BookOpen",
    content: "Registro digital de novedades: cambios de turno, incidentes, hallazgos. Con hora exacta y responsable identificado.",
  },
  {
    title: "Chat directo",
    icon: "MessageSquare",
    content: "Comunicacion directa con tu ejecutivo, guardias en instalacion y equipo Gard: operaciones, RRHH, finanzas, administracion.",
  },
  {
    title: "Sistema de tickets",
    icon: "Ticket",
    content: "Solicitudes con SLA garantizado. Cambios de guardia, reportes especiales, consultas. Trazabilidad completa.",
  },
  {
    title: "Reportes mensuales",
    icon: "FileBarChart",
    content: "Informes automaticos con metricas, evaluacion de guardias, y recomendaciones. Descargables en PDF.",
  },
  {
    title: "Datos de muestra",
    icon: "Info",
    content: "Lo que ves ahora son datos de demostracion. Cuando contrates, se reemplazaran por datos reales actualizados en tiempo real.",
  },
  {
    title: "Comienza ahora",
    icon: "Rocket",
    content: "Explora el portal, revisa tus cotizaciones y contacta a tu ejecutivo. Este sera tu herramienta diaria para gestionar la seguridad de tu operacion.",
  },
] as const;
```

**Step 2: Create TourOverlay component**

```tsx
// src/components/portal/cliente/tour/TourOverlay.tsx
"use client";

import { useState } from "react";
import { TOUR_STEPS_PROSPECT } from "./tour-steps";
// Import lucide icons dynamically or use a map

interface Props {
  onComplete: () => void;
}

export function TourOverlay({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const steps = TOUR_STEPS_PROSPECT;
  const current = steps[step];

  const next = () => step < steps.length - 1 ? setStep(step + 1) : onComplete();
  const prev = () => step > 0 && setStep(step - 1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
    >
      <div className="w-[90vw] max-w-md rounded-2xl p-6 mx-4"
        style={{
          background: "linear-gradient(145deg, #1E293B, #1A2332)",
          boxShadow: "0 0 40px rgba(45, 212, 191, 0.15)",
          animation: "slideUp 0.3s ease-out",
        }}
      >
        {/* Progress bar */}
        <div className="flex gap-1 mb-6">
          {steps.map((_, i) => (
            <div key={i} className="h-1 flex-1 rounded-full transition-colors"
              style={{ backgroundColor: i <= step ? "#2dd4bf" : "rgba(255,255,255,0.1)" }}
            />
          ))}
        </div>

        {/* Icon */}
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 mx-auto"
          style={{
            background: "linear-gradient(135deg, rgba(45,212,191,0.2), rgba(45,212,191,0.05))",
            animation: "bounceIn 0.5s ease-out",
          }}
        >
          {/* Render icon based on current.icon */}
        </div>

        {/* Content */}
        <h3 className="text-xl font-bold text-white text-center mb-2">{current.title}</h3>
        <p className="text-sm text-zinc-400 text-center mb-6 leading-relaxed">{current.content}</p>

        {/* Step counter */}
        <p className="text-xs text-zinc-500 text-center mb-4">{step + 1} de {steps.length}</p>

        {/* Navigation */}
        <div className="flex gap-2">
          {step > 0 && (
            <button onClick={prev} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-zinc-400 border border-zinc-700">
              Atras
            </button>
          )}
          <button onClick={next} className="flex-1 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: "linear-gradient(135deg, #2dd4bf, #14b8a6)", color: "#042F2E" }}
          >
            {step === steps.length - 1 ? "Comenzar" : "Siguiente"}
          </button>
        </div>

        {/* Skip */}
        <button onClick={onComplete} className="w-full mt-3 text-xs text-zinc-500 py-1">
          Saltar tour
        </button>
      </div>
    </div>
  );
}
```

**Step 3: Integrate in PortalClienteClient**

Add state and auto-trigger logic:
```tsx
const [showTour, setShowTour] = useState(false);

useEffect(() => {
  if (session?.isProspect && !session?.portalTourShown) {
    const timer = setTimeout(() => setShowTour(true), 1200);
    return () => clearTimeout(timer);
  }
}, [session]);

const handleTourComplete = async () => {
  setShowTour(false);
  await fetch("/api/portal/cliente/tour", { method: "POST" });
};
```

Create: `src/app/api/portal/cliente/tour/route.ts` — POST to set `portalTourShown = true` on the account.

**Step 4: Add CSS animations**

Add to the portal layout or a global CSS file:
```css
@keyframes slideUp {
  from { transform: translateY(16px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
@keyframes bounceIn {
  0% { transform: scale(0.3); opacity: 0; }
  50% { transform: scale(1.05); }
  70% { transform: scale(0.95); }
  100% { transform: scale(1); opacity: 1; }
}
```

**Step 5: Commit**

```bash
git add src/components/portal/cliente/tour/ src/app/api/portal/cliente/tour/
git commit -m "feat(portal): add 10-step guided tour with auto-trigger for prospects"
```

---

## Phase 6: CPQ Integration — "Enviar por Portal"

### Task 12: Add "Enviar por Portal del Cliente" to CPQ

**Files:**
- Modify: `src/app/api/cpq/quotes/[id]/send-email/route.ts`
- Create: `src/app/api/cpq/quotes/[id]/send-portal/route.ts`

**Step 1: Read the existing send-email route**

Read `src/app/api/cpq/quotes/[id]/send-email/route.ts` fully.

**Step 2: Create send-portal route**

Create `src/app/api/cpq/quotes/[id]/send-portal/route.ts`:

This route does everything send-email does PLUS:
1. Sets account.status = "prospect" (if not already active)
2. Sets account.portalEjecutivoId = current user id
3. If contact doesn't have portalPin → generate 6-digit PIN, hash with bcrypt, set portalEnabled = true
4. Creates DIRECT ChatChannel between ejecutivo and contact (if not exists)
5. Sends email with RUT + PIN + portal link (in addition to the proposal)
6. Updates quote status to "sent"

```typescript
// Key logic:
import bcrypt from "bcryptjs";

// Generate PIN
const pin = String(Math.floor(100000 + Math.random() * 900000));
const pinHash = await bcrypt.hash(pin, 10);

// Update contact
await prisma.crmContact.update({
  where: { id: contact.id },
  data: {
    portalPin: pinHash,
    portalPinVisible: pin, // stored for admin reference
    portalEnabled: true,
  },
});

// Update account
await prisma.crmAccount.update({
  where: { id: account.id },
  data: {
    status: account.status === "client_active" ? "client_active" : "prospect",
    portalEjecutivoId: currentUserId,
  },
});

// Create direct chat channel
const existingChannel = await prisma.chatChannel.findFirst({
  where: {
    tenantId,
    channelType: "DIRECT",
    dmParticipants: { some: { adminId: currentUserId } },
    // Also check contact is participant via messages or a separate check
  },
});

if (!existingChannel) {
  await prisma.chatChannel.create({
    data: {
      tenantId,
      channelType: "DIRECT",
      name: `${contact.firstName} ${contact.lastName} - ${currentUserName}`,
      dmParticipants: { create: { adminId: currentUserId } },
    },
  });
}
```

**Step 3: Find and update the CPQ UI component**

Find the CPQ quote detail page that has the "Enviar cotizacion" button. Add a new button next to it: "Enviar por Portal del Cliente".

Search for the component that renders the "Enviar cotizacion" button (likely in the CRM cotizaciones page, step 5).

**Step 4: Commit**

```bash
git add src/app/api/cpq/quotes/\[id\]/send-portal/ src/app/\(app\)/crm/cotizaciones/
git commit -m "feat(cpq): add 'Enviar por Portal del Cliente' flow with auto prospect account creation"
```

---

## Phase 7: Chat Integration (Prospect)

### Task 13: Update chat for prospect mode

**Files:**
- Modify: `src/app/api/portal/cliente/chat/channels/route.ts`
- Modify: chat-related portal components

**Step 1: Read current chat channels route**

Read `src/app/api/portal/cliente/chat/channels/route.ts`.

**Step 2: Update channels route for prospect**

When the account is a prospect:
- Return the DIRECT channel with the ejecutivo as the active/real channel
- Return DEMO_CHAT_CHANNELS as locked channels (no DB query needed, just append to response)

```typescript
if (account.status === "prospect") {
  // Get DIRECT channel with ejecutivo
  const directChannel = await prisma.chatChannel.findFirst({
    where: {
      tenantId,
      channelType: "DIRECT",
      dmParticipants: { some: { adminId: account.portalEjecutivoId } },
    },
  });

  return NextResponse.json({
    channels: directChannel ? [{ ...directChannel, isReal: true }] : [],
    lockedChannels: DEMO_CHAT_CHANNELS,
  });
}
```

**Step 3: Update chat UI component**

Find the portal chat component and modify it to show locked channels with a padlock icon and "Disponible cuando estes activo" message when in prospect mode.

**Step 4: Commit**

```bash
git add src/app/api/portal/cliente/chat/ src/components/portal/cliente/
git commit -m "feat(portal): update chat for prospect mode with real ejecutivo channel + locked demo channels"
```

---

## Phase 8: Existing Sections — Demo Data Mode

### Task 14: Add demo data fallback to existing portal sections

**Files:**
- Modify: `src/components/portal/cliente/PortalRondas.tsx`
- Modify: `src/components/portal/cliente/PortalPosta.tsx`
- Modify: `src/components/portal/cliente/PortalInstallations.tsx`
- Modify: `src/components/portal/cliente/PortalTickets.tsx`
- Modify: `src/components/portal/cliente/PortalReportes.tsx`
- Modify: `src/components/portal/cliente/PortalComparativa.tsx`
- Modify: `src/components/portal/cliente/PortalAlertas.tsx`

**Step 1: For each component, add isProspect prop**

Pattern for each component:
```tsx
// At the top of each component
const isProspect = props.isProspect;

// In the data fetching useEffect:
if (isProspect) {
  // Use demo data from constants
  setData(DEMO_XXX);
  setLoading(false);
  return;
}
// ... existing API fetch
```

Add `<PreviewBadge />` to the header of each section when `isProspect`.

**Step 2: Pass isProspect from PortalClienteClient to each section**

Update each section's rendering in PortalClienteClient to pass `isProspect={session.isProspect}`.

**Step 3: Commit per section or batch**

```bash
git add src/components/portal/cliente/
git commit -m "feat(portal): add demo data fallback to all existing sections for prospect mode"
```

---

## Phase 9: Email Template for Portal Invitation

### Task 15: Create portal invitation email

**Files:**
- Create: `src/emails/PortalProspectoInviteEmail.tsx`

**Step 1: Create React Email template**

```tsx
// Using @react-email/components
import { Html, Head, Body, Container, Text, Button, Img, Hr } from "@react-email/components";

interface Props {
  contactName: string;
  companyName: string;
  rut: string;
  pin: string;
  portalUrl: string;
  ejecutivoName: string;
}

export function PortalProspectoInviteEmail({ contactName, companyName, rut, pin, portalUrl, ejecutivoName }: Props) {
  return (
    <Html>
      <Head />
      <Body style={{ backgroundColor: "#0b1120", fontFamily: "DM Sans, sans-serif" }}>
        <Container style={{ maxWidth: 480, margin: "0 auto", padding: 24 }}>
          {/* Gard logo */}
          <Img src="https://opai.gard.cl/gard-logo.png" width={120} alt="Gard Security" />
          <Text style={{ color: "#f0fdf4", fontSize: 20, fontWeight: 700 }}>
            Hola {contactName},
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 14 }}>
            {ejecutivoName} de Gard Security te ha enviado una propuesta comercial.
            Accede a tu portal para revisarla, ver una vista previa del servicio y chatear directamente.
          </Text>
          <Hr style={{ borderColor: "rgba(255,255,255,0.1)" }} />
          <Text style={{ color: "#2dd4bf", fontSize: 14, fontWeight: 600 }}>Tus datos de acceso:</Text>
          <Text style={{ color: "#f0fdf4", fontSize: 14 }}>
            RUT empresa: <strong>{rut}</strong><br />
            PIN: <strong>{pin}</strong>
          </Text>
          <Button href={portalUrl}
            style={{ backgroundColor: "#2dd4bf", color: "#042F2E", padding: "12px 24px", borderRadius: 10, fontWeight: 600, fontSize: 14 }}
          >
            Acceder al portal
          </Button>
        </Container>
      </Body>
    </Html>
  );
}
```

**Step 2: Commit**

```bash
git add src/emails/PortalProspectoInviteEmail.tsx
git commit -m "feat(portal): add prospect portal invitation email template"
```

---

## Phase 10: Session + Auth Updates

### Task 16: Update auth to include new session fields

**Files:**
- Modify: `src/lib/portal-cliente.ts`
- Modify: `src/lib/portal-cliente-types.ts`
- Modify: `src/app/api/portal/cliente/auth/route.ts`

**Step 1: Update ClienteSession type**

Add to `ClienteSession` in types file:
```typescript
portalTourShown: boolean;
ejecutivoId: string | null;
ejecutivoName: string | null;
```

**Step 2: Update validateClienteSession**

In `portal-cliente.ts`, include the new fields in the session:
```typescript
// After existing account query, also fetch:
const ejecutivo = account.portalEjecutivoId
  ? await prisma.user.findUnique({ where: { id: account.portalEjecutivoId }, select: { id: true, name: true } })
  : null;

// Add to returned session:
portalTourShown: account.portalTourShown ?? false,
ejecutivoId: ejecutivo?.id ?? null,
ejecutivoName: ejecutivo?.name ?? null,
```

**Step 3: Commit**

```bash
git add src/lib/portal-cliente.ts src/lib/portal-cliente-types.ts src/app/api/portal/cliente/auth/route.ts
git commit -m "feat(portal): include portalTourShown and ejecutivo info in client session"
```

---

## Phase 11: Accept Proposal — Full Transition Flow

### Task 17: Implement accept-proposal endpoint

**Files:**
- Create: `src/app/api/portal/cliente/cotizaciones/[id]/accept-proposal/route.ts`

**Step 1: Implement the full transition**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parsePortalClienteSessionCookie } from "@/lib/portal-cliente";
import { resend } from "@/lib/resend";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = parsePortalClienteSessionCookie(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const quoteId = params.id;

  // 1. Find quote with deal
  const quote = await prisma.cpqQuote.findUnique({
    where: { id: quoteId },
    include: { deal: true, installation: true },
  });
  if (!quote) return NextResponse.json({ error: "Cotizacion no encontrada" }, { status: 404 });

  // 2. Find "Ganado" stage
  const ganadoStage = await prisma.crmPipelineStage.findFirst({
    where: { tenantId: session.tenantId, name: { contains: "Ganad", mode: "insensitive" } },
  });
  if (!ganadoStage) return NextResponse.json({ error: "Etapa Ganado no configurada" }, { status: 500 });

  // 3. Update deal
  if (quote.dealId) {
    await prisma.crmDeal.update({
      where: { id: quote.dealId },
      data: { stageId: ganadoStage.id, status: "closed" },
    });
  }

  // 4. Update quote
  await prisma.cpqQuote.update({
    where: { id: quoteId },
    data: { status: "approved" },
  });

  // 5. Update account to active
  await prisma.crmAccount.update({
    where: { id: session.accountId },
    data: { status: "client_active", isActive: true },
  });

  // 6. Create installation chat channels
  const installations = await prisma.crmInstallation.findMany({
    where: { accountId: session.accountId, isActive: true },
  });

  for (const inst of installations) {
    // Public channel (client + guards + Gard)
    const existing = await prisma.chatChannel.findUnique({
      where: { installationId: inst.id },
    });
    if (!existing) {
      await prisma.chatChannel.create({
        data: {
          tenantId: session.tenantId,
          channelType: "INSTALLATION",
          installationId: inst.id,
          name: inst.name,
        },
      });
    }

    // Internal channel (Gard only)
    await prisma.chatChannel.create({
      data: {
        tenantId: session.tenantId,
        channelType: "GROUP",
        groupId: `internal-${inst.id}`,
        name: `${inst.name} (Interno)`,
      },
    });
  }

  // 7. Send email to comercial@gard.cl
  const account = await prisma.crmAccount.findUnique({ where: { id: session.accountId } });
  await resend.emails.send({
    from: "OPAI <opai@gard.cl>",
    to: "comercial@gard.cl",
    subject: `Propuesta aceptada: ${account?.name} - ${quote.code}`,
    html: `<p>El cliente <strong>${account?.name}</strong> ha aceptado la propuesta <strong>${quote.code}</strong> desde el Portal del Cliente.</p>
           <p>Monto: ${quote.monthlyCost} ${quote.currency}/mes</p>
           <p>Puestos: ${quote.totalPositions} | Guardias: ${quote.totalGuards}</p>`,
  });

  // 8. Audit log
  await prisma.portalClienteAuditLog.create({
    data: {
      tenantId: session.tenantId,
      contactId: session.contactId,
      action: "ACCEPT_PROPOSAL",
      resource: `quote:${quoteId}`,
      metadata: { quoteCode: quote.code, dealId: quote.dealId },
      ip: req.headers.get("x-forwarded-for") || "unknown",
    },
  });

  return NextResponse.json({ success: true });
}
```

**Step 2: Commit**

```bash
git add src/app/api/portal/cliente/cotizaciones/\[id\]/accept-proposal/
git commit -m "feat(portal): implement accept-proposal endpoint with full prospect-to-active transition"
```

---

## Phase 12: Build + Verify

### Task 18: Build verification and cleanup

**Step 1: Run TypeScript check**

```bash
npx tsc --noEmit
```

Fix any type errors.

**Step 2: Run build**

```bash
npm run build
```

Fix any build errors.

**Step 3: Manual verification checklist**

- [ ] Login as prospect → see dashboard with cotizacion carousel + demo KPIs
- [ ] Tour auto-triggers after 1.2s on first login
- [ ] Tour can be replayed from header button
- [ ] All tabs show demo data with PreviewBadge
- [ ] Propuesta tab shows real cotizaciones from CRM
- [ ] "Aceptar propuesta" transitions to active mode
- [ ] Empresa tab shows editable company data
- [ ] Personal tab shows guard documents (demo for prospect)
- [ ] Chat shows real channel with ejecutivo, locked demo channels
- [ ] Nosotros shows institutional content
- [ ] CPQ has "Enviar por Portal" button that creates prospect account

**Step 4: Final commit**

```bash
git add .
git commit -m "feat(portal): Portal del Cliente v2.0 - Modo Prospecto complete"
```

---

## Task Dependency Graph

```
Task 1 (Prisma models) ──┐
Task 2 (Demo data)  ─────┤
                          ├──> Task 5 (Mode detection) ──> Task 6 (Dashboard)
Task 3 (PreviewBadge) ───┤                              ├──> Task 7 (Propuesta)
Task 4 (Nav update) ─────┘                              ├──> Task 8 (Nosotros)
                                                        ├──> Task 9 (Empresa)
                                                        ├──> Task 10 (Personal)
                                                        ├──> Task 14 (Demo fallback)
Task 11 (Tour) ──────────────────────────────────────────┘
Task 12 (CPQ integration) ─── independent
Task 13 (Chat prospect) ───── depends on Task 5
Task 15 (Email template) ───── independent
Task 16 (Auth/session) ─────── depends on Task 1
Task 17 (Accept flow) ──────── depends on Tasks 7, 13, 16
Task 18 (Build/verify) ─────── depends on all
```

**Parallelizable groups:**
- Tasks 1, 2, 3, 15 (no dependencies)
- Tasks 4, 5, 16 (after Task 1)
- Tasks 6-11, 12, 13, 14 (after Task 5)
- Task 17 (after Tasks 7, 13, 16)
- Task 18 (last)
