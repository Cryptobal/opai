"use client";

import type { RefObject } from "react";

export function QrAndLink({
  qrRef,
  url,
  copied,
  onCopy,
}: {
  qrRef: RefObject<HTMLCanvasElement | null>;
  url: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="flex gap-3 items-center">
      <canvas ref={qrRef} className="rounded border border-border" />
      <div className="flex-1 min-w-0">
        <div className="rounded-lg border border-border bg-muted/50 p-2 text-[10px] break-all">
          {url}
        </div>
        <button
          onClick={onCopy}
          className="mt-2 w-full rounded-lg border border-border px-3 py-2 text-xs text-foreground/90"
        >
          {copied ? "✓ Copiado" : "Copiar link"}
        </button>
      </div>
    </div>
  );
}

export interface SendResultRow {
  channel: "whatsapp" | "email" | "sms" | "copy-link";
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  preview?: string;
}

export function SendResultList({ rows }: { rows: SendResultRow[] }) {
  return (
    <ul className="text-xs space-y-1">
      {rows.map((r, i) => (
        <li key={i} className={r.ok ? "text-emerald-700" : "text-rose-700"}>
          {r.ok ? "✓" : "✗"} {r.channel}
          {r.skipped ? " (no configurado)" : ""}
          {r.reason ? ` · ${r.reason}` : ""}
        </li>
      ))}
    </ul>
  );
}
