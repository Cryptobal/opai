---
name: Descarga de documentos en PDF o Word
date: 2026-04-23
status: approved
---

# Descarga de documentos en PDF o Word

## Contexto

Hoy la pantalla de detalle de documento (`/opai/documentos/[id]`) tiene un solo botón "PDF" en el toolbar. El botón llama a `/api/docs/documents/[id]/export-pdf`, que genera el PDF con Playwright + Chromium a partir del HTML producido por `tiptapToPreviewHtml()`.

El usuario pidió poder descargar el documento también en formato Word (`.docx`).

## Decisiones de diseño

1. **UI: dropdown único "Descargar"** (no dos botones separados). El toolbar ya está cargado (Guardar / PDF / Revisión / Firma / Historial / Eliminar) y un dropdown deja la puerta abierta a más formatos sin agregar botones.
2. **Documentos firmados:** solo permiten Word en borradores. Si el documento tiene `DocSignatureRequest` con `status="completed"`, el ítem "Word (.docx)" del menú aparece deshabilitado con tooltip "Solo disponible en borradores". Razón: integridad documental — un `.docx` editable de un contrato firmado abre puerta a manipulación y dificulta auditoría.
3. **Librería de generación Word:** `html-to-docx` (pure JS, sin binarios nativos, ~200KB). Se descartaron `docx` (requiere mapear TipTap → primitivas docx, demasiado trabajo) y pandoc/LibreOffice (binarios pesados, mal fit con Vercel Functions).
4. **Alcance:** solo afecta la pantalla de detalle de documento. **No** se añade Word al portal cliente, ni a los PDFs firmados, ni al email de envío a firma.

## Componentes

### 1. API `GET /api/docs/documents/[id]/export-docx`

Endpoint nuevo, paralelo a `export-pdf`. Reutiliza el mismo pipeline de resolución de contenido:

- `requireAuth()` → si falla devuelve `unauthorized()`.
- `prisma.document.findFirst({ where: { id, tenantId: ctx.tenantId } })` → si no existe, 404 con `{ success: false, error: "Documento no encontrado" }`.
- Chequeo de firma: `prisma.docSignatureRequest.findFirst({ where: { documentId: id, status: "completed" } })`. Si existe, devuelve **409** con `{ success: false, error: "Los documentos firmados solo se descargan como PDF" }`. (Diferencia con `export-pdf`, que en ese caso redirige al `signed-pdf`.)
- `resolveDocumentContentForDisplay({ tenantId, documentId, document: { content, templateId, module } })` → resuelve tokens.
- `tiptapToPreviewHtml(docForHtml)` → HTML del contenido.
- HTML envuelto en un wrapper mínimo `<!doctype html><html><head><meta charset="utf-8"><title>{title}</title></head><body>{documentHtml}</body></html>`. No se reutiliza `buildDraftPdfHtml` porque ese incluye un header HTML con título y fecha; en Word no aplica (los estilos CSS de pantalla impresa no se respetan al convertir a docx).
- `htmlToDocx(html, null, { table: { row: { cantSplit: true } }, footer: false, pageNumber: false })` → `Buffer`.
- Respuesta:
  - `Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document`
  - `Content-Disposition: attachment; filename="<titulo>-borrador.docx"` (mismo sanitizado de filename que `export-pdf`: `title.replace(/[^a-zA-Z0-9-_]/g, "_")`)
- `export const dynamic = "force-dynamic"` y `export const maxDuration = 60` (igual que `export-pdf`).

Errores no controlados → catch genérico devuelve 500 con `{ success: false, error: "Error al generar Word" }` y log a consola.

### 2. UI: dropdown en `DocDetailClient.tsx`

Reemplaza el botón "PDF" actual ([DocDetailClient.tsx:363-377](src/components/docs/DocDetailClient.tsx#L363-L377)) por un `DropdownMenu` de shadcn:

- **Trigger:** `Button` con `variant="outline"`, `size="sm"`, `className="gap-1.5"`, icono `Download` y texto "Descargar" (oculto en mobile, igual que los otros botones del toolbar). Mientras descarga muestra spinner `Loader2` en lugar del icono.
- **Menu items:**
  - "PDF" → `onSelect={() => void handleDownloadPdf()}`
  - "Word (.docx)" → `onSelect={() => void handleDownloadDocx()}`. Si `isSigned === true`, item con `disabled` y un texto secundario gris "Solo en borradores" como sub-label dentro del item (los `DropdownMenuItem` de shadcn no soportan tooltips de forma nativa cuando están deshabilitados — el sub-label es la señal visual).

### 3. Estado y handlers cliente

Reemplaza el estado `downloadingPdf: boolean` por `downloading: "pdf" | "docx" | null`. El trigger del dropdown queda `disabled` cuando `downloading !== null`.

`handleDownloadDocx` es estructuralmente idéntico a `handleDownloadPdf`:

- `setDownloading("docx")`
- `fetch("/api/docs/documents/${documentId}/export-docx")`
- Si `!res.ok`: parsea body JSON, lanza error con `data.error || "Error al generar Word"`.
- `res.blob()` → `URL.createObjectURL` → click programático en `<a download>`.
- Filename del header `Content-Disposition`, fallback `documento-${documentId}.docx`.
- Toast de éxito "Word descargado" / error "Error al descargar Word".
- `finally`: `setDownloading(null)`.

`handleDownloadPdf` se ajusta a la nueva variable de estado pero su lógica no cambia.

## Dependencias

Agregar a `package.json`:

- `html-to-docx`: `^1.8.0` (o última estable). Verificar compatibilidad con Node 20+ y con Vercel Functions (es ESM/CJS dual, no usa binarios nativos).

## Tests

- **Smoke manual:** descargar PDF y Word de un contrato borrador → ambos abren correctamente. Descargar PDF de un documento firmado → sigue redirigiendo al signed-pdf. Intentar descargar Word de un documento firmado → toast de error claro.
- **No se agregan tests automáticos**: la conversión HTML→DOCX es una llamada a librería externa; el comportamiento ya está validado por la propia librería. Si en el futuro hay reportes de fidelidad, sumar tests visuales.

## Trade-offs aceptados

- **Fidelidad visual ≠ 1:1 con PDF.** `html-to-docx` respeta estructura (títulos, tablas, listas, bold/italic, párrafos) pero no garantiza píxel-perfect. Para los contratos legales con formato estándar del producto es suficiente.
- **Sin paginación forzada.** El `.docx` se entrega sin saltos de página explícitos; Word reflowa según la config del usuario. Si más adelante se necesita paginación exacta, hay que migrar a `docx` (programático) o pandoc.
- **Sin marca de agua "borrador".** El header del PDF indica "Borrador · fecha"; el Word no lo lleva (Word tiene su propio sistema de marcas de agua que requiere XML adicional). Si se pide, se agrega después.

## Out of scope

- Portal cliente (sigue solo PDF).
- Email de envío a firma (sigue solo PDF).
- Word de documentos firmados (excluido por integridad).
- Templates de documentos (esto solo afecta documentos generados; los templates ya tienen su propio editor).
- Otros formatos (Markdown, HTML descargable, etc.).
