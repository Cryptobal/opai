import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";

/**
 * Carga perezosa de pdf.js (build **legacy**: incluye los polyfills — p.ej.
 * `Promise.withResolvers`, ausente en iOS Safari < 17.4 — que el build moderno
 * usa sin polyfillar y que dejaban el visor en blanco en el WebView de las apps
 * Capacitor). El `import()` dinámico deja la librería (~1 MB) fuera del bundle
 * inicial: solo se baja al abrir un adjunto. El worker se sirve como asset
 * estático desde `/public` (misma versión que la librería, copiada en build) en
 * vez de una CDN, para no chocar con CSP ni con la resolución del bundler.
 */
type PdfModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

let modPromise: Promise<PdfModule> | null = null;

async function getPdfjs(): Promise<PdfModule> {
  if (!modPromise) {
    modPromise = import("pdfjs-dist/legacy/build/pdf.mjs").then((mod) => {
      mod.GlobalWorkerOptions.workerSrc = "/pdf/pdf.worker.min.mjs";
      return mod;
    });
  }
  return modPromise;
}

/**
 * Abre un PDF desde bytes en memoria. Lanza si está cifrado/corrupto: el error
 * lo maneja la UI (mensaje + descarga), nunca una pantalla en blanco.
 * `standardFontDataUrl` evita el texto en blanco cuando el PDF usa las 14
 * fuentes base sin embeberlas.
 */
export async function loadPdf(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  const pdfjs = await getPdfjs();
  const task = pdfjs.getDocument({
    data,
    standardFontDataUrl: "/pdf/standard_fonts/",
    // El render en canvas no ejecuta JS embebido del documento (más seguro que
    // el iframe anterior); desactivar eval además respeta CSP estrictas.
    isEvalSupported: false,
  });
  return task.promise;
}

/**
 * Renderiza una página en el canvas ajustada a `cssWidth` (px CSS), nítida en
 * pantallas retina vía `devicePixelRatio` (capado a 2 para no reventar memoria
 * en teléfonos 3x). Devuelve el `RenderTask` para poder cancelarlo si cambia el
 * zoom o se desmonta antes de terminar.
 */
export function renderPage(
  page: PDFPageProxy,
  canvas: HTMLCanvasElement,
  cssWidth: number,
): RenderTask {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const base = page.getViewport({ scale: 1 });
  const scale = cssWidth / base.width;
  const viewport = page.getViewport({ scale: scale * dpr });
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D no disponible");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
  canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
  return page.render({ canvasContext: ctx, viewport });
}
