# Sprint 2: Historial Marcaciones + Reportes DT — Plan Parte 1 (Pasos 1–10)

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migración de base de datos, permisos, badge de modificación, middleware público, flujo completo de oposición (email + API + página pública + cron).

**Architecture:** Foundation first — schema, permisos, componente badge, rutas públicas — luego el flujo de oposición que depende de ellos.

**Tech Stack:** Next.js 15 App Router, Prisma/PostgreSQL, TypeScript, Resend, date-fns v4, Vitest

**Spec:** `docs/superpowers/specs/2026-03-12-sprint2-historial-marcaciones-reportes-dt-design.md`

---

## Chunk 1: Foundation

### Task 1: Prisma Migration — 5 nuevos campos en OpsMarcacion

**Files:**
- Modify: `prisma/schema.prisma` (modelo `OpsMarcacion`, después de `isModified`)
- Note: `prisma migrate dev` genera automáticamente la carpeta de migración con timestamp propio; no pre-crear el directorio.

- [ ] **Step 1: Agregar los 5 campos al modelo en schema.prisma**

Localiza `isModified` (línea ~3240) y agrega inmediatamente después:

```prisma
  // ── Oposición del trabajador (Res. N°38 Art. 5) ──
  oppositionToken    String?   @unique @map("opposition_token")
  opposedAt          DateTime? @map("opposed_at") @db.Timestamptz(6)
  opposedBy          String?   @map("opposed_by")
  oppositionReason   String?   @map("opposition_reason")
  consolidatedAt     DateTime? @map("consolidated_at") @db.Timestamptz(6)
```

- [ ] **Step 2: Correr la migración**

```bash
cd /Users/caco/Desktop/Cursor/opai
npx prisma migrate dev --name add_opposition_fields_to_marcacion
```

Expected: `✔  Generated Prisma Client` sin errores. La migración debe crear el archivo SQL automáticamente.

- [ ] **Step 3: Verificar que Prisma Client se regeneró**

```bash
npx prisma generate
```

Expected: `✔  Generated Prisma Client`

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(schema): add opposition fields to OpsMarcacion (Res. N°38 Art. 5)"
```

---

### Task 2: permissions.ts — Módulo reportes_dt

**Files:**
- Modify: `src/lib/permissions.ts`

Hay 6 cambios exactos. Hacerlos en orden.

- [ ] **Step 1: Agregar `"reportes_dt"` a MODULE_KEYS (línea ~46)**

```typescript
// ANTES:
export const MODULE_KEYS = [
  "hub",
  "ops",
  "crm",
  "docs",
  "payroll",
  "cpq",
  "config",
  "finance",
] as const;

// DESPUÉS:
export const MODULE_KEYS = [
  "hub",
  "ops",
  "crm",
  "docs",
  "payroll",
  "cpq",
  "config",
  "finance",
  "reportes_dt",
] as const;
```

- [ ] **Step 2: Agregar `reportes_dt` a SUBMODULE_KEYS y entrada en MODULE_META**

```typescript
// En SUBMODULE_KEYS: agregar al final del objeto, antes del cierre:
  reportes_dt: [] as readonly string[],
```

```typescript
// En MODULE_META (línea ~187): agregar al final del array, antes del cierre `]`:
  { key: "reportes_dt", label: "Reportes DT" },
```

- [ ] **Step 3: Agregar `reportes_dt: "view"` a `rrhh.modules` (línea ~376)**

```typescript
// ANTES:
  rrhh: {
    modules: {
      hub: "view",
      ops: "edit",
      crm: "none",
      docs: "none",
      payroll: "none",
      cpq: "none",
      config: "none",
      finance: "view",
    },

// DESPUÉS:
  rrhh: {
    modules: {
      hub: "view",
      ops: "edit",
      crm: "none",
      docs: "none",
      payroll: "none",
      cpq: "none",
      config: "none",
      finance: "view",
      reportes_dt: "view",
    },
```

- [ ] **Step 4: Agregar `reportes_dt: "view"` a `jefe_operaciones.modules` (línea ~406)**

```typescript
// ANTES:
  jefe_operaciones: {
    modules: {
      hub: "view",
      ops: "edit",
      crm: "view",
      docs: "none",
      payroll: "none",
      cpq: "none",
      config: "none",
      finance: "edit",
    },

// DESPUÉS:
  jefe_operaciones: {
    modules: {
      hub: "view",
      ops: "edit",
      crm: "view",
      docs: "none",
      payroll: "none",
      cpq: "none",
      config: "none",
      finance: "edit",
      reportes_dt: "view",
    },
```

- [ ] **Step 5: Agregar entrada en `pathToPermission()` (antes de `return null;` al final de la función, ~línea 877)**

La función se llama `pathToPermission`, no `pathToModule`. Buscar `export function pathToPermission` (línea ~791).

```typescript
  // Reportes DT
  if (pathname.startsWith("/reportes/dt")) return { module: "reportes_dt" };
```

- [ ] **Step 6: Agregar entrada en `apiPathToModule()` (antes de `return null;` al final, ~línea 894)**

```typescript
  if (pathname.startsWith("/api/reportes/dt/")) return "reportes_dt";
```

- [ ] **Step 7: Verificar que TypeScript compila sin errores**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: sin errores relacionados a `reportes_dt` o `MODULE_KEYS`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/permissions.ts
git commit -m "feat(permissions): add reportes_dt module for DT reports access"
```

---

### Task 3: MarcacionModificadaBadge component

**Files:**
- Create: `src/components/ops/MarcacionModificadaBadge.tsx`
- Create: `src/components/ops/__tests__/MarcacionModificadaBadge.test.tsx`

- [ ] **Step 1: Escribir el test**

```typescript
// src/components/ops/__tests__/MarcacionModificadaBadge.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MarcacionModificadaBadge } from "../MarcacionModificadaBadge";

describe("MarcacionModificadaBadge", () => {
  it("muestra Pendiente cuando isModified y sin consolidar ni oponer", () => {
    render(
      <MarcacionModificadaBadge
        isModified={true}
        consolidatedAt={null}
        opposedAt={null}
      />
    );
    expect(screen.getByText("Modificada")).toBeInTheDocument();
    expect(screen.getByTitle(/pendiente/i)).toBeInTheDocument();
  });

  it("muestra Opuesta cuando hay opposedAt", () => {
    render(
      <MarcacionModificadaBadge
        isModified={true}
        consolidatedAt={null}
        opposedAt={new Date("2026-03-10T10:00:00Z")}
      />
    );
    expect(screen.getByTitle(/opuesta/i)).toBeInTheDocument();
  });

  it("muestra Consolidada cuando hay consolidatedAt", () => {
    render(
      <MarcacionModificadaBadge
        isModified={true}
        consolidatedAt={new Date("2026-03-12T10:00:00Z")}
        opposedAt={null}
      />
    );
    expect(screen.getByTitle(/consolidada/i)).toBeInTheDocument();
  });

  it("no renderiza nada cuando isModified=false", () => {
    const { container } = render(
      <MarcacionModificadaBadge
        isModified={false}
        consolidatedAt={null}
        opposedAt={null}
      />
    );
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
npx vitest run src/components/ops/__tests__/MarcacionModificadaBadge.test.tsx
```

Expected: FAIL — "Cannot find module"

- [ ] **Step 3: Crear el componente**

```typescript
// src/components/ops/MarcacionModificadaBadge.tsx
"use client";

import { AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  isModified: boolean;
  consolidatedAt: Date | string | null;
  opposedAt: Date | string | null;
  className?: string;
}

type Estado = "pendiente" | "opuesta" | "consolidada";

function getEstado(consolidatedAt: Props["consolidatedAt"], opposedAt: Props["opposedAt"]): Estado {
  if (consolidatedAt) return "consolidada";
  if (opposedAt) return "opuesta";
  return "pendiente";
}

const CONFIG: Record<Estado, { label: string; title: string; icon: React.ElementType; className: string }> = {
  pendiente: {
    label: "Modificada",
    title: "Modificación pendiente de oposición (48h)",
    icon: AlertCircle,
    className: "bg-amber-100 text-amber-700 border-amber-200",
  },
  opuesta: {
    label: "Opuesta",
    title: "Trabajador se opuso a la modificación",
    icon: XCircle,
    className: "bg-red-100 text-red-700 border-red-200",
  },
  consolidada: {
    label: "Consolidada",
    title: "Modificación consolidada (plazo vencido)",
    icon: CheckCircle2,
    className: "bg-slate-100 text-slate-600 border-slate-200",
  },
};

export function MarcacionModificadaBadge({ isModified, consolidatedAt, opposedAt, className }: Props) {
  if (!isModified) return null;

  const estado = getEstado(consolidatedAt, opposedAt);
  const { label, title, icon: Icon, className: stateClass } = CONFIG[estado];

  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium",
        stateClass,
        className
      )}
    >
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}
```

- [ ] **Step 4: Correr el test**

```bash
npx vitest run src/components/ops/__tests__/MarcacionModificadaBadge.test.tsx
```

Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/ops/MarcacionModificadaBadge.tsx src/components/ops/__tests__/MarcacionModificadaBadge.test.tsx
git commit -m "feat(ops): MarcacionModificadaBadge con estados pendiente/opuesta/consolidada"
```

---

### Task 4: Middleware — rutas públicas de oposición

**Files:**
- Modify: `src/middleware.ts`

- [ ] **Step 1: Agregar las 2 entradas públicas en `isPublicPath()`**

Justo después de `if (pathname.startsWith('/marcar/')) return true;` (línea ~32), agregar:

```typescript
  if (pathname.startsWith('/marcacion/oposicion/')) return true; // Página pública de oposición
  if (pathname.startsWith('/api/marcacion/oposicion/')) return true; // API pública de oposición
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -i middleware | head -5
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/middleware.ts
git commit -m "feat(middleware): allow public access to opposition pages and API"
```

---

## Chunk 2: Flujo de Oposición (Parte D)

### Task 5: sendAvisoModificacionMarcacion en marcacion-email.ts

**Files:**
- Modify: `src/lib/marcacion-email.ts`

- [ ] **Step 1: Agregar la interfaz y función al final del archivo**

```typescript
/* ─── Aviso de Modificación con Link de Oposición ─── */

export interface AvisoModificacionMarcacion {
  guardiaName: string;
  guardiaEmail: string;
  guardiaRut: string;
  installationName: string;
  tipo: "entrada" | "salida";
  timestampOriginal: Date;
  timestampNuevo: Date;
  motivo: string;
  registradoPor: string;
  oppositionUrl: string; // https://opai.gard.cl/marcacion/oposicion/[token]
}

/**
 * Envía aviso de modificación de marcación con link único para que el
 * trabajador pueda oponerse dentro del plazo de 48 horas (Res. N°38 Art. 5).
 */
export async function sendAvisoModificacionMarcacion(data: AvisoModificacionMarcacion): Promise<void> {
  const tipoLabel = data.tipo === "entrada" ? "Entrada" : "Salida";

  const fmt = (d: Date) =>
    d.toLocaleString("es-CL", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      timeZone: "America/Santiago",
    });

  const subject = `Aviso de Modificación de Marcación — ${data.installationName}`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; background: #ffffff;">
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="display: inline-block; width: 48px; height: 48px; background: #d97706; border-radius: 50%; line-height: 48px; text-align: center;">
          <span style="color: white; font-size: 20px;">✏️</span>
        </div>
        <h2 style="margin: 12px 0 4px; color: #0f172a; font-size: 18px;">Modificación de Marcación</h2>
        <p style="color: #64748b; font-size: 13px; margin: 0;">Su registro de asistencia fue modificado</p>
      </div>

      <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px;">
        <p style="color: #92400e; font-size: 13px; margin: 0; line-height: 1.6;">
          Estimado/a <strong>${data.guardiaName}</strong>, su marcación de <strong>${tipoLabel}</strong>
          en <strong>${data.installationName}</strong> fue modificada por <strong>${data.registradoPor}</strong>.
        </p>
        <p style="color: #92400e; font-size: 12px; margin: 8px 0 0;">
          Motivo: ${data.motivo}
        </p>
      </div>

      <div style="background: #f8fafc; border-radius: 12px; padding: 20px; margin-bottom: 16px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <tr>
            <td style="padding: 6px 0; color: #64748b; width: 150px;">Tipo</td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${tipoLabel}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Instalación</td>
            <td style="padding: 6px 0; color: #0f172a;">${data.installationName}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Marca original</td>
            <td style="padding: 6px 0; color: #ef4444; text-decoration: line-through;">${fmt(data.timestampOriginal)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Nueva marca</td>
            <td style="padding: 6px 0; color: #059669; font-weight: 700;">${fmt(data.timestampNuevo)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Modificado por</td>
            <td style="padding: 6px 0; color: #0f172a;">${data.registradoPor}</td>
          </tr>
        </table>
      </div>

      <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin-bottom: 16px; text-align: center;">
        <p style="color: #991b1b; font-size: 13px; margin: 0 0 12px; font-weight: 600;">
          ¿No está de acuerdo con esta modificación?
        </p>
        <p style="color: #7f1d1d; font-size: 12px; margin: 0 0 16px; line-height: 1.5;">
          Tiene <strong>48 horas</strong> para oponerse. Si no lo hace, la modificación quedará consolidada.
        </p>
        <a href="${data.oppositionUrl}"
           style="display: inline-block; background: #dc2626; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
          Oponerme a esta modificación
        </a>
      </div>

      <div style="text-align: center; padding-top: 16px; border-top: 1px solid #e2e8f0;">
        <p style="color: #94a3b8; font-size: 10px; margin: 0;">
          ${EMAIL_CONFIG.companyName} — Conforme a Res. Exenta N°38, DT Chile
        </p>
        <p style="color: #94a3b8; font-size: 10px; margin: 4px 0 0;">
          Este link es único e intransferible. Expira en 48 horas.
        </p>
      </div>
    </div>
  `;

  await resend.emails.send({
    from: EMAIL_CONFIG.from,
    to: data.guardiaEmail,
    subject,
    html,
  });
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep marcacion-email | head -5
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/lib/marcacion-email.ts
git commit -m "feat(email): sendAvisoModificacionMarcacion con link oposición 48h"
```

---

### Task 6: PATCH /api/ops/marcacion/[id] — generar token de oposición

**Files:**
- Modify: `src/app/api/ops/marcacion/[id]/route.ts`

- [ ] **Step 1: Agregar imports al tope del archivo**

```typescript
// Agregar junto a los imports existentes:
import { sendAvisoModificacionMarcacion } from "@/lib/marcacion-email";
```

- [ ] **Step 2: En el handler PATCH, después de `const updated = await prisma.opsMarcacion.update(...)`, reemplazar el bloque de actualización**

Localizar el bloque PATCH existente. Reemplazar desde `const updateData...` hasta `const updated = await prisma.opsMarcacion.update(...)` con lo siguiente:

```typescript
    // Generar token de oposición único para esta modificación
    const oppositionToken = crypto.randomUUID();
    const baseUrl = process.env.NEXTAUTH_URL ?? "https://opai.gard.cl";
    const oppositionUrl = `${baseUrl}/marcacion/oposicion/${oppositionToken}`;

    const updateData: Record<string, unknown> = {
      modifiedAt: new Date(),
      modifiedBy: ctx.userId,
      modificationReason: parsed.data.reason,
      isModified: true,
      // Nueva modificación invalida oposición previa pendiente
      oppositionToken,
      opposedAt: null,
      opposedBy: null,
      oppositionReason: null,
      consolidatedAt: null,
    };

    if (parsed.data.timestamp) {
      updateData.timestamp = new Date(parsed.data.timestamp);
    }

    const updated = await prisma.opsMarcacion.update({
      where: { id },
      data: updateData,
      include: {
        guardia: {
          select: {
            personalEmail: true,
            persona: { select: { firstName: true, lastName: true, rut: true } },
          },
        },
        installation: { select: { name: true } },
      },
    });

    // Enviar email de aviso al guardia (fire-and-forget)
    const warnings: string[] = [];
    const guardiaEmail = updated.guardia.personalEmail;
    if (guardiaEmail) {
      const guardiaName = `${updated.guardia.persona.firstName} ${updated.guardia.persona.lastName}`;
      const registradoPor = ctx.userName ?? ctx.userId;
      sendAvisoModificacionMarcacion({
        guardiaName,
        guardiaEmail,
        guardiaRut: updated.guardia.persona.rut ?? "",
        installationName: updated.installation.name,
        tipo: updated.tipo as "entrada" | "salida",
        timestampOriginal: marcacion.timestamp,
        timestampNuevo: updated.timestamp,
        motivo: parsed.data.reason,
        registradoPor,
        oppositionUrl,
      }).catch((err) => console.error("[OPS] Error enviando email oposición:", err));
    } else {
      warnings.push("guardia_sin_email");
    }
```

- [ ] **Step 3: Actualizar el return del PATCH para incluir warnings**

```typescript
    return NextResponse.json({ success: true, data: updated, warnings });
```

- [ ] **Step 4: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "marcacion/\[id\]" | head -5
```

Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/ops/marcacion/[id]/route.ts
git commit -m "feat(api): PATCH marcacion genera oppositionToken y envía email al guardia"
```

---

### Task 7: API pública de oposición

**Files:**
- Create: `src/app/api/marcacion/oposicion/[token]/route.ts`

- [ ] **Step 1: Crear la ruta**

```typescript
/**
 * GET  /api/marcacion/oposicion/[token]  — Info de la marcación para el formulario público
 * POST /api/marcacion/oposicion/[token]  — Registrar oposición del trabajador
 *
 * Ruta pública (sin sesión NextAuth). El token actúa como credencial.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

type Params = { token: string };

function normalizeRut(rut: string): string {
  return rut.replace(/\./g, "").replace(/-/g, "").toUpperCase();
}

/** GET — Devuelve datos mínimos para mostrar el formulario (sin RUT ni datos sensibles) */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const { token } = await params;

  const marcacion = await prisma.opsMarcacion.findFirst({
    where: { oppositionToken: token, deletedAt: null },
    select: {
      id: true,
      tipo: true,
      timestamp: true,
      modificationReason: true,
      modifiedAt: true,
      opposedAt: true,
      consolidatedAt: true,
      isModified: true,
      guardia: {
        select: {
          persona: { select: { firstName: true, lastName: true } },
        },
      },
      installation: { select: { name: true } },
    },
  });

  if (!marcacion || !marcacion.isModified) {
    return NextResponse.json(
      { success: false, error: "Token inválido o expirado" },
      { status: 404 }
    );
  }

  // Verificar si el plazo de 48h ya venció
  const PLAZO_MS = 48 * 60 * 60 * 1000;
  const vencido = marcacion.modifiedAt
    ? Date.now() - marcacion.modifiedAt.getTime() > PLAZO_MS
    : false;

  // Recuperar timestamp original desde AuditLog para mostrar en el formulario
  const auditEntry = await prisma.auditLog.findFirst({
    where: { entity: "ops_marcacion", entityId: marcacion.id, action: "ops.marcacion.modified" },
    orderBy: { createdAt: "desc" },
  });
  const details = auditEntry?.details as Record<string, unknown> | null;
  const timestampOriginal = (details?.changes as Record<string, unknown>)?.timestamp?.from ?? null;

  return NextResponse.json({
    success: true,
    data: {
      tipo: marcacion.tipo,
      timestampOriginal: timestampOriginal ?? marcacion.timestamp.toISOString(), // fallback al actual si no hay original
      timestampNuevo: marcacion.timestamp.toISOString(),
      motivo: marcacion.modificationReason,
      modifiedAt: marcacion.modifiedAt?.toISOString() ?? null,
      vencido,
      yaOpuesta: !!marcacion.opposedAt,
      consolidada: !!marcacion.consolidatedAt,
      guardiaName: `${marcacion.guardia.persona.firstName} ${marcacion.guardia.persona.lastName}`,
      installationName: marcacion.installation.name,
      // NO se expone guardiaRut ni datos sensibles adicionales (spec D.5)
    },
  });
}

const postSchema = z.object({
  rut: z.string().min(7, "RUT inválido"),
  motivo: z.string().min(5, "Debe indicar el motivo de su oposición (mín. 5 caracteres)"),
});

/** POST — Registrar oposición */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const { token } = await params;

  const body = await request.json().catch(() => ({}));
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return NextResponse.json(
      { success: false, error: errors.rut?.[0] ?? errors.motivo?.[0] ?? "Datos inválidos" },
      { status: 400 }
    );
  }

  const marcacion = await prisma.opsMarcacion.findFirst({
    where: { oppositionToken: token, deletedAt: null },
    include: {
      guardia: {
        select: {
          persona: { select: { rut: true } },
        },
      },
    },
  });

  if (!marcacion || !marcacion.isModified) {
    return NextResponse.json(
      { success: false, error: "Token inválido o expirado" },
      { status: 404 }
    );
  }

  // Verificar identidad del trabajador por RUT
  const guardiaRut = marcacion.guardia.persona.rut ?? "";
  if (normalizeRut(parsed.data.rut) !== normalizeRut(guardiaRut)) {
    return NextResponse.json(
      { success: false, error: "RUT no coincide con el trabajador de esta marcación." },
      { status: 403 }
    );
  }

  if (marcacion.consolidatedAt) {
    return NextResponse.json(
      { success: false, error: "El plazo de oposición ya venció. La modificación fue consolidada." },
      { status: 409 }
    );
  }

  if (marcacion.opposedAt) {
    return NextResponse.json(
      { success: false, error: "Ya registraste tu oposición previamente." },
      { status: 409 }
    );
  }

  // Verificar plazo de 48h
  const PLAZO_MS = 48 * 60 * 60 * 1000;
  if (marcacion.modifiedAt && Date.now() - marcacion.modifiedAt.getTime() > PLAZO_MS) {
    return NextResponse.json(
      { success: false, error: "El plazo de 48 horas para oponerse ya venció." },
      { status: 409 }
    );
  }

  // Recuperar timestamp original desde AuditLog
  let timestampRestored = false;
  const auditEntry = await prisma.auditLog.findFirst({
    where: { entity: "ops_marcacion", entityId: marcacion.id, action: "ops.marcacion.modified" },
    orderBy: { createdAt: "desc" },
  });
  const auditDetails = auditEntry?.details as Record<string, unknown> | null;
  const originalTimestamp = (auditDetails?.changes as Record<string, unknown>)?.timestamp?.from ?? null;

  const updateData: Record<string, unknown> = {
    opposedAt: new Date(),
    opposedBy: parsed.data.rut,
    oppositionReason: parsed.data.motivo,
  };

  if (originalTimestamp) {
    updateData.timestamp = new Date(originalTimestamp as string);
    updateData.isModified = false;
    updateData.oppositionToken = null; // Invalidar token
    timestampRestored = true;
  }

  await prisma.opsMarcacion.update({
    where: { id: marcacion.id },
    data: updateData,
  });

  // Crear AuditLog entry
  // Usar createOpsAuditLog no aplica aquí (no hay ctx). Llamar prisma.auditLog.create directamente.
  // AuditLog fields: entity (not entityType), userId (not performedBy)
  await prisma.auditLog.create({
    data: {
      tenantId: marcacion.tenantId,
      action: "ops.marcacion.opposed",
      entity: "ops_marcacion",
      entityId: marcacion.id,
      userId: `guardia:${parsed.data.rut}`, // pseudo-userId para trazabilidad
      details: {
        motivo: parsed.data.motivo,
        restored: timestampRestored,
        originalTimestamp,
      },
    },
  });

  // Notificar al admin que hizo la modificación (fire-and-forget)
  if (marcacion.modifiedBy) {
    prisma.user.findFirst({
      where: { id: marcacion.modifiedBy },
      select: { email: true, name: true },
    }).then(async (admin) => {
      if (admin?.email) {
        const { resend, EMAIL_CONFIG } = await import("@/lib/resend");
        await resend.emails.send({
          from: EMAIL_CONFIG.from,
          to: admin.email,
          subject: `Oposición registrada — marcación modificada`,
          html: `<p>El trabajador con RUT ${parsed.data.rut} se opuso a la modificación de marcación ID <strong>${marcacion.id}</strong>.</p><p>Motivo: ${parsed.data.motivo}</p>`,
        });
      }
    }).catch((err) => console.error("[OPS] Error notificando admin de oposición:", err));
  }

  return NextResponse.json({
    success: true,
    restored: timestampRestored,
    message: timestampRestored
      ? "Tu marcación original fue restaurada."
      : "Tu oposición fue registrada. No había cambio de hora que restaurar.",
  });
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "oposicion" | head -5
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/marcacion/oposicion/
git commit -m "feat(api): public opposition endpoint GET/POST /api/marcacion/oposicion/[token]"
```

---

### Task 8: Página pública de oposición

**Files:**
- Create: `src/app/marcacion/oposicion/[token]/page.tsx`

- [ ] **Step 1: Crear la página**

```typescript
/**
 * Página pública de oposición de marcación.
 * El trabajador accede via link único del email, sin login NextAuth.
 */

import { Metadata } from "next";
import { OpposicionMarcacionForm } from "@/components/ops/OpposicionMarcacionForm";

export const metadata: Metadata = {
  title: "Oposición a Modificación de Marcación",
};

type Props = { params: Promise<{ token: string }> };

export default async function OpposicionMarcacionPage({ params }: Props) {
  const { token } = await params;
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <OpposicionMarcacionForm token={token} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Crear `src/components/ops/OpposicionMarcacionForm.tsx`**

```typescript
"use client";

import { useState, useEffect } from "react";
import { AlertCircle, CheckCircle2, XCircle, Shield } from "lucide-react";

interface MarcacionInfo {
  tipo: string;
  timestamp: string;
  modificationReason: string | null;
  modifiedAt: string | null;
  vencido: boolean;
  yaOpuesta: boolean;
  consolidada: boolean;
  guardiaName: string;
  guardiaRut: string;
  installationName: string;
}

export function OpposicionMarcacionForm({ token }: { token: string }) {
  const [info, setInfo] = useState<MarcacionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    fetch(`/api/marcacion/oposicion/${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setInfo(d.data);
        else setError(d.error);
      })
      .catch(() => setError("Error de conexión"))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const r = await fetch(`/api/marcacion/oposicion/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const d = await r.json();
      if (d.success) {
        setSubmitted(true);
        setRestored(d.restored);
      } else {
        setError(d.error);
      }
    } catch {
      setError("Error al enviar. Intente nuevamente.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow p-8 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-slate-500 text-sm">Cargando información...</p>
      </div>
    );
  }

  if (error && !info) {
    return (
      <div className="bg-white rounded-xl shadow p-8 text-center">
        <XCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-slate-800 mb-2">Link inválido</h2>
        <p className="text-slate-500 text-sm">{error}</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="bg-white rounded-xl shadow p-8 text-center">
        <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-slate-800 mb-2">Oposición registrada</h2>
        <p className="text-slate-500 text-sm">
          {restored
            ? "Tu marcación original fue restaurada correctamente."
            : "Tu oposición fue registrada. Un supervisor la revisará."}
        </p>
      </div>
    );
  }

  if (!info) return null;

  if (info.vencido || info.consolidada) {
    return (
      <div className="bg-white rounded-xl shadow p-8 text-center">
        <AlertCircle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-slate-800 mb-2">Plazo vencido</h2>
        <p className="text-slate-500 text-sm">
          El plazo de 48 horas para oponerse ya venció. La modificación fue consolidada.
        </p>
      </div>
    );
  }

  if (info.yaOpuesta) {
    return (
      <div className="bg-white rounded-xl shadow p-8 text-center">
        <CheckCircle2 className="w-12 h-12 text-blue-500 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-slate-800 mb-2">Ya opusiste</h2>
        <p className="text-slate-500 text-sm">Ya registraste tu oposición previamente.</p>
      </div>
    );
  }

  const tipoLabel = info.tipo === "entrada" ? "Entrada" : "Salida";
  const fechaMarca = new Date(info.timestamp).toLocaleString("es-CL", {
    timeZone: "America/Santiago",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  return (
    <div className="bg-white rounded-xl shadow">
      <div className="p-6 border-b border-slate-100">
        <div className="flex items-center gap-3 mb-1">
          <Shield className="w-5 h-5 text-red-500" />
          <h1 className="text-lg font-semibold text-slate-800">Oposición a Modificación</h1>
        </div>
        <p className="text-sm text-slate-500">Res. Exenta N°38 — DT Chile</p>
      </div>

      <div className="p-6 space-y-4">
        <div className="bg-slate-50 rounded-lg p-4 text-sm space-y-2">
          <div className="flex justify-between">
            <span className="text-slate-500">Trabajador</span>
            <span className="font-medium">{info.guardiaName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">RUT</span>
            <span>{info.guardiaRut}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Instalación</span>
            <span className="font-medium">{info.installationName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Tipo</span>
            <span>{tipoLabel}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Nueva marca</span>
            <span className="font-semibold text-amber-600">{fechaMarca}</span>
          </div>
          {info.modificationReason && (
            <div className="flex justify-between">
              <span className="text-slate-500">Motivo</span>
              <span className="text-right max-w-[60%]">{info.modificationReason}</span>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Motivo de su oposición <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
              placeholder="Explique por qué no está de acuerdo con esta modificación..."
              required
              minLength={5}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting || reason.trim().length < 5}
            className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium py-3 rounded-lg text-sm transition-colors"
          >
            {submitting ? "Enviando..." : "Registrar Oposición"}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "oposicion\|OpposicionMarcacion" | head -5
```

Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/app/marcacion/ src/components/ops/OpposicionMarcacionForm.tsx
git commit -m "feat(ui): página pública de oposición de marcación con formulario"
```

---

### Task 9: Cron — consolidar marcaciones vencidas

**Files:**
- Create: `src/app/api/cron/consolidar-marcaciones/route.ts`

- [ ] **Step 1: Crear la ruta**

```typescript
/**
 * Cron: consolidar marcaciones modificadas cuyo plazo de 48h venció
 * sin que el trabajador se oponga.
 *
 * Schedule: cada hora (vercel.json)
 * Auth: CRON_SECRET header
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization");
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const PLAZO_MS = 48 * 60 * 60 * 1000;
  const cutoff = new Date(Date.now() - PLAZO_MS);

  // Marcaciones modificadas, con plazo vencido, sin oposición y sin consolidar
  const result = await prisma.opsMarcacion.updateMany({
    where: {
      isModified: true,
      modifiedAt: { lte: cutoff },
      opposedAt: null,
      consolidatedAt: null,
      deletedAt: null,
    },
    data: {
      consolidatedAt: new Date(),
    },
  });

  console.log(`[CRON] consolidar-marcaciones: ${result.count} consolidadas`);

  return NextResponse.json({ success: true, consolidated: result.count });
}
```

- [ ] **Step 2: Agregar cron a vercel.json**

Abrir `vercel.json`. El array `crons` termina con el último entry. Agregar antes del cierre `]`:

```json
{"path":"/api/cron/consolidar-marcaciones","schedule":"0 * * * *"}
```

- [ ] **Step 3: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "consolidar" | head -5
```

Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/consolidar-marcaciones/ vercel.json
git commit -m "feat(cron): auto-consolidar marcaciones modificadas tras 48h sin oposición"
```

---

## Resumen Parte 1

Al finalizar estos 10 pasos (Tasks 1–9 + vercel.json), el sistema tendrá:

- ✅ 5 campos de oposición en `OpsMarcacion` (migración aplicada)
- ✅ Módulo `reportes_dt` en sistema de permisos (rrhh + jefe_operaciones con view)
- ✅ `MarcacionModificadaBadge` con estados pendiente/opuesta/consolidada
- ✅ Rutas `/marcacion/oposicion/*` exentas de autenticación
- ✅ Email de aviso de modificación con link único
- ✅ PATCH enriquecido que genera token + envía email
- ✅ API pública de oposición (GET info + POST oponerse)
- ✅ Página pública con formulario de oposición
- ✅ Cron de consolidación automática cada hora

**Continuar con:** `docs/superpowers/plans/sprint2-plan-part2.md`
