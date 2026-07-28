"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  // Claro por defecto (fidelidad: firmas asumen fondo blanco). Noche: pizarra
  // azul alineada al dark de la app (`--ds-text-1` / background slate).
  const bg = night ? "hsl(222 28% 12%)" : "hsl(0 0% 100%)";
  const fg = night ? "hsl(210 40% 96%)" : "hsl(220 15% 18%)";
  const border = night ? "hsl(220 16% 28%)" : "hsl(220 10% 85%)";
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
  return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>
:root{color-scheme:${night ? "dark" : "light"}}
html,body{margin:0;padding:0}
body{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  font-size:13px;line-height:1.55;color:${fg};background:${bg};
  word-break:break-word;overflow-x:auto;padding:16px 20px}
.opai-mail-canvas{max-width:100%;margin:0 auto}
a{color:${link};text-decoration:underline;text-underline-offset:2px}
img{max-width:100%;height:auto}
table{display:block;overflow-x:auto;border-collapse:collapse;max-width:100%;margin:.5rem 0}
td,th{border:1px solid ${border};padding:.35rem .5rem;vertical-align:top}
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
  // Se detecta sobre la versión bloqueada para que el botón no desaparezca
  // del layout al restaurar (pasa a "Ocultar imágenes").
  // Las imgs ya reescritas a /api/... cuentan como remotas http(s) y entran
  // en el toggle "Mostrar imágenes" (privacidad: no se piden hasta el click).
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
  // Altura estable: no arrancar en 80px (causaba "pestañeo" — pedazo corto
  // y luego salto al alto real). Reservamos el último alto medido y ocultamos
  // el iframe hasta la primera medición del documento nuevo.
  const [height, setHeight] = useState(320);
  const [frameReady, setFrameReady] = useState(false);
  const lastHeightRef = useRef(320);

  const srcDoc = useMemo(
    () => (useIframe && safeHtml ? buildEmailSrcDoc(safeHtml, night) : ""),
    [useIframe, safeHtml, night],
  );

  // Nuevo documento → ocultar hasta medir (evita flash del top del HTML).
  useEffect(() => {
    if (!useIframe || mode !== "html" || !srcDoc) {
      setFrameReady(true);
      return;
    }
    setFrameReady(false);
    setHeight(lastHeightRef.current);
  }, [srcDoc, useIframe, mode]);

  // Con allow-same-origin (mismo origen vía srcDoc) el padre puede medir la
  // altura del contenido; un ResizeObserver sigue los cambios (imágenes lazy).
  const measure = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    const next = doc?.documentElement?.scrollHeight ?? doc?.body?.scrollHeight;
    if (!next || next <= 0) return;
    const h = next + 4;
    lastHeightRef.current = h;
    setHeight(h);
    setFrameReady(true);
  }, []);

  useEffect(() => {
    if (!useIframe || mode !== "html") return;
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.body || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(doc.body);
    return () => ro.disconnect();
  }, [useIframe, mode, safeHtml, measure]);

  // El foco dentro del iframe no burbujea al padre: sin este puente, los
  // atajos de bandeja/lector (j/k, R/F/I, archivar…) dejan de responder al
  // leer el cuerpo. Re-adjuntamos en `load` porque con srcDoc el
  // contentDocument puede no estar listo en el primer effect.
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

    const attach = () => {
      const next = iframe.contentDocument;
      if (!next || next === doc) return;
      if (doc) doc.removeEventListener("keydown", onKey);
      doc = next;
      doc.addEventListener("keydown", onKey);
    };

    attach();
    iframe.addEventListener("load", attach);
    return () => {
      iframe.removeEventListener("load", attach);
      doc?.removeEventListener("keydown", onKey);
    };
  }, [useIframe, mode, srcDoc]);

  return (
    <div className="space-y-1.5">
      {(hasHtml || blockedAvailable) && (
        <div className="flex flex-wrap items-center gap-3">
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
          {hasHtml && mode === "html" && useIframe && (
            <button
              type="button"
              onClick={() => setEmailNightMode(!night)}
              aria-pressed={night}
              title={night ? "Fondo claro" : "Fondo oscuro"}
              className="ml-auto text-[12px] text-ds-text-3 ds-tap"
            >
              {night ? "☀️ Claro" : "🌙 Oscuro"}
            </button>
          )}
        </div>
      )}
      {mode === "html" && safeHtml ? (
        useIframe ? (
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
              opacity: frameReady ? 1 : 0,
              transition: frameReady ? "opacity 80ms ease-out" : undefined,
            }}
          />
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
    </div>
  );
}
