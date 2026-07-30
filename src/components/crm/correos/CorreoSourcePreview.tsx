"use client";

/**
 * Vista compacta del correo origen dentro del panel IA (crear lead / cotización).
 * Permite contrastar la extracción con el hilo completo sin cerrar el panel.
 */

import { useEffect, useState } from "react";
import { ChevronDown, Mail } from "lucide-react";
import { Spinner } from "@/components/opai-ds";
import { cn } from "@/lib/utils";
import type { CorreoMessageDTO } from "@/modules/crm/email/correos.types";

type PreviewMsg = {
  id: string;
  fromEmail: string;
  subject: string;
  sentAt: string | null;
  body: string;
};

function bodyOf(m: CorreoMessageDTO): string {
  if (m.textBody?.trim()) return m.textBody.trim();
  if (m.htmlBody?.trim()) {
    return m.htmlBody
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  return "";
}

export function CorreoSourcePreview({
  threadId,
  defaultOpen = true,
}: {
  threadId: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState<string | null>(null);
  const [messages, setMessages] = useState<PreviewMsg[]>([]);

  useEffect(() => {
    if (!open || messages.length > 0 || loading) return;
    let live = true;
    setLoading(true);
    setError(null);
    fetch(`/api/crm/correos/${threadId}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "No se pudo cargar el correo");
        return j as {
          thread?: { subject?: string };
          messages?: CorreoMessageDTO[];
        };
      })
      .then((j) => {
        if (!live) return;
        setSubject(j.thread?.subject?.trim() || "Sin asunto");
        const msgs = (j.messages ?? [])
          .map((m) => ({
            id: m.id,
            fromEmail: m.fromEmail,
            subject: m.subject,
            sentAt: m.sentAt,
            body: bodyOf(m),
          }))
          .filter((m) => m.body || m.fromEmail);
        setMessages(msgs);
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : "Error"))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
    // Solo al abrir / cambiar hilo; no re-fetch por loading/messages.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, threadId]);

  return (
    <div className="mb-3 overflow-hidden rounded-xl border border-ds-border-subtle bg-ds-surface-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left ds-tap"
        aria-expanded={open}
      >
        <Mail className="h-4 w-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate text-ds-body font-medium text-ds-text-1">
          Correo completo
          {subject ? (
            <span className="font-normal text-ds-text-3"> · {subject}</span>
          ) : null}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-ds-text-3 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="max-h-[40vh] space-y-3 overflow-y-auto border-t border-ds-border-subtle px-3 py-2.5">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-4 text-ds-body text-ds-text-3">
              <Spinner className="h-4 w-4" /> Cargando hilo…
            </div>
          )}
          {error && <p className="text-ds-body text-status-danger-fg">{error}</p>}
          {!loading && !error && messages.length === 0 && (
            <p className="text-ds-body text-ds-text-3">Sin mensajes en el hilo.</p>
          )}
          {messages.map((m) => (
            <article key={m.id} className="min-w-0 space-y-1">
              <header className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[12px] text-ds-text-4">
                <span className="truncate font-medium text-ds-text-2">{m.fromEmail}</span>
                {m.sentAt && (
                  <time dateTime={m.sentAt}>
                    {new Date(m.sentAt).toLocaleString("es-CL", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                )}
              </header>
              {m.body ? (
                <p className="whitespace-pre-wrap break-words text-ds-body leading-relaxed text-ds-text-1">
                  {m.body}
                </p>
              ) : (
                <p className="text-ds-body text-ds-text-4">(Sin cuerpo)</p>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
