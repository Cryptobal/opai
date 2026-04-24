# Descarga de documentos en PDF o Word — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir descargar un documento como PDF (ya existente) o como Word (.docx, nuevo) desde la pantalla de detalle del documento, mediante un dropdown único "Descargar".

**Architecture:** Endpoint API nuevo `/api/docs/documents/[id]/export-docx` paralelo al `export-pdf` existente. Reutiliza el mismo pipeline `resolveDocumentContentForDisplay` → `tiptapToPreviewHtml`, y convierte HTML→DOCX con la librería `html-to-docx`. En el frontend, el botón "PDF" se reemplaza por un `DropdownMenu` con dos items (PDF / Word). Para documentos firmados, el item "Word" queda deshabilitado.

**Tech Stack:** Next.js App Router (Route Handlers), Prisma, html-to-docx (nuevo), shadcn DropdownMenu, sonner toast.

**Spec:** [docs/superpowers/specs/2026-04-23-doc-download-pdf-word-design.md](../specs/2026-04-23-doc-download-pdf-word-design.md)

---

## Resumen de archivos

- **Crear:** `src/app/api/docs/documents/[id]/export-docx/route.ts`
- **Modificar:** `src/components/docs/DocDetailClient.tsx`
- **Modificar:** `package.json` (agregar dep `html-to-docx`)

---

### Task 1: Instalar dependencia `html-to-docx`

**Files:**
- Modify: `package.json` + `package-lock.json`

- [ ] **Step 1: Instalar la librería**

Run:
```bash
npm install html-to-docx
```

Expected: instala `html-to-docx` (versión ~1.8.x). Sin warnings de peer deps críticos.

- [ ] **Step 2: Verificar que aparece en package.json**

Run:
```bash
grep "html-to-docx" package.json
```

Expected: una línea como `"html-to-docx": "^1.8.0"` (la versión exacta puede variar).

- [ ] **Step 3: Verificar que el build de Next no se rompe**

Run:
```bash
npm run build 2>&1 | tail -30
```

Expected: build termina sin errores nuevos. (Si hay errores preexistentes en otras partes del repo, no son de este task — confirmar con `git stash && npm run build` para baseline si hay duda.)

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add html-to-docx for Word export"
```

---

### Task 2: Crear API `/api/docs/documents/[id]/export-docx`

**Files:**
- Create: `src/app/api/docs/documents/[id]/export-docx/route.ts`
- Reference (no modificar): `src/app/api/docs/documents/[id]/export-pdf/route.ts`

- [ ] **Step 1: Crear el archivo de la route**

Crear `src/app/api/docs/documents/[id]/export-docx/route.ts` con este contenido completo:

```ts
/**
 * API Route: /api/docs/documents/[id]/export-docx
 * GET - Genera un .docx (Word) del documento borrador con tokens resueltos.
 * Para documentos firmados devuelve 409: la fuente de verdad es el PDF firmado.
 */

import { NextRequest, NextResponse } from "next/server";
import HTMLtoDOCX from "html-to-docx";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { tiptapToPreviewHtml } from "@/lib/docs/tiptap-to-html";
import { resolveDocumentContentForDisplay } from "@/lib/docs/resolve-document-content";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function esc(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildDocxHtml(title: string, documentHtml: string): string {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <title>${esc(title)}</title>
</head>
<body>
  ${documentHtml}
</body>
</html>`;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const document = await prisma.document.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });

    if (!document) {
      return NextResponse.json(
        { success: false, error: "Documento no encontrado" },
        { status: 404 }
      );
    }

    const hasCompletedSignature = await prisma.docSignatureRequest.findFirst({
      where: { documentId: id, status: "completed" },
    });
    if (hasCompletedSignature) {
      return NextResponse.json(
        {
          success: false,
          error: "Los documentos firmados solo se descargan como PDF",
        },
        { status: 409 }
      );
    }

    const docForHtml = await resolveDocumentContentForDisplay({
      tenantId: ctx.tenantId,
      documentId: id,
      document: {
        content: document.content,
        templateId: document.templateId,
        module: document.module,
      },
    });

    const documentHtml = tiptapToPreviewHtml(docForHtml);
    const html = buildDocxHtml(document.title, documentHtml);

    const buffer = (await HTMLtoDOCX(html, undefined, {
      table: { row: { cantSplit: true } },
      footer: false,
      pageNumber: false,
    })) as Buffer;

    const fileName = `${document.title.replace(/[^a-zA-Z0-9-_]/g, "_")}-borrador.docx`;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error("Error generating draft DOCX:", error);
    return NextResponse.json(
      { success: false, error: "Error al generar Word" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Verificar que TypeScript compila**

Run:
```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "export-docx|html-to-docx" || echo "OK no errors related"
```

Expected: `OK no errors related`. Si aparece algún error de tipo de `html-to-docx`, agregar al inicio del archivo:
```ts
// @ts-expect-error - html-to-docx no exporta tipos oficiales
```
sobre la línea `import HTMLtoDOCX from "html-to-docx";` y volver a correr.

- [ ] **Step 3: Smoke manual del endpoint (servidor dev)**

Levantar el dev server en otra terminal: `npm run dev`. Luego, autenticado como un usuario con permiso `docs.gestion.view`, abrir un documento en estado **borrador** y en consola del navegador correr:

```js
const id = location.pathname.split("/").pop();
const r = await fetch(`/api/docs/documents/${id}/export-docx`);
console.log(r.status, r.headers.get("Content-Type"));
```

Expected:
- `200` y `Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document`
- Si el doc está firmado: `409` y `Content-Type: application/json`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/docs/documents/[id]/export-docx/route.ts
git commit -m "feat(docs): API export-docx para descargar documentos en Word"
```

---

### Task 3: Refactor del estado `downloadingPdf` a `downloading`

**Files:**
- Modify: `src/components/docs/DocDetailClient.tsx`

Esto prepara el componente para tener dos handlers (PDF + DOCX) usando una única variable de estado tri-state. **No** agrega aún el handler de DOCX ni cambia la UI — solo refactor para no quedar a mitad de camino.

- [ ] **Step 1: Cambiar la declaración del estado**

En `src/components/docs/DocDetailClient.tsx:113`, cambiar:

```tsx
  const [downloadingPdf, setDownloadingPdf] = useState(false);
```

por:

```tsx
  const [downloading, setDownloading] = useState<"pdf" | "docx" | null>(null);
```

- [ ] **Step 2: Actualizar `handleDownloadPdf` para usar el nuevo estado**

En `src/components/docs/DocDetailClient.tsx` reemplazar el cuerpo de `handleDownloadPdf` (alrededor de las líneas 230-256). El handler completo queda así:

```tsx
  const handleDownloadPdf = async () => {
    setDownloading("pdf");
    try {
      const res = await fetch(`/api/docs/documents/${documentId}/export-pdf`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Error al generar PDF");
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition");
      const match = disposition?.match(/filename="?(.+)"?/);
      const fileName = match?.[1]?.replace(/^"?|"?$/g, "") || `documento-${documentId}.pdf`;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("PDF descargado");
    } catch {
      toast.error("Error al descargar PDF");
    } finally {
      setDownloading(null);
    }
  };
```

- [ ] **Step 3: Actualizar las dos referencias UI a `downloadingPdf`**

En el botón PDF (alrededor de líneas 363-377), cambiar las dos referencias:

```tsx
              disabled={downloadingPdf}
              ...
              {downloadingPdf ? (
```

por:

```tsx
              disabled={downloading !== null}
              ...
              {downloading === "pdf" ? (
```

- [ ] **Step 4: Verificar que ya no hay referencias a la variable vieja**

Run:
```bash
grep -n "downloadingPdf\|setDownloadingPdf" src/components/docs/DocDetailClient.tsx
```

Expected: sin output (cero matches).

- [ ] **Step 5: Verificar que compila**

Run:
```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "DocDetailClient" || echo "OK no errors"
```

Expected: `OK no errors`.

- [ ] **Step 6: Commit**

```bash
git add src/components/docs/DocDetailClient.tsx
git commit -m "refactor(docs): downloading state to support multiple formats"
```

---

### Task 4: Agregar handler `handleDownloadDocx`

**Files:**
- Modify: `src/components/docs/DocDetailClient.tsx`

- [ ] **Step 1: Agregar el handler debajo de `handleDownloadPdf`**

Justo después del cierre de `handleDownloadPdf` (después de la línea con el `};` que termina el handler), agregar:

```tsx
  const handleDownloadDocx = async () => {
    setDownloading("docx");
    try {
      const res = await fetch(`/api/docs/documents/${documentId}/export-docx`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Error al generar Word");
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition");
      const match = disposition?.match(/filename="?(.+)"?/);
      const fileName = match?.[1]?.replace(/^"?|"?$/g, "") || `documento-${documentId}.docx`;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Word descargado");
    } catch (e: any) {
      toast.error(e?.message || "Error al descargar Word");
    } finally {
      setDownloading(null);
    }
  };
```

- [ ] **Step 2: Verificar que compila**

Run:
```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "DocDetailClient" || echo "OK no errors"
```

Expected: `OK no errors`.

- [ ] **Step 3: Commit**

```bash
git add src/components/docs/DocDetailClient.tsx
git commit -m "feat(docs): handler de descarga en Word"
```

---

### Task 5: Reemplazar el botón "PDF" por un dropdown "Descargar"

**Files:**
- Modify: `src/components/docs/DocDetailClient.tsx`

- [ ] **Step 1: Asegurar imports de DropdownMenu**

En el bloque de imports al inicio de `src/components/docs/DocDetailClient.tsx`, después del import de `Button` (línea 23), agregar (si no están ya — verificar primero con `grep -n "DropdownMenu" src/components/docs/DocDetailClient.tsx`):

```tsx
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
```

- [ ] **Step 2: Reemplazar el botón PDF por el dropdown**

Localizar el bloque actual del botón PDF (alrededor de las líneas 363-377 después del refactor del Task 3):

```tsx
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => void handleDownloadPdf()}
              disabled={downloading !== null}
              aria-label="Descargar PDF"
            >
              {downloading === "pdf" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">PDF</span>
            </Button>
```

Reemplazarlo completo por:

```tsx
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={downloading !== null}
                  aria-label="Descargar"
                >
                  {downloading !== null ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  <span className="hidden sm:inline">Descargar</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => void handleDownloadPdf()}>
                  PDF
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => void handleDownloadDocx()}
                  disabled={isSigned}
                  className="flex flex-col items-start gap-0.5"
                >
                  <span>Word (.docx)</span>
                  {isSigned ? (
                    <span className="text-[11px] text-muted-foreground">
                      Solo en borradores
                    </span>
                  ) : null}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
```

- [ ] **Step 3: Verificar que compila**

Run:
```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "DocDetailClient" || echo "OK no errors"
```

Expected: `OK no errors`.

- [ ] **Step 4: Smoke manual UI (dev server)**

Con `npm run dev` corriendo:

1. Ir a `/opai/documentos/<id>` de un **borrador**.
2. El toolbar muestra un botón "Descargar" (antes era "PDF").
3. Click → se abre el menú con "PDF" y "Word (.docx)" (ambos habilitados).
4. Click en "PDF" → spinner en el trigger, descarga el `.pdf` y toast "PDF descargado".
5. Click en "Word (.docx)" → spinner en el trigger, descarga el `.docx` y toast "Word descargado". Abrir el archivo en Word/Pages/LibreOffice y verificar que el contenido es legible (títulos, párrafos, tablas si existen, listas).
6. Ir a un documento **firmado** (con sello de firma electrónica completada).
7. Click en "Descargar" → "PDF" sigue habilitado y descarga el PDF firmado. "Word (.docx)" aparece deshabilitado con sub-label gris "Solo en borradores".

Expected: todos los pasos pasan tal cual están descritos. Anotar cualquier desviación.

- [ ] **Step 5: Commit**

```bash
git add src/components/docs/DocDetailClient.tsx
git commit -m "feat(docs): dropdown 'Descargar' con opciones PDF y Word"
```

---

## Verificación final

- [ ] **Step 1: Build completo**

Run:
```bash
npm run build 2>&1 | tail -20
```

Expected: build termina sin errores nuevos relacionados a los archivos tocados.

- [ ] **Step 2: Lint**

Run:
```bash
npx next lint --file src/app/api/docs/documents/[id]/export-docx/route.ts --file src/components/docs/DocDetailClient.tsx
```

Expected: sin warnings ni errores en estos archivos.

- [ ] **Step 3: Confirmar criterios de aceptación**

Re-leer `docs/superpowers/specs/2026-04-23-doc-download-pdf-word-design.md` y verificar:

- [x] Hay un dropdown "Descargar" con dos opciones (PDF, Word).
- [x] Word descarga `.docx` con contenido legible para borradores.
- [x] Documentos firmados: PDF sigue funcionando (redirige al firmado), Word está deshabilitado con etiqueta "Solo en borradores".
- [x] El portal cliente y el flujo de firma no fueron tocados.
