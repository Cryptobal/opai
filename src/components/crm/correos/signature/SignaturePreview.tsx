"use client";

import { useState } from "react";
import { renderSignatureHtml } from "@/modules/crm/email/signature-render";
import type { SignatureData } from "@/modules/crm/email/signature-data";

type Props = {
  data: SignatureData;
  className?: string;
};

/**
 * Vista previa sobre fondo blanco (como se lee el correo).
 * Inspector de enlaces + simulador de imágenes bloqueadas.
 */
export function SignaturePreview({ data, className }: Props) {
  const [iphone, setIphone] = useState(false);
  const [blockImages, setBlockImages] = useState(false);
  const [hoverHref, setHoverHref] = useState<string | null>(null);

  let html = renderSignatureHtml(data);
  if (blockImages) {
    html = html.replace(
      /<img\b([^>]*)>/gi,
      (_m, attrs: string) => {
        const alt = attrs.match(/\balt="([^"]*)"/i)?.[1] ?? "Logo";
        const w = attrs.match(/\bwidth="(\d+)"/i)?.[1] ?? "120";
        return `<div style="display:inline-block;border:1px dashed #8794a8;background:#f3f4f6;color:#5c6b82;font-size:11px;padding:8px;width:${w}px;text-align:center;">[${alt}]</div>`;
      },
    );
  }

  return (
    <div className={className}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-ds-border-subtle bg-ds-surface-2 p-0.5">
          <button
            type="button"
            onClick={() => setIphone(false)}
            className={`h-9 rounded-md px-3 text-[12px] ds-tap ${!iphone ? "bg-ds-surface-1 text-ds-text-1 shadow-sm" : "text-ds-text-3"}`}
          >
            Escritorio
          </button>
          <button
            type="button"
            onClick={() => setIphone(true)}
            className={`h-9 rounded-md px-3 text-[12px] ds-tap ${iphone ? "bg-ds-surface-1 text-ds-text-1 shadow-sm" : "text-ds-text-3"}`}
          >
            iPhone
          </button>
        </div>
        <label className="inline-flex min-h-11 items-center gap-2 text-[12px] text-ds-text-3">
          <input
            type="checkbox"
            checked={blockImages}
            onChange={(e) => setBlockImages(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          Simular imágenes bloqueadas
        </label>
      </div>

      <div
        className="mx-auto rounded-xl border border-ds-border-subtle bg-white p-4 text-black shadow-sm"
        style={{ maxWidth: iphone ? 320 : undefined }}
        onMouseOver={(e) => {
          const a = (e.target as HTMLElement).closest("a");
          setHoverHref(a?.getAttribute("href") ?? null);
        }}
        onMouseOut={() => setHoverHref(null)}
        onFocusCapture={(e) => {
          const a = (e.target as HTMLElement).closest("a");
          setHoverHref(a?.getAttribute("href") ?? null);
        }}
        onBlurCapture={() => setHoverHref(null)}
      >
        <p className="mb-3 text-[13px] leading-relaxed text-[#334155]">
          Quedo atento,
        </p>
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </div>

      {hoverHref && (
        <p className="mt-2 break-all rounded-lg bg-ds-surface-2 px-2 py-1.5 font-mono text-[12px] text-ds-text-2">
          {hoverHref}
        </p>
      )}

      <details className="mt-3 rounded-lg border border-ds-border-subtle bg-ds-surface-2 px-3 py-2">
        <summary className="cursor-pointer text-[12px] text-ds-text-3 ds-tap">
          HTML que se envía ({html.length} caracteres)
        </summary>
        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-[12px] text-ds-text-2">
          {html}
        </pre>
      </details>
    </div>
  );
}
