# Welcome Screen + Capacitor Setup — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a welcome screen at `/welcome` as the entry point for all OPAI portals, a branding configuration system, and Capacitor setup for native mobile apps.

**Architecture:** Extend the existing Settings KV store with branding keys, expose them via a public API for the unauthenticated welcome screen, and add a new "Imagen Corporativa" tab to the empresa config UI. The welcome screen is a client component using framer-motion for animations. Capacitor wraps the production web app in a native shell.

**Tech Stack:** Next.js 15 App Router, React 18, Tailwind CSS, shadcn/ui, framer-motion, Cloudflare R2, Capacitor 6

---

## Task 1: Extend TenantCompanyConfig with Branding Fields

**Files:**
- Modify: `src/lib/tenant-config.ts`

**Step 1: Add branding fields to the TenantCompanyConfig interface**

Add after `logoUrl: string;` (line 34):

```typescript
  /* Branding / Imagen Corporativa */
  brandingLogoFull: string;      // Logo completo horizontal
  brandingLogoIcon: string;      // Ícono/isotipo
  brandingLogoWhite: string;     // Logo para fondos oscuros
  brandingLogoDark: string;      // Logo para fondos claros
  brandingFavicon: string;       // Favicon URL
  brandingPrimaryColor: string;  // Color principal (#0a1628)
  brandingSecondaryColor: string;// Color secundario (#0d9488)
  brandingAccentColor: string;   // Color accent (#2dd4bf)
  brandingAppName: string;       // Nombre de la app ("OPAI")
  brandingTagline: string;       // Subtítulo ("Plataforma de Operaciones")
```

**Step 2: Add defaults**

Add after `logoUrl: "",` (line 69):

```typescript
  brandingLogoFull: "",
  brandingLogoIcon: "",
  brandingLogoWhite: "",
  brandingLogoDark: "",
  brandingFavicon: "",
  brandingPrimaryColor: "#0a1628",
  brandingSecondaryColor: "#0d9488",
  brandingAccentColor: "#2dd4bf",
  brandingAppName: "OPAI",
  brandingTagline: "Plataforma de Operaciones",
```

**Step 3: Add KEY_MAP entries**

Add after `"empresa.logoUrl": "logoUrl",` (line 106):

```typescript
  "empresa.branding.logoFull": "brandingLogoFull",
  "empresa.branding.logoIcon": "brandingLogoIcon",
  "empresa.branding.logoWhite": "brandingLogoWhite",
  "empresa.branding.logoDark": "brandingLogoDark",
  "empresa.branding.favicon": "brandingFavicon",
  "empresa.branding.primaryColor": "brandingPrimaryColor",
  "empresa.branding.secondaryColor": "brandingSecondaryColor",
  "empresa.branding.accentColor": "brandingAccentColor",
  "empresa.branding.appName": "brandingAppName",
  "empresa.branding.tagline": "brandingTagline",
```

**Step 4: Verify the dev server compiles**

Run: `npx next build --no-lint 2>&1 | tail -5` (or just check that `npm run dev:watch` has no TS errors)

**Step 5: Commit**

```bash
git add src/lib/tenant-config.ts
git commit -m "feat(branding): add branding fields to TenantCompanyConfig"
```

---

## Task 2: Add Branding Keys to Empresa API

**Files:**
- Modify: `src/app/api/configuracion/empresa/route.ts` (lines 7-33)

**Step 1: Add branding keys to EMPRESA_KEYS array**

Add after `"empresa.whatsappLink",` (line 32):

```typescript
  // Branding / Imagen corporativa
  "empresa.branding.logoFull",
  "empresa.branding.logoIcon",
  "empresa.branding.logoWhite",
  "empresa.branding.logoDark",
  "empresa.branding.favicon",
  "empresa.branding.primaryColor",
  "empresa.branding.secondaryColor",
  "empresa.branding.accentColor",
  "empresa.branding.appName",
  "empresa.branding.tagline",
```

**Step 2: Verify — no other changes needed**

The GET and PATCH handlers already iterate `EMPRESA_KEYS` generically. Adding keys to the array is sufficient.

**Step 3: Commit**

```bash
git add src/app/api/configuracion/empresa/route.ts
git commit -m "feat(branding): add branding keys to empresa API whitelist"
```

---

## Task 3: Create Branding Image Upload API

**Files:**
- Create: `src/app/api/configuracion/branding/upload/route.ts`

**Step 1: Create the upload route**

This route accepts FormData with an image file, uploads to R2 with prefix `branding`, returns the public URL. Auth required (owner/admin only).

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { uploadFile } from "@/lib/storage";

const MAX_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "image/x-icon",
  "image/vnd.microsoft.icon",
];

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    if (!["owner", "admin"].includes(ctx.userRole ?? "")) {
      return NextResponse.json(
        { success: false, error: "Solo administradores pueden subir assets de branding" },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json(
        { success: false, error: "No se proporcionó archivo" },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: "Tipo de archivo no permitido. Use PNG, JPG, WebP, SVG o ICO." },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { success: false, error: "El archivo excede el límite de 2MB" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadFile(buffer, file.name, file.type, "branding");

    return NextResponse.json({
      success: true,
      data: { url: result.publicUrl, storageKey: result.storageKey },
    });
  } catch (error) {
    console.error("[BRANDING_UPLOAD] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al subir archivo" },
      { status: 500 }
    );
  }
}
```

**Step 2: Verify directory exists and commit**

```bash
mkdir -p src/app/api/configuracion/branding/upload
git add src/app/api/configuracion/branding/upload/route.ts
git commit -m "feat(branding): add image upload API route for branding assets"
```

---

## Task 4: Create Public Branding API

**Files:**
- Create: `src/app/api/branding/route.ts`

**Step 1: Create public branding endpoint**

This is a public endpoint (no auth) that returns branding config for the default tenant. Used by the welcome screen before login.

```typescript
import { NextResponse } from "next/server";
import { getTenantCompanyConfig } from "@/lib/tenant-config";
import { getDefaultTenantId } from "@/lib/tenant";

/**
 * GET /api/branding — Public branding config (no auth required)
 * Returns branding fields for the default tenant.
 * Used by /welcome and other public pages.
 */
export async function GET() {
  try {
    const tenantId = await getDefaultTenantId();
    const config = await getTenantCompanyConfig(tenantId);

    return NextResponse.json({
      success: true,
      data: {
        logoFull: config.brandingLogoFull || config.logoUrl || "",
        logoIcon: config.brandingLogoIcon || "",
        logoWhite: config.brandingLogoWhite || "",
        logoDark: config.brandingLogoDark || "",
        favicon: config.brandingFavicon || "",
        primaryColor: config.brandingPrimaryColor,
        secondaryColor: config.brandingSecondaryColor,
        accentColor: config.brandingAccentColor,
        appName: config.brandingAppName,
        tagline: config.brandingTagline,
        companyName: config.commercialName || config.companyName,
      },
    });
  } catch (error) {
    console.error("[BRANDING] Error loading public branding:", error);
    // Return hardcoded Gard defaults on error so welcome screen always works
    return NextResponse.json({
      success: true,
      data: {
        logoFull: "",
        logoIcon: "",
        logoWhite: "",
        logoDark: "",
        favicon: "",
        primaryColor: "#0a1628",
        secondaryColor: "#0d9488",
        accentColor: "#2dd4bf",
        appName: "OPAI",
        tagline: "Plataforma de Operaciones",
        companyName: "Gard Security",
      },
    });
  }
}
```

**Step 2: Commit**

```bash
mkdir -p src/app/api/branding
git add src/app/api/branding/route.ts
git commit -m "feat(branding): add public branding API endpoint"
```

---

## Task 5: Create useBranding Hook

**Files:**
- Create: `src/lib/branding/useBranding.ts`

**Step 1: Create the hook**

```typescript
"use client";

import { useEffect, useState } from "react";

export interface Branding {
  logoFull: string;
  logoIcon: string;
  logoWhite: string;
  logoDark: string;
  favicon: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  appName: string;
  tagline: string;
  companyName: string;
}

const DEFAULTS: Branding = {
  logoFull: "",
  logoIcon: "",
  logoWhite: "",
  logoDark: "",
  favicon: "",
  primaryColor: "#0a1628",
  secondaryColor: "#0d9488",
  accentColor: "#2dd4bf",
  appName: "OPAI",
  tagline: "Plataforma de Operaciones",
  companyName: "Gard Security",
};

let cachedBranding: Branding | null = null;
let fetchPromise: Promise<Branding> | null = null;

async function fetchBranding(): Promise<Branding> {
  try {
    const res = await fetch("/api/branding");
    const json = await res.json();
    if (json.success && json.data) {
      cachedBranding = { ...DEFAULTS, ...json.data };
      return cachedBranding;
    }
  } catch {
    // fall through to defaults
  }
  cachedBranding = DEFAULTS;
  return DEFAULTS;
}

export function useBranding() {
  const [branding, setBranding] = useState<Branding>(cachedBranding ?? DEFAULTS);
  const [loading, setLoading] = useState(!cachedBranding);

  useEffect(() => {
    if (cachedBranding) {
      setBranding(cachedBranding);
      setLoading(false);
      return;
    }
    if (!fetchPromise) {
      fetchPromise = fetchBranding();
    }
    fetchPromise.then((b) => {
      setBranding(b);
      setLoading(false);
    });
  }, []);

  return { branding, loading };
}
```

**Step 2: Commit**

```bash
mkdir -p src/lib/branding
git add src/lib/branding/useBranding.ts
git commit -m "feat(branding): add useBranding client hook"
```

---

## Task 6: Add "Imagen Corporativa" Tab to EmpresaConfigTabs

**Files:**
- Modify: `src/components/configuracion/EmpresaConfigTabs.tsx`

This is the largest UI task. Add a 6th tab with image upload dropzones, color pickers, and text fields.

**Step 1: Add Paintbrush import and branding upload helper**

At line 5, add `Paintbrush` to the lucide imports:

```typescript
import { Building, FileSignature, Globe, Loader2, Mail, Paintbrush, Phone, Save, Upload, X } from "lucide-react";
```

**Step 2: Add BRANDING_IMAGE_FIELDS and BRANDING_TEXT_FIELDS constants**

Add after the EMAIL_FIELDS array (after line 44):

```typescript
const BRANDING_IMAGE_FIELDS = [
  { key: "empresa.branding.logoFull", label: "Logo completo (horizontal)", help: "Para headers, documentos y emails. Recomendado: PNG transparente, min 400px ancho." },
  { key: "empresa.branding.logoIcon", label: "Ícono / Isotipo", help: "Para favicon, app icon y espacios reducidos. Recomendado: cuadrado, min 256px." },
  { key: "empresa.branding.logoWhite", label: "Logo versión clara", help: "Para fondos oscuros (dark mode). PNG con transparencia." },
  { key: "empresa.branding.logoDark", label: "Logo versión oscura", help: "Para fondos claros (light mode). PNG con transparencia." },
  { key: "empresa.branding.favicon", label: "Favicon", help: "Ícono del navegador. Recomendado: ICO o PNG 32x32." },
];

const BRANDING_COLOR_FIELDS = [
  { key: "empresa.branding.primaryColor", label: "Color principal", help: "Navy principal de la marca.", placeholder: "#0a1628" },
  { key: "empresa.branding.secondaryColor", label: "Color secundario", help: "Color secundario de la marca.", placeholder: "#0d9488" },
  { key: "empresa.branding.accentColor", label: "Color accent", help: "Para CTAs y elementos destacados.", placeholder: "#2dd4bf" },
];

const BRANDING_TEXT_FIELDS = [
  { key: "empresa.branding.appName", label: "Nombre de la aplicación", placeholder: "OPAI", help: "Se muestra en la welcome screen y título de la app." },
  { key: "empresa.branding.tagline", label: "Subtítulo / Tagline", placeholder: "Plataforma de Operaciones", help: "Se muestra debajo del nombre en la welcome screen." },
];
```

**Step 3: Add image upload handler function inside the component**

Add inside the `EmpresaConfigTabs` component, after the `handleSave` function (after line 85):

```typescript
  async function handleBrandingUpload(fieldKey: string, file: File) {
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/configuracion/branding/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (data.success && data.data?.url) {
        setForm((prev) => ({ ...prev, [fieldKey]: data.data.url }));
        toast.success("Imagen subida");
      } else {
        throw new Error(data.error || "Error al subir");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al subir imagen";
      toast.error(msg);
    }
  }
```

**Step 4: Add the brandingTab JSX**

Add before the `const tabs = [` line (before line 362):

```typescript
  const brandingTab = (
    <div className="max-w-2xl space-y-6">
      {/* Image uploads */}
      <div className="rounded-lg border border-border p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Upload className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Logos e íconos</h3>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">
          Sube las variantes del logo de tu empresa. Se usan en la welcome screen, headers, documentos y la app móvil.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {BRANDING_IMAGE_FIELDS.map((field) => (
            <div key={field.key} className="space-y-2">
              <Label className="text-xs">{field.label}</Label>
              {form[field.key] ? (
                <div className="relative group rounded-lg border border-border p-3 bg-muted/20">
                  <img
                    src={form[field.key]}
                    alt={field.label}
                    className="h-16 max-w-full object-contain mx-auto"
                  />
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, [field.key]: "" }))}
                    className="absolute top-1 right-1 p-1 rounded-full bg-destructive/80 text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center h-24 rounded-lg border-2 border-dashed border-border hover:border-primary/50 cursor-pointer transition-colors bg-muted/10">
                  <Upload className="h-5 w-5 text-muted-foreground mb-1" />
                  <span className="text-xs text-muted-foreground">Click o arrastra</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleBrandingUpload(field.key, file);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
              <p className="text-[11px] text-muted-foreground">{field.help}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Colors */}
      <div className="rounded-lg border border-border p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Paintbrush className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Colores corporativos</h3>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {BRANDING_COLOR_FIELDS.map((field) => (
            <div key={field.key} className="space-y-2">
              <Label className="text-xs">{field.label}</Label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={form[field.key] || field.placeholder}
                  onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  className="h-9 w-12 rounded border border-border cursor-pointer bg-transparent"
                />
                <Input
                  value={form[field.key] ?? ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  className="text-sm font-mono flex-1"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">{field.help}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Text fields */}
      <div className="rounded-lg border border-border p-6 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {BRANDING_TEXT_FIELDS.map((field) => (
            <div key={field.key}>
              <Label className="text-xs mb-1.5">{field.label}</Label>
              <Input
                value={form[field.key] ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                placeholder={field.placeholder}
                className="text-sm"
              />
              <p className="text-[11px] text-muted-foreground mt-1">{field.help}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Preview */}
      <div className="rounded-lg border border-border p-6 space-y-3">
        <h3 className="text-sm font-semibold">Vista previa</h3>
        <div
          className="rounded-lg p-6 flex flex-col items-center gap-3"
          style={{ backgroundColor: form["empresa.branding.primaryColor"] || "#0a1628" }}
        >
          {form["empresa.branding.logoWhite"] || form["empresa.branding.logoFull"] ? (
            <img
              src={form["empresa.branding.logoWhite"] || form["empresa.branding.logoFull"]}
              alt="Logo preview"
              className="h-12 object-contain"
            />
          ) : (
            <div className="text-white/60 text-xs">Sin logo configurado</div>
          )}
          <span className="text-white font-bold text-lg">
            {form["empresa.branding.appName"] || "OPAI"}
          </span>
          <span className="text-white/70 text-sm">
            {form["empresa.branding.tagline"] || "Plataforma de Operaciones"}
          </span>
          <div className="flex gap-2 mt-2">
            <div
              className="w-8 h-8 rounded-full border border-white/20"
              style={{ backgroundColor: form["empresa.branding.primaryColor"] || "#0a1628" }}
              title="Primary"
            />
            <div
              className="w-8 h-8 rounded-full border border-white/20"
              style={{ backgroundColor: form["empresa.branding.secondaryColor"] || "#0d9488" }}
              title="Secondary"
            />
            <div
              className="w-8 h-8 rounded-full border border-white/20"
              style={{ backgroundColor: form["empresa.branding.accentColor"] || "#2dd4bf" }}
              title="Accent"
            />
          </div>
        </div>
      </div>

      <div className="pt-2">
        <Button onClick={handleSave} disabled={saving} className="gap-1.5">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar imagen corporativa
        </Button>
      </div>
    </div>
  );
```

**Step 5: Add the tab to the tabs array**

Add after the "firma" tab entry (after the object ending on line 392):

```typescript
    {
      id: "branding",
      label: "Imagen Corporativa",
      icon: Paintbrush,
      content: brandingTab,
    },
```

**Step 6: Verify — open Configuración Empresa in browser, click the new tab**

Expected: 6th tab "Imagen Corporativa" appears with upload dropzones, color pickers, text fields, and live preview.

**Step 7: Commit**

```bash
git add src/components/configuracion/EmpresaConfigTabs.tsx
git commit -m "feat(branding): add Imagen Corporativa tab to empresa config"
```

---

## Task 7: Create Welcome Screen Page

**Files:**
- Create: `src/app/welcome/page.tsx`
- Create: `src/components/welcome/WelcomeScreen.tsx`
- Create: `src/components/welcome/PortalCard.tsx`

**Step 1: Create PortalCard component**

```typescript
// src/components/welcome/PortalCard.tsx
"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface SubOption {
  label: string;
  subtitle: string;
  href: string;
}

interface PortalCardProps {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  accentColor: string;
  href?: string;
  subOptions?: SubOption[];
  index: number;
  onNavigate: (href: string, portalKey: string) => void;
}

export function PortalCard({
  icon: Icon,
  title,
  subtitle,
  accentColor,
  href,
  subOptions,
  index,
  onNavigate,
}: PortalCardProps) {
  const [expanded, setExpanded] = useState(false);

  function handleClick() {
    if (subOptions) {
      setExpanded((prev) => !prev);
    } else if (href) {
      onNavigate(href, title.toLowerCase());
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
    >
      <button
        onClick={handleClick}
        className="w-full text-left rounded-xl border border-white/10 bg-white/5 p-5 transition-all duration-200 hover:bg-white/10 hover:-translate-y-0.5 group"
        style={{
          ["--accent" as string]: accentColor,
          boxShadow: "0 0 0 0 transparent",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = `0 8px 30px -5px ${accentColor}30`;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = "0 0 0 0 transparent";
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${accentColor}20` }}
            >
              <Icon className="h-5 w-5" style={{ color: accentColor }} />
            </div>
            <div>
              <div className="font-semibold text-white">{title}</div>
              <div className="text-sm text-white/60">{subtitle}</div>
            </div>
          </div>
          {subOptions && (
            <motion.div
              animate={{ rotate: expanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown className="h-4 w-4 text-white/40" />
            </motion.div>
          )}
        </div>
      </button>

      <AnimatePresence>
        {expanded && subOptions && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="mt-2 ml-4 space-y-2">
              {subOptions.map((opt) => (
                <button
                  key={opt.href}
                  onClick={() => onNavigate(opt.href, opt.label.toLowerCase().replace(/\s/g, "-"))}
                  className="w-full text-left rounded-lg border border-white/10 bg-white/5 p-3.5 transition-all duration-200 hover:bg-white/10"
                  style={{
                    ["--accent" as string]: accentColor,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = `0 4px 20px -5px ${accentColor}25`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  <div className="font-medium text-sm text-white">{opt.label}</div>
                  <div className="text-xs text-white/50 mt-0.5">{opt.subtitle}</div>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
```

**Step 2: Create WelcomeScreen component**

```typescript
// src/components/welcome/WelcomeScreen.tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Shield, UserCog, Users, Zap } from "lucide-react";
import { useBranding } from "@/lib/branding/useBranding";
import { PortalCard } from "./PortalCard";

const STORAGE_KEY = "opai-last-portal";

interface LastPortal {
  key: string;
  label: string;
  href: string;
}

const PORTALS = [
  {
    key: "guardia",
    icon: Shield,
    title: "Guardia",
    subtitle: "Portal de Guardia",
    accentColor: "#2dd4bf",
    subOptions: [
      { label: "Portal Guardia", subtitle: "Novedades, asistencia y documentos", href: "/portal/guardia" },
      { label: "Portal Rondas", subtitle: "Registro de rondas y checkpoints", href: "/portal/rondas" },
    ],
  },
  {
    key: "supervisor",
    icon: UserCog,
    title: "Supervisor",
    subtitle: "Hub Operacional",
    accentColor: "#a78bfa",
    href: "/portal/supervisor",
  },
  {
    key: "cliente",
    icon: Users,
    title: "Cliente",
    subtitle: "Portal de Servicios",
    accentColor: "#38bdf8",
    href: "/portal/cliente",
  },
  {
    key: "opai",
    icon: Zap,
    title: "OPAI",
    subtitle: "Sistema ERP Completo",
    accentColor: "#f472b6",
    href: "/opai/login",
  },
];

export function WelcomeScreen() {
  const router = useRouter();
  const { branding, loading } = useBranding();
  const [lastPortal, setLastPortal] = useState<LastPortal | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setLastPortal(JSON.parse(stored));
    } catch {
      // ignore
    }
  }, []);

  function handleNavigate(href: string, portalKey: string) {
    const portal: LastPortal = { key: portalKey, label: portalKey, href };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(portal));
    } catch {
      // ignore
    }
    router.push(href);
  }

  const logoSrc = branding.logoWhite || branding.logoFull;

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-8"
      style={{ backgroundColor: branding.primaryColor }}
    >
      <div className="w-full max-w-lg mx-auto flex flex-col items-center">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          {logoSrc ? (
            <img src={logoSrc} alt={branding.companyName} className="h-14 object-contain" />
          ) : (
            <div className="text-3xl font-bold text-white">{branding.companyName}</div>
          )}
        </motion.div>

        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="text-center mb-8"
        >
          <h1 className="text-2xl font-bold text-white mb-1">
            Bienvenido a {branding.appName}
          </h1>
          <p className="text-white/60 text-sm">Selecciona tu perfil para continuar</p>
        </motion.div>

        {/* Last portal chip */}
        {lastPortal && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            onClick={() => router.push(lastPortal.href)}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs text-white/70 hover:bg-white/10 transition-colors"
          >
            <span>Último acceso: <span className="text-white font-medium capitalize">{lastPortal.key}</span></span>
            <span className="text-white/40">→ Ir directo</span>
          </motion.button>
        )}

        {/* Portal cards */}
        <div className="w-full grid gap-3 sm:grid-cols-2">
          {PORTALS.map((portal, i) => (
            <PortalCard
              key={portal.key}
              icon={portal.icon}
              title={portal.title}
              subtitle={portal.subtitle}
              accentColor={portal.accentColor}
              href={portal.href}
              subOptions={portal.subOptions}
              index={i}
              onNavigate={handleNavigate}
            />
          ))}
        </div>

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-10 text-center text-xs text-white/30"
        >
          <span>{branding.appName} · {branding.tagline}</span>
        </motion.div>
      </div>
    </div>
  );
}
```

**Step 3: Create the welcome page**

```typescript
// src/app/welcome/page.tsx
import { WelcomeScreen } from "@/components/welcome/WelcomeScreen";

export const metadata = {
  title: "OPAI - Bienvenido",
  description: "Selecciona tu perfil para continuar",
};

export default function WelcomePage() {
  return <WelcomeScreen />;
}
```

**Step 4: Verify — navigate to `/welcome` in browser**

Expected: Dark welcome screen with 4 portal cards, staggered animation, Guard card expands on click showing 2 sub-options.

**Step 5: Commit**

```bash
mkdir -p src/components/welcome
git add src/app/welcome/page.tsx src/components/welcome/WelcomeScreen.tsx src/components/welcome/PortalCard.tsx
git commit -m "feat(welcome): add welcome screen with portal selection"
```

---

## Task 8: Update Middleware

**Files:**
- Modify: `src/middleware.ts` (lines 24-83 for isPublicPath, lines 124-135 for redirects)

**Step 1: Add `/welcome` and `/api/branding` to isPublicPath**

Add after `if (pathname.startsWith('/descargar')) return true;` (line 39):

```typescript
  if (pathname === '/welcome') return true;
  if (pathname.startsWith('/api/branding')) return true;
```

**Step 2: Update the `/` and `/opai` redirect logic**

Replace lines 128-135:

```typescript
  // Entrada al sitio
  if (pathname === '/' || pathname === '/opai') {
    if (!req.auth) {
      return Response.redirect(new URL('/welcome', req.nextUrl.origin));
    }
    return Response.redirect(new URL('/hub', req.nextUrl.origin));
  }

  // Authenticated user on /welcome → skip to hub
  if (pathname === '/welcome' && req.auth) {
    return Response.redirect(new URL('/hub', req.nextUrl.origin));
  }
```

**Step 3: Verify — test these scenarios manually**

1. Not logged in, go to `/` → should redirect to `/welcome`
2. Not logged in, go to `/welcome` → should show welcome screen
3. Logged in, go to `/` → should redirect to `/hub`
4. Logged in, go to `/welcome` → should redirect to `/hub`
5. All existing portal routes still work as before
6. `/opai/login` still works as before

**Step 4: Commit**

```bash
git add src/middleware.ts
git commit -m "feat(welcome): update middleware for /welcome route"
```

---

## Task 9: Capacitor Installation and Configuration

**Files:**
- Create: `capacitor.config.ts`
- Modify: `.gitignore`
- Modify: `package.json` (via npm install)

**Step 1: Install Capacitor core**

```bash
npm install @capacitor/core @capacitor/cli
```

**Step 2: Initialize Capacitor**

```bash
npx cap init "OPAI" "cl.gard.opai" --web-dir=out
```

**Step 3: Overwrite `capacitor.config.ts` with proper config**

```typescript
import type { CapacitorConfig } from "@capacitor/core";

const config: CapacitorConfig = {
  appId: "cl.gard.opai",
  appName: "OPAI",
  webDir: "out",
  server: {
    url: "https://opai.gard.cl",
    allowNavigation: ["opai.gard.cl", "*.gard.cl"],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#0a1628",
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0a1628",
    },
  },
};

export default config;
```

**Step 4: Install native platform dependencies**

```bash
npm install @capacitor/android @capacitor/ios
```

**Step 5: Install native plugins**

```bash
npm install @capacitor/push-notifications @capacitor/geolocation @capacitor/camera @capacitor/haptics @capacitor/status-bar @capacitor/splash-screen @capacitor/preferences @capacitor/badge capacitor-native-biometric
```

**Step 6: Add android/ and ios/ to .gitignore**

Add to the end of `.gitignore`:

```
# Capacitor native projects (regenerated with `npx cap add`)
android/
ios/
```

**Step 7: Add Capacitor platforms**

```bash
npx cap add android
npx cap add ios
```

**Step 8: Commit**

```bash
git add capacitor.config.ts .gitignore package.json package-lock.json
git commit -m "feat(capacitor): initial setup with native plugins"
```

---

## Task 10: Create Native Platform Hooks

**Files:**
- Create: `src/lib/capacitor/usePlatform.ts`
- Create: `src/lib/capacitor/usePushNotifications.ts`
- Create: `src/lib/capacitor/useGeolocation.ts`
- Create: `src/lib/capacitor/useBiometricAuth.ts`
- Create: `src/lib/capacitor/useCamera.ts`

**Step 1: Create usePlatform hook**

```typescript
// src/lib/capacitor/usePlatform.ts
"use client";

import { Capacitor } from "@capacitor/core";

export function usePlatform() {
  const platform = Capacitor.getPlatform(); // 'web' | 'ios' | 'android'
  const isNative = Capacitor.isNativePlatform();

  return {
    platform,
    isNative,
    isIOS: platform === "ios",
    isAndroid: platform === "android",
    isWeb: platform === "web",
  };
}
```

**Step 2: Create usePushNotifications hook**

```typescript
// src/lib/capacitor/usePushNotifications.ts
"use client";

import { useEffect, useCallback, useRef } from "react";
import { Capacitor } from "@capacitor/core";

export function usePushNotifications(onToken?: (token: string) => void) {
  const registered = useRef(false);

  const register = useCallback(async () => {
    if (!Capacitor.isNativePlatform() || registered.current) return;

    const { PushNotifications } = await import("@capacitor/push-notifications");

    const permResult = await PushNotifications.requestPermissions();
    if (permResult.receive !== "granted") return;

    await PushNotifications.register();

    PushNotifications.addListener("registration", (token) => {
      onToken?.(token.value);
    });

    PushNotifications.addListener("registrationError", (error) => {
      console.error("[PUSH] Registration error:", error);
    });

    registered.current = true;
  }, [onToken]);

  useEffect(() => {
    register();
  }, [register]);

  return { register };
}
```

**Step 3: Create useGeolocation hook**

```typescript
// src/lib/capacitor/useGeolocation.ts
"use client";

import { useState, useCallback } from "react";
import { Capacitor } from "@capacitor/core";

interface Position {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export function useGeolocation() {
  const [position, setPosition] = useState<Position | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const getCurrentPosition = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (Capacitor.isNativePlatform()) {
        const { Geolocation } = await import("@capacitor/geolocation");
        const perms = await Geolocation.requestPermissions();
        if (perms.location !== "granted") {
          setError("Permiso de ubicación denegado");
          return null;
        }
        const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true });
        const result = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        setPosition(result);
        return result;
      } else {
        // Web fallback
        return new Promise<Position | null>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const result = {
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
              };
              setPosition(result);
              resolve(result);
            },
            (err) => {
              setError(err.message);
              resolve(null);
            },
            { enableHighAccuracy: true }
          );
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al obtener ubicación";
      setError(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { position, error, loading, getCurrentPosition };
}
```

**Step 4: Create useBiometricAuth hook**

```typescript
// src/lib/capacitor/useBiometricAuth.ts
"use client";

import { useState, useCallback } from "react";
import { Capacitor } from "@capacitor/core";

export function useBiometricAuth() {
  const [available, setAvailable] = useState(false);

  const checkAvailability = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) {
      setAvailable(false);
      return false;
    }

    try {
      const { NativeBiometric } = await import("capacitor-native-biometric");
      const result = await NativeBiometric.isAvailable();
      setAvailable(result.isAvailable);
      return result.isAvailable;
    } catch {
      setAvailable(false);
      return false;
    }
  }, []);

  const authenticate = useCallback(async (reason = "Verificar identidad") => {
    if (!Capacitor.isNativePlatform()) return false;

    try {
      const { NativeBiometric } = await import("capacitor-native-biometric");
      await NativeBiometric.verifyIdentity({ reason });
      return true;
    } catch {
      return false;
    }
  }, []);

  return { available, checkAvailability, authenticate };
}
```

**Step 5: Create useCamera hook**

```typescript
// src/lib/capacitor/useCamera.ts
"use client";

import { useCallback } from "react";
import { Capacitor } from "@capacitor/core";

interface PhotoResult {
  dataUrl: string;
  format: string;
}

export function useCamera() {
  const takePhoto = useCallback(async (): Promise<PhotoResult | null> => {
    if (!Capacitor.isNativePlatform()) return null;

    try {
      const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
      const photo = await Camera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
      });
      if (photo.dataUrl) {
        return { dataUrl: photo.dataUrl, format: photo.format };
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  const pickFromGallery = useCallback(async (): Promise<PhotoResult | null> => {
    if (!Capacitor.isNativePlatform()) return null;

    try {
      const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
      const photo = await Camera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Photos,
      });
      if (photo.dataUrl) {
        return { dataUrl: photo.dataUrl, format: photo.format };
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  return { takePhoto, pickFromGallery };
}
```

**Step 6: Commit**

```bash
mkdir -p src/lib/capacitor
git add src/lib/capacitor/
git commit -m "feat(capacitor): add native platform hooks"
```

---

## Task 11: Final Verification

**Step 1: Run build to verify no TypeScript errors**

```bash
npm run build
```

Expected: Build succeeds with no errors.

**Step 2: Manual smoke test checklist**

1. `/welcome` — renders with 4 portal cards, stagger animations work
2. Click "Guardia" — expands showing 2 sub-options
3. Click "Portal Guardia" → navigates to `/portal/guardia`
4. Click "OPAI" → navigates to `/opai/login`
5. `/` without session → redirects to `/welcome`
6. `/` with session → redirects to `/hub`
7. `/welcome` with session → redirects to `/hub`
8. Configuración Empresa → "Imagen Corporativa" tab visible
9. Upload a logo image → preview appears
10. Change colors → live preview updates
11. Save → toast confirms
12. All existing routes still work

**Step 3: Commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address issues from final verification"
```
