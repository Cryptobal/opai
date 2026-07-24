"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { CorreoMessageDTO } from "@/modules/crm/email/correos.types";
import { emailPlainFallback } from "@/lib/sanitize-email-html";
import { EmailHtmlBody } from "./EmailHtmlBody";
import { parseSender } from "./correo-sender";

function snippet(m: CorreoMessageDTO): string {
  const plain = emailPlainFallback(m.htmlBody, m.textBody);
  return plain.replace(/\s+/g, " ").trim().slice(0, 120);
}

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" }) : "";
}

type ImagePrefs = {
  alwaysShowImages?: boolean;
  onAlwaysShowImages?: () => void;
};

/** Tarjeta de mensaje: cabecera siempre visible (tap = abrir/cerrar) + cuerpo. */
function MessageCard({
  m, open, onToggle, alwaysShowImages, onAlwaysShowImages,
}: { m: CorreoMessageDTO; open: boolean; onToggle: () => void } & ImagePrefs) {
  const sender = parseSender(m.fromEmail);
  const who =
    m.direction === "out"
      ? m.toEmails[0] || "—"
      : sender.name || sender.email || m.fromEmail || "—";
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <div className="overflow-hidden rounded-xl border border-ds-border-subtle bg-ds-surface-1">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-2 px-3 py-2 text-left ds-tap hover:bg-ds-surface-2"
      >
        <Chevron className="mt-0.5 h-4 w-4 shrink-0 text-ds-text-4" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 text-[12px]">
            <span className="truncate font-medium text-ds-text-2">
              {m.direction === "out" ? "Para: " : ""}
              {who}
            </span>
            <span className="shrink-0 text-ds-text-4">{fmtDate(m.sentAt)}</span>
          </div>
          {!open && <p className="truncate text-[12px] text-ds-text-4">{snippet(m)}</p>}
        </div>
      </button>
      {open && (
        <div className="border-t border-ds-border-subtle px-3 py-2">
          <div className="mb-2 space-y-0.5 text-[12px] text-ds-text-4">
            <p className="truncate">
              <span className="font-medium text-ds-text-3">De:</span>{" "}
              {sender.name || sender.email || m.fromEmail || "—"}
              {sender.name && sender.email ? (
                <span className="text-ds-text-4"> &lt;{sender.email}&gt;</span>
              ) : null}
            </p>
            {m.toEmails.length > 0 && (
              <p className="truncate">
                <span className="font-medium text-ds-text-3">Para:</span> {m.toEmails.join(", ")}
              </p>
            )}
            {m.ccEmails.length > 0 && (
              <p className="truncate">
                <span className="font-medium text-ds-text-3">CC:</span> {m.ccEmails.join(", ")}
              </p>
            )}
          </div>
          <EmailHtmlBody
            htmlBody={m.htmlBody}
            textBody={m.textBody}
            defaultShowImages={alwaysShowImages}
            onAlwaysShowImages={onAlwaysShowImages}
          />
        </div>
      )}
    </div>
  );
}

/** Cadena del hilo: por defecto el último abierto; todos se abren y cierran. */
export function CorreoMessages({
  messages, alwaysShowImages, onAlwaysShowImages,
}: { messages: CorreoMessageDTO[] } & ImagePrefs) {
  const lastId = messages[messages.length - 1]?.id;
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(lastId ? [lastId] : []));
  if (messages.length === 0) {
    return <p className="text-[13px] text-ds-text-4">Sin mensajes.</p>;
  }
  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="space-y-2">
      {messages.map((m) => (
        <MessageCard key={m.id} m={m} open={expanded.has(m.id)} onToggle={() => toggle(m.id)}
          alwaysShowImages={alwaysShowImages} onAlwaysShowImages={onAlwaysShowImages} />
      ))}
    </div>
  );
}
