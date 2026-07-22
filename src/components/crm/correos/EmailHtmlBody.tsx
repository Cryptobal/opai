"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  emailPlainFallback,
  hasBlockedImages,
  sanitizeEmailHtml,
} from "@/lib/sanitize-email-html";
import styles from "./email-html-body.module.css";

type Props = {
  htmlBody: string | null;
  textBody: string | null;
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
 * Documento completo para el iframe: replica los estilos base del css module
 * (fondo claro fijo, tipografía, tablas) para no degradar la lectura. El tema
 * del correo es siempre claro (igual que antes del sandbox), también en dark
 * mode de la app.
 */
export function buildEmailSrcDoc(safeHtml: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>
:root{color-scheme:light}
html,body{margin:0;padding:0}
body{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  font-size:13px;line-height:1.55;color:hsl(220 15% 18%);background:hsl(0 0% 100%);
  word-break:break-word;overflow-x:auto;padding:2px}
a{color:hsl(174 72% 32%);text-decoration:underline;text-underline-offset:2px}
img{max-width:100%;height:auto}
table{display:block;overflow-x:auto;border-collapse:collapse;max-width:100%;margin:.5rem 0}
td,th{border:1px solid hsl(220 10% 85%);padding:.35rem .5rem;vertical-align:top}
p,div,li{margin:.35em 0}
blockquote{margin:.5rem 0;padding-left:.75rem;border-left:3px solid hsl(220 10% 78%);color:hsl(220 10% 40%)}
</style></head><body>${safeHtml}</body></html>`;
}

/** Cuerpo de correo: HTML sanitizado en iframe sandbox; toggle a texto plano;
 * imágenes remotas bloqueadas por defecto con botón "Mostrar imágenes"
 * (estado de sesión por mensaje, sin persistencia). */
export function EmailHtmlBody({ htmlBody, textBody }: Props) {
  const hasHtml = Boolean(htmlBody?.trim());
  const [mode, setMode] = useState<"html" | "text">(hasHtml ? "html" : "text");
  const [showImages, setShowImages] = useState(false);

  const safeHtml = useMemo(
    () => (hasHtml ? sanitizeEmailHtml(htmlBody!, { blockRemoteImages: !showImages }) : ""),
    [hasHtml, htmlBody, showImages],
  );
  // Se detecta sobre la versión bloqueada para que el botón no desaparezca
  // del layout al restaurar (pasa a "Ocultar imágenes").
  const blockedAvailable = useMemo(
    () => (hasHtml ? hasBlockedImages(sanitizeEmailHtml(htmlBody!, { blockRemoteImages: true })) : false),
    [hasHtml, htmlBody],
  );
  const plain = useMemo(
    () => emailPlainFallback(htmlBody, textBody),
    [htmlBody, textBody],
  );

  const useIframe = iframeSandboxEnabled();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(80);

  // Con allow-same-origin (mismo origen vía srcDoc) el padre puede medir la
  // altura del contenido; un ResizeObserver sigue los cambios (imágenes lazy).
  const measure = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    const next = doc?.documentElement?.scrollHeight ?? doc?.body?.scrollHeight;
    if (next && next > 0) setHeight(next + 4);
  }, []);

  useEffect(() => {
    if (!useIframe || mode !== "html") return;
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.body || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(doc.body);
    return () => ro.disconnect();
  }, [useIframe, mode, safeHtml, measure]);

  const srcDoc = useMemo(
    () => (useIframe && safeHtml ? buildEmailSrcDoc(safeHtml) : ""),
    [useIframe, safeHtml],
  );

  return (
    <div className="space-y-1.5">
      {(hasHtml || blockedAvailable) && (
        <div className="flex items-center gap-3">
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
            <button
              type="button"
              onClick={() => setShowImages((v) => !v)}
              className="text-[12px] text-primary ds-tap"
            >
              {showImages ? "Ocultar imágenes" : "Mostrar imágenes"}
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
            referrerPolicy="no-referrer"
            title="Contenido del correo"
            onLoad={measure}
            className={styles.frame}
            style={{ height: `${height}px` }}
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
