"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eye } from "lucide-react";
import {
  emailPlainFallback,
  hasBlockedImages,
  sanitizeEmailHtml,
} from "@/lib/sanitize-email-html";
import { setEmailNightMode, useEmailNightMode } from "./email-night-mode";
import {
  rewriteCidImages,
  type CidAttachmentRef,
} from "./rewrite-cid-images";
import { emailHtmlIsRenderable } from "./email-html-renderable";
import { CorreoViewSheet } from "./CorreoViewSheet";
import styles from "./email-html-body.module.css";

type Props = {
  htmlBody: string | null;
  textBody: string | null;
  /** Estado inicial de mostrar imágenes (preferencia "mostrar siempre"). */
  defaultShowImages?: boolean;
  /** Persiste "mostrar siempre las imágenes" (firmas/logos). */
  onAlwaysShowImages?: () => void;
  /** Hilo + adjuntos para resolver firmas `cid:` → URL del API. */
  threadId?: string | null;
  messageId?: string | null;
  attachments?: CidAttachmentRef[];
};

/**
 * Flag de rollback (V5): con NEXT_PUBLIC_EMAIL_IFRAME_SANDBOX=false se vuelve
 * al render anterior (div con dangerouslySetInnerHTML). Por defecto el HTML se
 * aísla en un iframe sandbox sin allow-scripts: un bypass de DOMPurify no
 * ejecuta código en el contexto de la app.
 */
function iframeSandboxEnabled(): boolean {
  return process.env.NEXT_PUBLIC_EMAIL_IFRAME_SANDBOX !== "false";
}

/**
 * Documento completo para el iframe: tipografía/tablas base + tema claro u
 * oscuro (toggle 🌙/☀️). En noche forzamos texto legible: casi todos los
 * correos traen `color:#000` / `color:black` inline y, sin override, el
 * cuerpo queda negro sobre fondo pizarra (ilegible). El acento de links
 * sigue el teal de marca OPAI.
 */
export function buildEmailSrcDoc(safeHtml: string, night = false): string {
  // Claro por defecto (fidelidad: firmas asumen fondo blanco). Noche: valores
  // HSL que replican `--ds-surface-1` / `--ds-border-default` dark de
  // globals.css — el srcDoc del iframe no accede a las CSS variables del padre.
  const bg = night ? "hsl(218 32% 14%)" : "hsl(0 0% 100%)";
  const fg = night ? "hsl(210 40% 96%)" : "hsl(220 15% 18%)";
  const border = night ? "hsl(218 24% 26%)" : "hsl(220 10% 85%)";
  const quote = night ? "hsl(215 20% 70%)" : "hsl(220 10% 40%)";
  const link = night ? "hsl(174 72% 55%)" : "hsl(174 72% 32%)";
  // Override agresivo solo en noche: el HTML de Outlook/Gmail pinta negros
  // y fondos blancos que matan el contraste. Links conservan teal; media
  // no se recolorea.
  const nightCss = night
    ? `body,body *:not(a):not(img):not(svg):not(video):not(source){color:${fg}!important;background-color:transparent!important}
body a,body a *{color:${link}!important}
body table,body td,body th{border-color:${border}!important}
body blockquote{color:${quote}!important;border-left-color:${border}!important}`
    : "";
  // Canvas a width:100%: el texto hace wrap al ancho del panel. Tablas/firmas
  // fijas pueden desbordar (scrollWidth > clientWidth); EmailHtmlBody escala
  // (fitWidth, default) o ensancha el iframe para que scrollee el panel padre.
  // Nunca width:max-content en el canvas: eso evita el wrap (max-content = sin
  // soft-wrap) y dispara el "tiritón" al mediar/ensanchar en bucle.
  return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>
:root{color-scheme:${night ? "dark" : "light"}}
html,body{margin:0;padding:0;width:100%;max-width:100%}
body{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  font-size:13px;line-height:1.55;color:${fg};background:${bg};
  word-break:break-word;overflow-wrap:anywhere;overflow-x:hidden;padding:16px 20px;box-sizing:border-box}
.opai-mail-canvas{display:block;width:100%;max-width:100%;box-sizing:border-box}
a{color:${link};text-decoration:underline;text-underline-offset:2px}
img{max-width:100%;height:auto}
table{border-collapse:collapse;max-width:100%;margin:.5rem 0}
td,th{border:1px solid ${border};padding:.35rem .5rem;vertical-align:top;word-break:break-word}
p,div,li{margin:.35em 0}
blockquote{margin:.5rem 0;padding-left:.75rem;border-left:3px solid ${border};color:${quote}}
${nightCss}
</style></head><body><div class="opai-mail-canvas">${safeHtml}</div></body></html>`;
}

/** Cuerpo de correo: HTML sanitizado en iframe sandbox; toggle a texto plano;
 * imágenes remotas bloqueadas por defecto con botón "Mostrar imágenes"
 * (estado de sesión por mensaje, sin persistencia). */
export function EmailHtmlBody({
  htmlBody,
  textBody,
  defaultShowImages = false,
  onAlwaysShowImages,
  threadId = null,
  messageId = null,
  attachments = [],
}: Props) {
  const hasHtml = Boolean(htmlBody?.trim());
  const [mode, setMode] = useState<"html" | "text">(hasHtml ? "html" : "text");
  const [showImages, setShowImages] = useState(defaultShowImages);
  // Preferencia global persistente (no se pierde al refrescar ni al re-render
  // del hilo; misma en móvil y desktop). Ver email-night-mode.ts.
  const night = useEmailNightMode();

  // Firmas Outlook/Gmail: cid: → endpoint autenticado (antes del sanitize).
  const htmlWithCid = useMemo(() => {
    if (!htmlBody?.trim()) return htmlBody;
    if (!threadId || attachments.length === 0) return htmlBody;
    return rewriteCidImages(htmlBody, threadId, attachments, messageId ?? undefined);
  }, [htmlBody, threadId, messageId, attachments]);

  const safeHtml = useMemo(
    () =>
      hasHtml
        ? sanitizeEmailHtml(htmlWithCid!, { blockRemoteImages: !showImages })
        : "",
    [hasHtml, htmlWithCid, showImages],
  );
  const renderable = useMemo(
    () => emailHtmlIsRenderable(safeHtml),
    [safeHtml],
  );
  // Se detecta sobre la versión bloqueada para que el botón no desaparezca
  // del layout al restaurar (pasa a "Ocultar imágenes").
  // Solo http(s) / protocol-relative cuentan como remotas; las /api/ (cid
  // reescritas) no se bloquean ni entran en este toggle.
  const blockedAvailable = useMemo(
    () =>
      hasHtml
        ? hasBlockedImages(sanitizeEmailHtml(htmlWithCid!, { blockRemoteImages: true }))
        : false,
    [hasHtml, htmlWithCid],
  );
  const plain = useMemo(
    () => emailPlainFallback(htmlBody, textBody),
    [htmlBody, textBody],
  );

  const useIframe = iframeSandboxEnabled();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Altura estable: no arrancar en 80px (causaba "pestañeo" — pedazo corto
  // y luego salto al alto real). Reservamos el último alto medido y ocultamos
  // el iframe hasta la primera medición del documento nuevo.
  const [height, setHeight] = useState(320);
  // null = 100% del contenedor; número = ancho natural (scrollea el panel padre).
  const [frameWidth, setFrameWidth] = useState<number | null>(null);
  const [frameReady, setFrameReady] = useState(false);
  const [measureFailed, setMeasureFailed] = useState(false);
  const lastHeightRef = useRef(320);
  // Outer: ancho estable del panel (nunca se ensancha). Inner: opcional minWidth
  // para el modo "ancho original" sin contaminar la medición (evita tiritón RO).
  const hostRef = useRef<HTMLDivElement>(null);
  const frameWidthRef = useRef<number | null>(null);
  // Default true: el correo se ajusta al ancho del lector (como Gmail/Outlook).
  // El usuario puede pedir "Ancho original" desde Vista.
  const [fitWidth, setFitWidth] = useState(true);
  const [viewSheetOpen, setViewSheetOpen] = useState(false);

  const showHtmlFrame = mode === "html" && Boolean(safeHtml) && renderable;

  const srcDoc = useMemo(
    () => (useIframe && showHtmlFrame ? buildEmailSrcDoc(safeHtml, night) : ""),
    [useIframe, showHtmlFrame, safeHtml, night],
  );

  // Nuevo documento → ocultar hasta medir; watchdog garantiza visibilidad.
  useEffect(() => {
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
    if (!useIframe || !showHtmlFrame || !srcDoc) {
      setFrameReady(true);
      setMeasureFailed(false);
      return;
    }
    setFrameReady(false);
    setMeasureFailed(false);
    setHeight(lastHeightRef.current);
    frameWidthRef.current = null;
    setFrameWidth(null);
    watchdogRef.current = setTimeout(() => {
      setFrameReady(true);
      setMeasureFailed(true);
      watchdogRef.current = null;
    }, 700);
    return () => {
      if (watchdogRef.current) {
        clearTimeout(watchdogRef.current);
        watchdogRef.current = null;
      }
    };
  }, [srcDoc, useIframe, showHtmlFrame]);

  // Con allow-same-origin (mismo origen vía srcDoc) el padre puede medir la
  // altura del contenido; un ResizeObserver sigue los cambios (imágenes lazy).
  // Ancho disponible = host OUTER (estable). Si hay overflow y fitWidth,
  // escalamos (≥0.55); si no cabe legible o el usuario pide ancho original,
  // ensanchamos el iframe INNER para que scrollee el panel del lector.
  const measure = useCallback(() => {
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    if (!iframe || !doc) return;
    const canvas = doc.querySelector(".opai-mail-canvas") as HTMLElement | null;
    const naturalH =
      canvas?.scrollHeight ??
      doc.documentElement?.scrollHeight ??
      doc.body?.scrollHeight;
    if (!naturalH || naturalH <= 0) return;
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }

    let scale = 1;
    let nextFrameWidth: number | null = null;
    if (canvas) {
      // Solo el outer: si midiéramos el inner con minWidth=naturalW,
      // availW ≈ naturalW → frameWidth=null → shrink → overflow → bucle.
      const availW = hostRef.current?.clientWidth || iframe.clientWidth;
      const naturalW = Math.ceil(
        Math.max(
          canvas.scrollWidth,
          doc.documentElement?.scrollWidth ?? 0,
          doc.body?.scrollWidth ?? 0,
        ),
      );
      if (availW > 0 && naturalW > availW + 1) {
        if (fitWidth) {
          const ideal = availW / naturalW;
          if (ideal >= 0.55) {
            scale = ideal;
          } else {
            nextFrameWidth = naturalW;
          }
        } else {
          nextFrameWidth = naturalW;
        }
      }
      const desiredTransform = scale < 1 ? `scale(${scale})` : "";
      if (canvas.style.transformOrigin !== "top left") {
        canvas.style.transformOrigin = "top left";
      }
      if (canvas.style.transform !== desiredTransform) {
        canvas.style.transform = desiredTransform;
      }
      if (doc.body && doc.body.style.overflowX !== "hidden") {
        doc.body.style.overflowX = "hidden";
      }
    }

    const h = Math.round(naturalH * scale) + 4;
    lastHeightRef.current = h;
    // Evitar setState redundantes que re-disparan layout/RO.
    setHeight((prev) => (prev === h ? prev : h));
    if (frameWidthRef.current !== nextFrameWidth) {
      frameWidthRef.current = nextFrameWidth;
      setFrameWidth(nextFrameWidth);
    }
    setFrameReady(true);
    setMeasureFailed(false);
  }, [fitWidth]);

  useEffect(() => {
    if (!useIframe || mode !== "html") return;
    if (typeof ResizeObserver === "undefined") return;
    const doc = iframeRef.current?.contentDocument;
    const host = hostRef.current;
    const ro = new ResizeObserver(() => measure());
    if (doc?.body) ro.observe(doc.body);
    // El asa de ancho del lector cambia el host sin mutar el documento.
    if (host) ro.observe(host);
    // fitWidth / documento nuevo: medir ya (RO solo dispara en resize).
    measure();
    return () => ro.disconnect();
  }, [useIframe, mode, safeHtml, measure]);

  // El foco/rueda dentro del iframe no burbujean al padre: sin estos puentes,
  // los atajos (j/k, R/A/F…) y el scroll del panel del lector fallan al leer
  // el cuerpo. Re-adjuntamos en `load` porque con srcDoc el contentDocument
  // puede no estar listo en el primer effect.
  useEffect(() => {
    if (!useIframe || mode !== "html") return;
    const iframe = iframeRef.current;
    if (!iframe) return;

    let doc: Document | null = null;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const el = event.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) {
        return;
      }
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: event.key,
          code: event.code,
          bubbles: true,
          cancelable: true,
        }),
      );
    };

    // El iframe no scrollea solo (overflow hidden + alto/ancho al contenido).
    // Reenviamos la rueda al scroller del lector para que se mueva TODO el panel.
    const onWheel = (event: WheelEvent) => {
      const scroller =
        hostRef.current?.closest(".overflow-auto, .overflow-y-auto, .overflow-x-auto") ??
        null;
      if (!(scroller instanceof HTMLElement)) return;
      if (event.deltaX === 0 && event.deltaY === 0) return;
      scroller.scrollBy({ left: event.deltaX, top: event.deltaY });
      event.preventDefault();
    };

    const attach = () => {
      const next = iframe.contentDocument;
      if (!next || next === doc) return;
      if (doc) {
        doc.removeEventListener("keydown", onKey);
        doc.removeEventListener("wheel", onWheel);
      }
      doc = next;
      doc.addEventListener("keydown", onKey);
      doc.addEventListener("wheel", onWheel, { passive: false });
    };

    attach();
    iframe.addEventListener("load", attach);
    return () => {
      iframe.removeEventListener("load", attach);
      doc?.removeEventListener("keydown", onKey);
      doc?.removeEventListener("wheel", onWheel);
    };
  }, [useIframe, mode, srcDoc]);

  return (
    <div className="space-y-1.5">
      {(hasHtml || blockedAvailable) && (
        <>
          {/* Desktop: fila de enlaces. Móvil: botón «Vista» → sheet. */}
          <div className="hidden flex-wrap items-center gap-3 lg:flex">
            {hasHtml && (
              <button
                type="button"
                onClick={() => setMode((m) => (m === "html" ? "text" : "html"))}
                className="text-[12px] text-primary ds-tap"
              >
                {mode === "html" ? "Ver texto" : "Ver original"}
              </button>
            )}
            {blockedAvailable && mode === "html" && (
              <>
                <button
                  type="button"
                  onClick={() => setShowImages((v) => !v)}
                  className="text-[12px] text-primary ds-tap"
                >
                  {showImages ? "Ocultar imágenes" : "Mostrar imágenes"}
                </button>
                {!showImages && onAlwaysShowImages && (
                  <button
                    type="button"
                    onClick={() => { onAlwaysShowImages(); setShowImages(true); }}
                    className="text-[12px] text-ds-text-3 underline underline-offset-2 ds-tap"
                  >
                    Mostrar siempre
                  </button>
                )}
              </>
            )}
            {showHtmlFrame && useIframe && (
              <>
                <button
                  type="button"
                  onClick={() => setFitWidth((v) => !v)}
                  aria-pressed={fitWidth}
                  title={fitWidth ? "Ver ancho original" : "Ajustar al ancho del panel"}
                  className="text-[12px] text-ds-text-3 ds-tap"
                >
                  {fitWidth ? "Ancho original" : "Ajustar ancho"}
                </button>
                <button
                  type="button"
                  onClick={() => setEmailNightMode(!night)}
                  aria-pressed={night}
                  title={night ? "Fondo claro" : "Fondo oscuro"}
                  className="ml-auto text-[12px] text-ds-text-3 ds-tap"
                >
                  {night ? "☀️ Claro" : "🌙 Oscuro"}
                </button>
              </>
            )}
          </div>
          <div className="flex justify-end lg:hidden">
            <button
              type="button"
              onClick={() => setViewSheetOpen(true)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-ds-border-default bg-ds-surface-1 px-3 text-[12px] font-medium text-ds-text-2 ds-tap"
            >
              <Eye className="h-3.5 w-3.5" aria-hidden /> Vista
            </button>
          </div>
        </>
      )}
      {showHtmlFrame ? (
        useIframe ? (
          <div ref={hostRef} className="relative w-full min-w-0">
            <div
              className="relative"
              style={frameWidth ? { minWidth: `${frameWidth}px` } : undefined}
            >
              <iframe
                ref={iframeRef}
                srcDoc={srcDoc}
                // Sin allow-scripts: un bypass del sanitizer no ejecuta JS.
                // allow-same-origin permite medir la altura desde el padre (el
                // contenido no tiene scripts que abusen del origen compartido).
                // allow-popups + allow-popups-to-escape-sandbox: los links
                // (target=_blank + noopener del sanitizer) abren pestañas
                // normales; sin el escape, la pestaña heredaría el sandbox sin
                // scripts y casi cualquier sitio quedaría roto.
                // Opción más estricta evaluada: quitar también el atributo
                // `style` de la allowlist del sanitizer; se mantiene porque el
                // sandbox ya es la mitigación y sin `style` el HTML real de
                // correo (newsletters, firmas) se degrada demasiado.
                sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                title="Contenido del correo"
                onLoad={measure}
                className={`${styles.frame}${night ? ` ${styles.frameNight}` : ""}`}
                style={{
                  height: `${height}px`,
                  width: frameWidth ? `${frameWidth}px` : "100%",
                  opacity: frameReady ? 1 : 0,
                  transition: frameReady ? "opacity 80ms ease-out" : undefined,
                }}
              />
              {measureFailed && (
                <div className="absolute inset-x-0 bottom-0 z-[1] flex flex-wrap items-center gap-2 border-t border-status-warn-border bg-status-warn-soft px-3 py-2 text-[12px] text-status-warn-fg">
                  <span>No se pudo mostrar el formato original</span>
                  <button
                    type="button"
                    onClick={() => setMode("text")}
                    className="min-h-11 font-medium underline underline-offset-2 ds-tap sm:min-h-8"
                  >
                    Ver texto
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div
            className={styles.root}
            dangerouslySetInnerHTML={{ __html: safeHtml }}
          />
        )
      ) : (
        <p className="whitespace-pre-wrap break-words text-[13px] text-ds-text-2">
          {plain}
        </p>
      )}

      {viewSheetOpen && (
        <CorreoViewSheet
          mode={mode}
          hasHtml={hasHtml}
          isHtmlFrame={showHtmlFrame && useIframe}
          night={night}
          showImages={showImages}
          blockedAvailable={blockedAvailable}
          fitWidth={fitWidth}
          onToggleMode={() => setMode((m) => (m === "html" ? "text" : "html"))}
          onToggleNight={() => setEmailNightMode(!night)}
          onToggleImages={() => setShowImages((v) => !v)}
          onAlwaysShowImages={
            onAlwaysShowImages
              ? () => {
                  onAlwaysShowImages();
                  setShowImages(true);
                }
              : undefined
          }
          onToggleFitWidth={() => setFitWidth((v) => !v)}
          onPrint={() => window.print()}
          onClose={() => setViewSheetOpen(false)}
        />
      )}
    </div>
  );
}
