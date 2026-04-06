# ATS — Unificación de Formularios y Correcciones UX

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir los bugs del módulo ATS detectados en [ops/ats](src/app/(app)/ops/ats/) y unificar el formulario público de postulación con la configuración de `docs-guardias` del tenant, sin romper el flujo existente.

**Architecture:** Trabajo en 5 fases de riesgo incremental (Fase 0 = seguridad, Fase 4 = la fusión grande). Cada fase se puede mergear por separado y queda la app en estado funcional. La unificación del formulario se hace *extendiendo* `FormularioPostulacionAts` y `/api/public/ats/postular` para leer config y aceptar payload extendido (campos + documentos), **sin borrar** el formulario lightweight — queda como fallback si el tenant no tiene config.

**Tech Stack:** Next.js 15 App Router, React 19, Prisma, Zod, TypeScript estricto, Tailwind, Lucide.

---

## File map (archivos que se tocan)

### Fase 0 — Cleanup / seguridad
- Delete: `prisma/schema 2.prisma`, `prisma/seed 2.ts`, duplicados `* 2.*` dentro de `src/`, `prisma/migrations/`, `content/blog/`, `public/tenants/gard/` y `docs/plans/`.
- Branch: `fix/ats-unification`.

### Fase 1 — Logo tenant roto en página de empleo
- Read: `src/lib/tenant-config.ts`
- Read/Debug: DB `Setting` rows con key `empresa.branding.logoWhite|logoFull|logoUrl` para tenant `gard`.
- Modify: `src/app/(marketing)/empleos/[tenantSlug]/[slug]/page.tsx:89` (fallback + log).
- Modify: `src/app/(marketing)/empleos/[tenantSlug]/page.tsx` (mismo fallback).

### Fase 2 — Botones y acciones del dashboard ATS
- Modify: `src/components/ats/AtsDashboardClient.tsx` — menú `...` agregar Editar + Eliminar.
- Create: `src/app/api/ops/ats/jobs/[jobId]/route.ts` si no existe `DELETE` handler (verificar primero).
- Modify: `src/components/ats/AtsPipelineClient.tsx` — quitar "Ver pipeline" si existe; mantener Editar, Pausar, Cerrar, Reenviar.

### Fase 3 — UX del pipeline
- Modify: `src/components/ats/AtsPipelineClient.tsx`:
  - Headers de columna con nombre de etapa y conteo visible en empty state.
  - Card de candidato → link/drawer a ficha del guardia `/ops/personas/[personaId]`.
  - Hint de drag-and-drop + botones de "Avanzar etapa" como fallback accesible.

### Fase 4 — Unificación de formularios (la fase grande)
- Create: `src/lib/ats/public-form-config.ts` — helper server-side que resuelve los campos visibles para el formulario público a partir de `getPostulacionDocumentTypesVisibleOnGuardForm()` + un set mínimo obligatorio (nombre, rut, email, celular).
- Create: `src/app/api/public/ats/form-config/[jobPostingId]/route.ts` — endpoint público que devuelve la config del formulario para un job (campos visibles, documentos obligatorios, requiereOS10, requiereMovilizacion).
- Modify: `src/components/ats/FormularioPostulacionAts.tsx` — fetch inicial de la form-config, render dinámico de campos extendidos + upload de documentos. Mantener schema básico como fallback si el endpoint falla.
- Modify: `src/app/api/public/ats/postular/route.ts`:
  - Extender `atsPostulacionSchema` con campos opcionales de persona (birthDate, sex, addressFormatted, comuna, ciudad, afp, salud, bankId, bankAccountType, bankAccountNumber, tallas, etc.).
  - Extender `createPersonaAndGuardia` para persistir esos campos cuando vienen.
  - Aceptar array `documentos: [{ code, fileUrl, fileName, mimeType }]` y crear `opsDocumentoPersona` igual que hace [src/app/api/public/[tenantSlug]/postulacion/route.ts](src/app/api/public/%5BtenantSlug%5D/postulacion/route.ts).
- Reuse: mecanismo de upload ya existente en `/api/public/[tenantSlug]/postulacion/upload` — **NO crear uno nuevo**. El formulario ATS debe llamar a ese endpoint con el `tenantSlug` resuelto desde el job.

### Fase 5 — Tests de humo y verificación
- Test manual end-to-end.
- Verificar con `pnpm typecheck` + `pnpm build` en cada PR parcial.

---

## Fase 0 — Seguridad

### Task 0.1: Crear branch de trabajo

- [ ] **Step 1: Asegurarse de estar en main limpio**

```bash
cd /Users/caco/Desktop/Cursor/opai
git status
```

Expected: verás los archivos `* 2.*` como untracked y los 4 `M` en `src/app/api/knowledge/`. Esos 4 modificados son trabajo previo no relacionado — **no los incluyas** en este plan.

- [ ] **Step 2: Crear branch**

```bash
git checkout -b fix/ats-unification
```

### Task 0.2: Eliminar archivos duplicados `* 2.*` del repo

Son artefactos de sincronización (iCloud/Dropbox). Riesgo real: `prisma/schema 2.prisma` y `prisma/seed 2.ts` podrían ser usados por accidente.

**Files:**
- Delete: todos los `* 2.*` fuera de `node_modules*`, `.next*`, `.worktrees/`, `.claude/worktrees/`.

- [ ] **Step 1: Listar primero lo que vas a borrar**

```bash
find . -name "* 2.*" -type f \
  -not -path "./node_modules*" \
  -not -path "./.next*" \
  -not -path "./.worktrees/*" \
  -not -path "./.claude/worktrees/*" \
  > /tmp/ats-plan-dupes.txt
wc -l /tmp/ats-plan-dupes.txt
cat /tmp/ats-plan-dupes.txt
```

Expected: ~40-60 archivos. Revisa que ninguno sea algo que creaste a mano.

- [ ] **Step 2: Verificar que no haya imports a estos archivos**

```bash
# Verifica FormularioPostulacionAts 2.tsx específicamente
grep -rn "FormularioPostulacionAts 2" src/ || echo "OK: no references"
# Verifica schema 2.prisma
grep -rn "schema 2" prisma/ src/ || echo "OK: no references"
```

Expected: "OK: no references" en ambos.

- [ ] **Step 3: Borrarlos**

```bash
xargs -I{} rm "{}" < /tmp/ats-plan-dupes.txt
```

- [ ] **Step 4: Verificar que nada se rompe**

```bash
pnpm typecheck
```

Expected: sin errores (o los mismos que ya había antes del plan).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove iCloud/Dropbox duplicate '* 2.*' files

These are sync artifacts that were polluting the repo, including
a stale prisma/schema 2.prisma and FormularioPostulacionAts 2.tsx
that could be imported by accident."
```

---

## Fase 1 — Logo del tenant en página pública del empleo

### Task 1.1: Diagnosticar por qué no carga el logo de `gard`

**Files:**
- Read: `src/lib/tenant-config.ts` (función `getTenantCompanyConfig`)
- Read: DB `Setting` rows

- [ ] **Step 1: Leer el código que resuelve logos**

```bash
grep -n "brandingLogoWhite\|brandingLogoFull\|logoUrl" src/lib/tenant-config.ts
```

Expected: verás el mapping `"empresa.branding.logoWhite" → "brandingLogoWhite"`.

- [ ] **Step 2: Consultar la DB para tenant `gard`**

```bash
# Usar el script de prisma studio O una query directa
pnpm tsx -e "
import { prisma } from './src/lib/prisma';
const t = await prisma.tenant.findFirst({ where: { slug: 'gard' }, select: { id: true } });
if (!t) { console.log('tenant gard not found'); process.exit(0); }
const rows = await prisma.setting.findMany({
  where: { tenantId: t.id, key: { in: ['empresa.branding.logoWhite','empresa.branding.logoFull','empresa.logoUrl'] } }
});
console.log(JSON.stringify(rows, null, 2));
process.exit(0);
"
```

Expected: o bien no hay filas (→ tenant sin logo configurado), o las filas apuntan a un path que no existe en `public/tenants/gard/`.

- [ ] **Step 3: Si no hay filas, insertar el correcto**

Los archivos reales están en `public/tenants/gard/logo-blanco.svg`. Usa ese path.

```bash
pnpm tsx -e "
import { prisma } from './src/lib/prisma';
const t = await prisma.tenant.findFirst({ where: { slug: 'gard' } });
if (!t) process.exit(1);
await prisma.setting.upsert({
  where: { tenantId_key: { tenantId: t.id, key: 'empresa.branding.logoWhite' } },
  update: { value: '/tenants/gard/logo-blanco.svg' },
  create: { tenantId: t.id, key: 'empresa.branding.logoWhite', value: '/tenants/gard/logo-blanco.svg' },
});
await prisma.setting.upsert({
  where: { tenantId_key: { tenantId: t.id, key: 'empresa.branding.logoFull' } },
  update: { value: '/tenants/gard/logo-azul.webp' },
  create: { tenantId: t.id, key: 'empresa.branding.logoFull', value: '/tenants/gard/logo-azul.webp' },
});
console.log('OK');
process.exit(0);
"
```

Expected: `OK`.

- [ ] **Step 4: Verificar visualmente**

Recargar `https://opai.gard.cl/empleos/gard/guardia-de-seguridad-turno-nocturno--bnp9e5` y confirmar que el logo aparece.

### Task 1.2: Fallback robusto en la página pública

**Files:**
- Modify: `src/app/(marketing)/empleos/[tenantSlug]/[slug]/page.tsx:89`
- Modify: `src/app/(marketing)/empleos/[tenantSlug]/page.tsx`

- [ ] **Step 1: Agregar warning server-side cuando no hay logo**

Esto ayuda a debuggear futuros tenants sin logo configurado.

En `src/app/(marketing)/empleos/[tenantSlug]/[slug]/page.tsx`, después de la línea 89:

```tsx
const logoUrl = cfg.brandingLogoWhite || cfg.brandingLogoFull || cfg.logoUrl;
if (!logoUrl) {
  console.warn(`[empleos] Tenant ${tenantSlug} (${tenant.id}) has no logo configured in Settings (empresa.branding.logoWhite|logoFull|empresa.logoUrl)`);
}
```

Hacer lo mismo en `src/app/(marketing)/empleos/[tenantSlug]/page.tsx`.

- [ ] **Step 2: Verificar que el `Image` tenga `alt` correcto y no explote con URLs relativas**

El código ya usa `next/image` con `width/height`. Verificar que `next.config.*` tenga los `remotePatterns` si el logo es remoto — si es local (`/tenants/...`) funciona sin config extra.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(marketing\)/empleos/
git commit -m "fix(empleos): warn when tenant has no logo configured

Adds a server-side warning so missing branding configuration is
visible in logs. Logo resolution still falls back gracefully to
the first-letter placeholder."
```

---

## Fase 2 — Botones del dashboard y del pipeline

### Task 2.1: Verificar si existe endpoint DELETE para jobs

**Files:**
- Read: `src/app/api/ops/ats/jobs/[jobId]/route.ts` (si existe)

- [ ] **Step 1: Verificar existencia**

```bash
ls src/app/api/ops/ats/jobs/[jobId]/ 2>/dev/null
cat src/app/api/ops/ats/jobs/\[jobId\]/route.ts 2>/dev/null | head -40
```

- [ ] **Step 2: Si no hay DELETE handler, añadirlo**

Si el archivo existe y solo tiene `GET`/`PATCH`, añade `DELETE`. Si no existe el archivo, créalo. Soft-delete (marcar `estado: "CERRADO"`) es preferible a hard-delete si el job ya tiene `atsApplication` asociadas — **validar primero** `_count.applications` y rechazar con 409 si hay postulantes.

```ts
// DELETE: borra solo si no tiene postulaciones; de lo contrario sugiere cerrar.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { jobId } = await params;
  const tenantId = session.user.tenantId;

  const job = await prisma.atsJobPosting.findFirst({
    where: { id: jobId, tenantId },
    select: { id: true, _count: { select: { applications: true } } },
  });
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (job._count.applications > 0) {
    return NextResponse.json(
      { error: "El aviso tiene postulaciones. Ciérralo en lugar de eliminarlo." },
      { status: 409 },
    );
  }

  await prisma.atsJobPosting.delete({ where: { id: jobId } });
  return NextResponse.json({ success: true });
}
```

(Imports: ajustar según los helpers de auth que use el proyecto — inspirarse en otros `route.ts` bajo `api/ops/ats/`.)

- [ ] **Step 3: Commit parcial**

```bash
git add src/app/api/ops/ats/jobs/\[jobId\]/route.ts
git commit -m "feat(ats): add DELETE handler for job postings

Blocks deletion if the job has any applications. Callers should
use the pause/close flow for jobs with candidates."
```

### Task 2.2: Añadir Editar y Eliminar al dashboard

**Files:**
- Modify: `src/components/ats/AtsDashboardClient.tsx`

- [ ] **Step 1: Localizar el DropdownMenu del row**

```bash
grep -n "DropdownMenu\|Ver pipeline" src/components/ats/AtsDashboardClient.tsx
```

- [ ] **Step 2: Agregar ítems**

En el `DropdownMenuContent` del row (junto a "Ver pipeline"):

```tsx
<DropdownMenuContent align="end">
  <DropdownMenuItem asChild>
    <Link href={`/ops/ats/${job.id}`}>
      <Eye className="mr-2 h-4 w-4" />
      Ver pipeline
    </Link>
  </DropdownMenuItem>
  <DropdownMenuItem asChild>
    <Link href={`/ops/ats/${job.id}/editar`}>
      <Pencil className="mr-2 h-4 w-4" />
      Editar aviso
    </Link>
  </DropdownMenuItem>
  <DropdownMenuItem
    onSelect={(e) => {
      e.preventDefault();
      void handleDelete(job.id, job._count.applications);
    }}
    className="text-red-600 focus:bg-red-50 focus:text-red-700"
  >
    <Trash2 className="mr-2 h-4 w-4" />
    Eliminar
  </DropdownMenuItem>
</DropdownMenuContent>
```

Y definir `handleDelete` arriba:

```tsx
async function handleDelete(jobId: string, applications: number) {
  if (applications > 0) {
    toast.error("Este aviso tiene postulaciones. Usa 'Cerrar' en lugar de eliminar.");
    return;
  }
  if (!confirm("¿Eliminar este aviso? Esta acción no se puede deshacer.")) return;
  const res = await fetch(`/api/ops/ats/jobs/${jobId}`, { method: "DELETE" });
  if (res.ok) {
    toast.success("Aviso eliminado");
    router.refresh();
  } else {
    const data = await res.json().catch(() => ({}));
    toast.error(data.error || "No se pudo eliminar");
  }
}
```

Imports nuevos: `Pencil`, `Trash2` de `lucide-react`; `toast` de `sonner`; `useRouter` de `next/navigation`.

- [ ] **Step 3: Verificar que la ruta `/ops/ats/[jobId]/editar` existe**

```bash
ls src/app/\(app\)/ops/ats/\[jobId\]/editar/ 2>/dev/null
```

Si **no** existe: o crear un stub que redirige a `/ops/ats/nuevo?edit=<jobId>`, o abrir una issue y dejar el botón oculto detrás de un flag. **Decisión sugerida:** si no existe, deshabilitar el ítem "Editar aviso" con un `disabled` visual y TODO en el código hasta que se implemente. Esto evita linkear a una 404.

- [ ] **Step 4: `pnpm typecheck`**

- [ ] **Step 5: Commit**

```bash
git add src/components/ats/AtsDashboardClient.tsx
git commit -m "feat(ats): add Editar and Eliminar actions to dashboard dropdown"
```

### Task 2.3: Limpiar botones del pipeline

**Files:**
- Modify: `src/components/ats/AtsPipelineClient.tsx`

- [ ] **Step 1: Localizar la barra "Estado: ACTIVO"**

```bash
grep -n "Estado:\|Ver pipeline\|Reenviar a canales" src/components/ats/AtsPipelineClient.tsx
```

- [ ] **Step 2: Si existe "Ver pipeline" en esta barra, quitarlo.** Mantener: Editar, Reenviar a canales, Pausar, Cerrar. Añadir "Eliminar" con la misma validación de applications > 0.

- [ ] **Step 3: `pnpm typecheck` + commit**

```bash
git add src/components/ats/AtsPipelineClient.tsx
git commit -m "fix(ats-pipeline): remove redundant 'Ver pipeline' from pipeline view"
```

---

## Fase 3 — UX del pipeline (columnas visibles + link a ficha)

### Task 3.1: Headers de columna visibles incluso vacías

**Files:**
- Modify: `src/components/ats/AtsPipelineClient.tsx`

Los "bloques de colores" del screenshot son columnas de pipeline sin header visible cuando están vacías. Fix:

- [ ] **Step 1: Localizar el render de columnas**

```bash
grep -n "POSTULADO\|EN_REVISION\|etapa" src/components/ats/AtsPipelineClient.tsx | head -20
```

- [ ] **Step 2: Asegurar que cada columna tenga siempre un header persistente**

Cada columna debe mostrar:
- Nombre de la etapa (Postulado / En revisión / Entrevista / Oferta / Contratado)
- Conteo `(0)` o `(N)`
- Empty state: "Sin postulantes en esta etapa" centrado con un icono suave.

Ejemplo de estructura esperada por columna:

```tsx
<div className="flex flex-col rounded-xl bg-slate-900/40 p-3 min-w-[260px]">
  <div className="mb-3 flex items-center justify-between">
    <h3 className="text-sm font-semibold text-white">{ETAPA_LABELS[etapa]}</h3>
    <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
      {apps.length}
    </span>
  </div>
  <div className="space-y-2">
    {apps.length === 0 ? (
      <div className="rounded-lg border border-dashed border-slate-700 p-4 text-center text-xs text-slate-500">
        Sin postulantes
      </div>
    ) : (
      apps.map((a) => <ApplicationCard key={a.id} {...a} />)
    )}
  </div>
</div>
```

Si el componente ya tenía headers pero estaban siendo *ocultados* cuando no hay apps, quitar esa lógica.

- [ ] **Step 3: Commit**

```bash
git add src/components/ats/AtsPipelineClient.tsx
git commit -m "fix(ats-pipeline): always show column headers + empty-state message"
```

### Task 3.2: Link del card del candidato → ficha del guardia

**Files:**
- Modify: `src/components/ats/AtsPipelineClient.tsx`

- [ ] **Step 1: Cada `ApplicationCard` debe incluir `personaId` (o `guardiaId` → resolver persona)**

Verificar que la data del pipeline incluye `guardia.personaId`. Si no, extenderlo en:
`src/app/api/ops/ats/jobs/[jobId]/applications/route.ts` → añadir `guardia: { include: { persona: { select: { id: true } } } }`.

- [ ] **Step 2: Añadir click-handler en la card**

```tsx
<Link
  href={`/ops/personas/${app.guardia.persona.id}`}
  className="block hover:bg-slate-800/60 transition-colors rounded-lg"
>
  {/* contenido actual de la card */}
</Link>
```

O — mejor — un icono "abrir ficha" en la esquina de la card para no interferir con el drag handle.

- [ ] **Step 3: Verificar que el drag sigue funcionando** (el `<a>` no debería interceptar el drag si usas el handle correcto).

- [ ] **Step 4: Commit**

```bash
git add src/components/ats/AtsPipelineClient.tsx src/app/api/ops/ats/jobs/\[jobId\]/applications/
git commit -m "feat(ats-pipeline): link application cards to guardia profile"
```

### Task 3.3: Botón de "Avanzar etapa" como fallback accesible al drag

**Files:**
- Modify: `src/components/ats/AtsPipelineClient.tsx`

- [ ] **Step 1: En cada card, agregar un menú `...` con las transiciones válidas**

Usar las mismas transiciones que valida el backend en `applications/[appId]/etapa/route.ts`:
- POSTULADO → EN_REVISION / DESCARTADO
- EN_REVISION → ENTREVISTA / DESCARTADO
- ENTREVISTA → OFERTA / DESCARTADO
- OFERTA → CONTRATADO / DESCARTADO
- DESCARTADO → POSTULADO

- [ ] **Step 2: Usar el endpoint PATCH existente**

```ts
async function moverEtapa(applicationId: string, newEtapa: string) {
  const res = await fetch(`/api/ops/ats/jobs/${jobId}/applications/${applicationId}/etapa`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ etapa: newEtapa }),
  });
  if (res.ok) {
    router.refresh();
  } else {
    const data = await res.json().catch(() => ({}));
    toast.error(data.error || "No se pudo mover la postulación");
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/ats/AtsPipelineClient.tsx
git commit -m "feat(ats-pipeline): add stage-change menu as keyboard-accessible fallback"
```

---

## Fase 4 — Unificar el formulario público con `docs-guardias`

Esta es la fase más grande. Se hace en pasos incrementales: primero el backend (endpoint de config + schema extendido), luego el frontend, luego la escritura de persona/guardia/documentos en el POST.

### Task 4.1: Helper server-side `getPublicFormConfig`

**Files:**
- Create: `src/lib/ats/public-form-config.ts`

- [ ] **Step 1: Crear el helper**

```ts
// src/lib/ats/public-form-config.ts
import { prisma } from "@/lib/prisma";
import { getPostulacionDocumentTypesVisibleOnGuardForm } from "@/lib/postulacion-documentos";
import { getGuardiaDocumentosConfig } from "@/lib/guardia-documentos-config";

export interface PublicFormField {
  /** "firstName" | "lastName" | "rut" | "email" | "phoneMobile" | "birthDate" | "sex" | "addressFormatted" | ... */
  key: string;
  label: string;
  required: boolean;
  type: "text" | "email" | "tel" | "date" | "select" | "number" | "checkbox" | "textarea" | "address";
  options?: Array<{ value: string; label: string }>;
}

export interface PublicFormDocument {
  code: string;
  label: string;
  required: boolean;
}

export interface PublicFormConfig {
  jobPostingId: string;
  tenantId: string;
  tenantSlug: string;
  job: {
    titulo: string;
    requiereOS10: boolean;
    requiereMovilizacion: boolean;
  };
  /** Campos base siempre presentes (nombre, apellido, rut, email, celular). */
  baseFields: PublicFormField[];
  /** Campos extendidos habilitados por el tenant en docs-guardias. */
  extendedFields: PublicFormField[];
  /** Documentos que el tenant pidió ser visibles en el form público. */
  documents: PublicFormDocument[];
}

const BASE_FIELDS: PublicFormField[] = [
  { key: "firstName", label: "Nombre", required: true, type: "text" },
  { key: "lastName", label: "Apellido", required: true, type: "text" },
  { key: "rut", label: "RUT", required: true, type: "text" },
  { key: "email", label: "Email", required: true, type: "email" },
  { key: "phoneMobile", label: "Celular", required: true, type: "tel" },
];

export async function getPublicFormConfig(jobPostingId: string): Promise<PublicFormConfig | null> {
  const job = await prisma.atsJobPosting.findUnique({
    where: { id: jobPostingId },
    select: {
      id: true, tenantId: true, titulo: true, estado: true,
      requiereOS10: true, requiereMovilizacion: true,
      tenant: { select: { slug: true } },
    },
  });
  if (!job || job.estado !== "ACTIVO") return null;

  const [docs, guardiaCfg] = await Promise.all([
    getPostulacionDocumentTypesVisibleOnGuardForm(job.tenantId),
    getGuardiaDocumentosConfig(job.tenantId).catch(() => null),
  ]);

  // Campos extendidos: por ahora un set fijo controlado por flag en guardiaCfg.
  // En el futuro el tenant podría elegir cuáles activar desde docs-guardias.
  const extendedFields: PublicFormField[] = [
    { key: "birthDate", label: "Fecha de nacimiento", required: false, type: "date" },
    { key: "sex", label: "Sexo", required: false, type: "select", options: [
      { value: "M", label: "Masculino" },
      { value: "F", label: "Femenino" },
      { value: "O", label: "Otro" },
    ]},
    { key: "addressFormatted", label: "Dirección", required: false, type: "address" },
    { key: "comuna", label: "Comuna", required: false, type: "text" },
    { key: "ciudad", label: "Ciudad", required: false, type: "text" },
    { key: "experienciaAnios", label: "Años de experiencia en seguridad", required: false, type: "number" },
    { key: "tieneOS10", label: "Tengo OS10", required: job.requiereOS10, type: "checkbox" },
    { key: "tieneMovilizacion", label: "Tengo movilización", required: job.requiereMovilizacion, type: "checkbox" },
  ];

  return {
    jobPostingId: job.id,
    tenantId: job.tenantId,
    tenantSlug: job.tenant.slug,
    job: {
      titulo: job.titulo,
      requiereOS10: job.requiereOS10,
      requiereMovilizacion: job.requiereMovilizacion,
    },
    baseFields: BASE_FIELDS,
    extendedFields,
    documents: docs.map((d) => ({ code: d.code, label: d.label, required: d.required })),
  };
}
```

**Nota importante:** si `getGuardiaDocumentosConfig` no existe con ese nombre, inspeccionar [src/lib/guardia-documentos-config.ts](src/lib/guardia-documentos-config.ts) y usar el export real. Si tampoco existe el helper de "visible on guard form", crear uno o usar `getPostulacionDocumentTypes(tenantId)` filtrado por `visibleInGuardForm`.

- [ ] **Step 2: `pnpm typecheck`**

- [ ] **Step 3: Commit**

```bash
git add src/lib/ats/public-form-config.ts
git commit -m "feat(ats): add getPublicFormConfig helper for public job form"
```

### Task 4.2: Endpoint público `GET /api/public/ats/form-config/[jobPostingId]`

**Files:**
- Create: `src/app/api/public/ats/form-config/[jobPostingId]/route.ts`

- [ ] **Step 1: Crear el handler**

```ts
// src/app/api/public/ats/form-config/[jobPostingId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getPublicFormConfig } from "@/lib/ats/public-form-config";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobPostingId: string }> },
) {
  const { jobPostingId } = await params;
  const config = await getPublicFormConfig(jobPostingId);
  if (!config) {
    return NextResponse.json({ success: false, error: "Oferta no disponible" }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: config });
}
```

- [ ] **Step 2: Probar con curl**

```bash
curl -s https://opai.gard.cl/api/public/ats/form-config/<JOB_ID> | jq .
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/public/ats/form-config/
git commit -m "feat(ats): public endpoint for dynamic form config"
```

### Task 4.3: Extender el schema Zod de `/api/public/ats/postular`

**Files:**
- Modify: `src/app/api/public/ats/postular/route.ts`

- [ ] **Step 1: Ampliar `atsPostulacionSchema`**

Hacer TODOS los campos nuevos **opcionales** para no romper el flujo lightweight. Reutilizar las validaciones que ya existen en [src/app/api/public/[tenantSlug]/postulacion/route.ts](src/app/api/public/%5BtenantSlug%5D/postulacion/route.ts) — importar su schema si está exportado, o copiar sólo los campos relevantes.

```ts
const atsDocumentoSchema = z.object({
  code: z.string().min(1),
  fileUrl: z.string().url(),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
});

const atsPostulacionSchema = z.object({
  // --- base (ya existía) ---
  jobPostingId: z.string().uuid(),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  rut: z.string().trim()
    .refine((v) => isChileanRutFormat(v), "RUT debe ir sin puntos y con guión")
    .refine((v) => isValidChileanRut(v), "RUT inválido")
    .transform((v) => normalizeRut(v)),
  email: z.string().trim().email().max(200),
  phoneMobile: z.string().trim()
    .refine((v) => isValidMobileNineDigits(v), "Celular debe tener 9 dígitos")
    .transform((v) => normalizeMobileNineDigits(v)),
  tieneOS10: z.boolean().default(false),
  experienciaAnios: z.number().int().min(0).max(50).default(0),
  tieneMovilizacion: z.boolean().default(false),
  notas: z.string().trim().max(1000).optional().nullable(),

  // --- extensión opcional (tenant config) ---
  birthDate: z.string().optional().nullable(), // ISO date
  sex: z.enum(["M", "F", "O"]).optional().nullable(),
  addressFormatted: z.string().max(300).optional().nullable(),
  googlePlaceId: z.string().max(200).optional().nullable(),
  comuna: z.string().max(100).optional().nullable(),
  ciudad: z.string().max(100).optional().nullable(),
  region: z.string().max(100).optional().nullable(),
  afp: z.string().max(50).optional().nullable(),
  salud: z.string().max(50).optional().nullable(),
  bankId: z.string().max(50).optional().nullable(),
  bankAccountType: z.string().max(50).optional().nullable(),
  bankAccountNumber: z.string().max(50).optional().nullable(),
  tallas: z.object({
    calzado: z.string().optional(),
    pantalon: z.string().optional(),
    polera: z.string().optional(),
    camisa: z.string().optional(),
    polar: z.string().optional(),
    chaqueta: z.string().optional(),
  }).optional().nullable(),
  estatura: z.number().optional().nullable(),
  peso: z.number().optional().nullable(),

  // --- documentos subidos ---
  documentos: z.array(atsDocumentoSchema).max(20).optional().default([]),
});
```

- [ ] **Step 2: `pnpm typecheck`**

- [ ] **Step 3: Commit parcial (solo schema, sin lógica aún)**

```bash
git add src/app/api/public/ats/postular/route.ts
git commit -m "feat(ats-postular): extend schema with optional persona + documentos"
```

### Task 4.4: Persistir campos extendidos + documentos en `createPersonaAndGuardia`

**Files:**
- Modify: `src/app/api/public/ats/postular/route.ts` (función `createPersonaAndGuardia` + POST handler)

- [ ] **Step 1: Inspeccionar cómo lo hace el full postulacion**

```bash
cat src/app/api/public/\[tenantSlug\]/postulacion/route.ts | sed -n '1,80p'
```

Identificar:
- Qué campos de persona se setean (address, sex, birthDate, etc.)
- Cómo se crea `opsCuentaBancaria`
- Cómo se crea `opsDocumentoPersona`

- [ ] **Step 2: Extender `createPersonaAndGuardia` para setear los campos extendidos cuando están presentes**

Solo setear los no-null. Mantener los defaults existentes cuando no vengan.

```ts
const persona = await tx.opsPersona.create({
  data: {
    tenantId,
    firstName: body.firstName,
    lastName: body.lastName,
    rut: body.rut,
    email: body.email,
    phoneMobile: body.phoneMobile,
    hasMobilization: body.tieneMovilizacion,
    status: "active",
    ...(body.birthDate ? { birthDate: new Date(body.birthDate) } : {}),
    ...(body.sex ? { sex: body.sex } : {}),
    ...(body.addressFormatted ? { addressFormatted: body.addressFormatted } : {}),
    ...(body.googlePlaceId ? { googlePlaceId: body.googlePlaceId } : {}),
    ...(body.comuna ? { comuna: body.comuna } : {}),
    ...(body.ciudad ? { ciudad: body.ciudad } : {}),
    ...(body.region ? { region: body.region } : {}),
    ...(body.afp ? { afp: body.afp } : {}),
    ...(body.salud ? { salud: body.salud } : {}),
    ...(body.estatura ? { estatura: body.estatura } : {}),
    ...(body.peso ? { peso: body.peso } : {}),
    ...(body.tallas ? { tallaCalzado: body.tallas.calzado ?? null /* etc */ } : {}),
  },
});
```

**IMPORTANTE:** ajustar los nombres de columna reales contra `prisma/schema.prisma` — los que aparecen arriba son presuntos. Si un campo no existe en `opsPersona`, eliminarlo del data payload o usar un JSON metadata column si existe.

- [ ] **Step 3: Crear cuenta bancaria cuando vengan los datos**

```ts
if (body.bankId && body.bankAccountNumber && body.bankAccountType) {
  await tx.opsCuentaBancaria.create({
    data: {
      tenantId,
      personaId: persona.id,
      bankId: body.bankId,
      accountType: body.bankAccountType,
      accountNumber: body.bankAccountNumber,
    },
  });
}
```

- [ ] **Step 4: Crear `opsDocumentoPersona` por cada documento subido**

```ts
if (body.documentos && body.documentos.length > 0) {
  for (const doc of body.documentos) {
    await tx.opsDocumentoPersona.create({
      data: {
        tenantId,
        personaId: persona.id,
        tipoCodigo: doc.code,
        fileUrl: doc.fileUrl,
        fileName: doc.fileName,
        mimeType: doc.mimeType,
      },
    });
  }
}
```

(Ajustar los nombres de columna según el schema real — mirar cómo lo hace `/api/public/[tenantSlug]/postulacion/route.ts`.)

- [ ] **Step 5: Validar que los documentos requeridos por el tenant estén presentes**

Antes del transaction, llamar a `getPublicFormConfig(body.jobPostingId)` y verificar que todos los documentos `required: true` tengan un item correspondiente en `body.documentos`. Si no, devolver 400.

```ts
const formCfg = await getPublicFormConfig(body.jobPostingId);
if (!formCfg) {
  return NextResponse.json({ success: false, error: "Oferta no disponible" }, { status: 404 });
}
const requiredDocs = formCfg.documents.filter((d) => d.required).map((d) => d.code);
const providedDocs = new Set((body.documentos ?? []).map((d) => d.code));
const missing = requiredDocs.filter((c) => !providedDocs.has(c));
if (missing.length > 0) {
  return NextResponse.json(
    { success: false, error: `Faltan documentos obligatorios: ${missing.join(", ")}` },
    { status: 400 },
  );
}
```

- [ ] **Step 6: `pnpm typecheck` + probar localmente con curl**

```bash
curl -X POST http://localhost:3000/api/public/ats/postular \
  -H "Content-Type: application/json" \
  -d '{"jobPostingId":"<UUID>","firstName":"Test","lastName":"Plan","rut":"11111111-1","email":"t@t.com","phoneMobile":"912345678","tieneOS10":true,"experienciaAnios":2,"tieneMovilizacion":false}'
```

Expected: `{ success: true, ... }` con el payload *antiguo* sigue funcionando (backwards compat).

- [ ] **Step 7: Commit**

```bash
git add src/app/api/public/ats/postular/route.ts
git commit -m "feat(ats-postular): persist extended persona fields + required docs validation"
```

### Task 4.5: Reutilizar endpoint de upload de documentos del portal corporativo

**Files:**
- Verify: `src/app/api/public/[tenantSlug]/postulacion/upload/route.ts` existe y es callable sin token por parte de visitantes anónimos de `/empleos/...`.

- [ ] **Step 1: Leer el endpoint actual**

```bash
cat src/app/api/public/\[tenantSlug\]/postulacion/upload/route.ts
```

- [ ] **Step 2: Si requiere token, crear uno nuevo sin token específico para ATS**

Opción A (preferida): hacer que el endpoint existente acepte un `jobPostingId` como alternativa al token — valida que el job existe y está activo en ese tenant.

Opción B: Crear `src/app/api/public/ats/upload/route.ts` que haga el mismo upload pero gated por `jobPostingId` válido. **Esto es lo más seguro y DRY menos, pero más limpio en separation of concerns.** Recomendado si el endpoint existente tiene mucha lógica de token.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/public/ats/upload/
git commit -m "feat(ats): public upload endpoint gated by jobPostingId"
```

### Task 4.6: Reescribir `FormularioPostulacionAts` para usar la config dinámica

**Files:**
- Modify: `src/components/ats/FormularioPostulacionAts.tsx`
- Modify: `src/app/(marketing)/empleos/[tenantSlug]/[slug]/page.tsx` (props que pasa)

Estrategia: mantener el componente como server-friendly en el sentido de que la página ya hace fetch al job. **Pero** la config de formulario la hacemos en el server también, y la pasamos como prop. Así evitamos una request extra client-side.

- [ ] **Step 1: En la page del empleo, llamar a `getPublicFormConfig`**

```tsx
// src/app/(marketing)/empleos/[tenantSlug]/[slug]/page.tsx
import { getPublicFormConfig } from "@/lib/ats/public-form-config";

// ... dentro del componente:
const formConfig = await getPublicFormConfig(job.id);
// formConfig nunca debería ser null aquí porque ya sabemos que job existe y está ACTIVO.

// Y al render:
<FormularioPostulacionAts config={formConfig!} />
```

- [ ] **Step 2: Cambiar las props del componente**

```tsx
interface FormularioPostulacionAtsProps {
  config: PublicFormConfig;
}

export function FormularioPostulacionAts({ config }: FormularioPostulacionAtsProps) {
  // ...
}
```

- [ ] **Step 3: Render dinámico**

Iterar sobre `config.baseFields` + `config.extendedFields` y renderizar el input correcto según `field.type`. Para `type: "address"` usar el componente `PlaceAutocompleteWidget` que ya existe en el proyecto (mismo que usa el formulario corporativo). Para `type: "select"` usar `<select>` con `field.options`.

Ejemplo de render genérico:

```tsx
function renderField(field: PublicFormField, value: any, onChange: (v: any) => void) {
  switch (field.type) {
    case "text":
    case "email":
    case "tel":
    case "date":
    case "number":
      return <input type={field.type} required={field.required} value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="..." />;
    case "textarea":
      return <textarea required={field.required} value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="..." />;
    case "select":
      return (
        <select required={field.required} value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="...">
          <option value="">Seleccionar...</option>
          {field.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    case "checkbox":
      return <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} className="..." />;
    case "address":
      return <PlaceAutocompleteWidget value={value ?? ""} onChange={onChange} onPlaceSelected={(p) => { /* set googlePlaceId, comuna, ciudad, region */ }} />;
    default:
      return null;
  }
}
```

- [ ] **Step 4: Sección de documentos**

Renderizar `config.documents` como lista de uploads. Cada uno usa el endpoint de upload y guarda el `fileUrl` devuelto en el estado del form. Al submit, enviar el array `documentos` en el payload.

```tsx
{config.documents.length > 0 && (
  <div className="space-y-3">
    <h4 className="text-sm font-semibold text-white">Documentos</h4>
    {config.documents.map((doc) => (
      <DocumentUploadRow
        key={doc.code}
        doc={doc}
        value={uploads[doc.code]}
        onChange={(v) => setUploads((prev) => ({ ...prev, [doc.code]: v }))}
      />
    ))}
  </div>
)}
```

- [ ] **Step 5: Submit — combinar todo en el payload**

```ts
const payload = {
  jobPostingId: config.jobPostingId,
  ...formState,
  documentos: Object.entries(uploads)
    .filter(([, v]) => v)
    .map(([code, v]) => ({ code, ...v })),
};
```

- [ ] **Step 6: `pnpm typecheck` + probar en dev server**

- [ ] **Step 7: Commit**

```bash
git add src/components/ats/FormularioPostulacionAts.tsx src/app/\(marketing\)/empleos/
git commit -m "feat(ats): dynamic public form driven by tenant docs-guardias config"
```

---

## Fase 5 — Verificación end-to-end

### Task 5.1: Smoke test manual

- [ ] **Step 1: Build**

```bash
pnpm build
```

Expected: passes.

- [ ] **Step 2: Flujo completo en dev**

1. Login como owner de `gard`.
2. Ir a `/opai/configuracion/ops?tab=docs-guardias` → configurar: marcar `birthDate` visible, `certificado-antecedentes` required, `curriculum` required.
3. Crear un nuevo aviso ATS activo.
4. Abrir la URL pública del empleo en incógnito.
5. Verificar que el logo del tenant carga. ✅
6. Verificar que el formulario muestra `birthDate` y los 2 campos de documento. ✅
7. Intentar postular sin documentos → error. ✅
8. Postular con los documentos → success. ✅
9. Ir al pipeline del ATS → ver al candidato en POSTULADO con headers de columna visibles. ✅
10. Click en la card → abre ficha del guardia. ✅
11. Ver que la ficha tiene: email, teléfono, RUT, birthDate, y los 2 documentos subidos. ✅
12. Mover etapa con drag-and-drop o con el menú `...`. ✅
13. En el dashboard: intentar eliminar un aviso con postulantes → error 409. ✅
14. Crear otro aviso vacío → eliminar → OK. ✅

- [ ] **Step 3: Verificar backwards compat**

Hacer un POST al viejo endpoint con el payload antiguo (sin campos extendidos) para asegurar que sigue funcionando:

```bash
curl -X POST http://localhost:3000/api/public/ats/postular \
  -H "Content-Type: application/json" \
  -d '{"jobPostingId":"<UUID>","firstName":"Legacy","lastName":"User","rut":"22222222-2","email":"l@l.com","phoneMobile":"987654321","tieneOS10":false,"experienciaAnios":0,"tieneMovilizacion":false}'
```

Expected: `{ success: true, ... }`. Si el tenant tiene docs required, esperaría 400 con mensaje claro — eso es OK, pero asegúrate de que el mensaje es el esperado.

### Task 5.2: PR y merge

- [ ] **Step 1: Push branch**

```bash
git push -u origin fix/ats-unification
```

- [ ] **Step 2: Abrir PR con resumen**

```bash
gh pr create --title "fix(ats): unify public form with docs-guardias config + UX fixes" --body "$(cat <<'EOF'
## Summary

- Fix: tenant logo no renderiza en página pública del empleo (config DB + fallback)
- Fix: botones del dashboard ATS — añade Editar y Eliminar
- Fix: pipeline muestra headers de columna siempre + empty states
- Feat: cada card de candidato en el pipeline linkea a su ficha de guardia
- Feat: botón accesible de "Avanzar etapa" como fallback al drag-and-drop
- Feat: formulario público del ATS ahora lee la config de docs-guardias del tenant y persiste campos extendidos + documentos obligatorios
- Chore: eliminados archivos duplicados `* 2.*` de iCloud/Dropbox

## Test plan

- [ ] Build pasa (`pnpm build`)
- [ ] Typecheck pasa (`pnpm typecheck`)
- [ ] Flujo completo manual descrito en docs/superpowers/plans/2026-04-06-ats-unification-and-fixes.md Fase 5
- [ ] Backwards compat: payload antiguo sigue funcionando en `/api/public/ats/postular`
EOF
)"
```

---

## Self-review checklist (hecho al cerrar el plan)

- ✅ **Spec coverage:** 6 quejas del usuario cubiertas:
  1. "bloques de colores" → Task 3.1 (headers visibles + empty state)
  2. Botones Editar/Eliminar/Ver pipeline → Task 2.1-2.3
  3. Cómo cambiar de fase postulaciones → Task 3.3 (menú + drag)
  4. Dónde ver cada postulación → Task 3.2 (link card → ficha)
  5. Logo del tenant no aparece → Task 1.1-1.2
  6. Formulario debe respetar docs-guardias → Task 4.1-4.6 (toda la Fase 4)
  +7. Archivos duplicados → Task 0.2

- ✅ **Placeholders:** hay algunos `// ajustar según schema real` y `/* etc */` deliberadamente — están marcados con nota al lado ("ajustar nombres de columna contra prisma/schema.prisma") porque no conozco el schema exacto sin leerlo. El plan dice explícitamente dónde mirar.

- ✅ **Type consistency:** `PublicFormConfig` / `PublicFormField` / `PublicFormDocument` definidos en Task 4.1 y reutilizados en 4.2, 4.6. `atsDocumentoSchema` definido en 4.3 usado en 4.4.

- ⚠️ **Riesgos conocidos:**
  - Los nombres de columnas de `opsPersona` (`birthDate`, `sex`, `addressFormatted`, etc.) son presuntos. **Primer paso real al ejecutar debe ser leer `prisma/schema.prisma`** y ajustar.
  - `getGuardiaDocumentosConfig` y `getPostulacionDocumentTypesVisibleOnGuardForm` pueden llamarse distinto — inspeccionar `src/lib/postulacion-documentos.ts` y `src/lib/guardia-documentos-config.ts` antes de escribir Task 4.1.
  - Si la ruta `/ops/ats/[jobId]/editar` no existe, el botón "Editar" del dashboard queda apuntando a 404 — Task 2.2 Step 3 lo maneja deshabilitándolo, pero idealmente se implementa en un plan posterior.
