"use client";

import { useState } from "react";
import type { CorreoMessageDTO } from "@/modules/crm/email/correos.types";
import { emailPlainFallback } from "@/lib/sanitize-email-html";
import { EmailHtmlBody } from "./EmailHtmlBody";

function snippet(m: CorreoMessageDTO): string {
  const plain = emailPlainFallback(m.htmlBody, m.textBody);
  return plain.replace(/\s+/g, " ").trim().slice(0, 120);
}

function ExpandedBlock({ m }: { m: CorreoMessageDTO }) {
  return (
    <div className="rounded-xl border border-ds-border-subtle bg-ds-surface-1 p-3">
      {/* Cabecera estilo Gmail: De / Para / CC visibles antes del cuerpo. */}
      <div className="mb-2 space-y-0.5 border-b border-ds-border-subtle pb-2 text-[12px] text-ds-text-4">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate">
            <span className="font-medium text-ds-text-3">De:</span> {m.fromEmail || "—"}
          </span>
          <span className="shrink-0">
            {m.sentAt ? new Date(m.sentAt).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" }) : ""}
          </span>
        </div>
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
      <EmailHtmlBody htmlBody={m.htmlBody} textBody={m.textBody} />
    </div>
  );
}

function CollapsedCard({ m, onExpand }: { m: CorreoMessageDTO; onExpand: () => void }) {
  const from = m.direction === "out" ? m.toEmails[0] || "—" : m.fromEmail;
  return (
    <button
      type="button"
      onClick={onExpand}
      className="flex w-full flex-col gap-0.5 rounded-xl border border-ds-border-subtle bg-ds-surface-2 px-3 py-2 text-left ds-tap hover:bg-ds-surface-3"
    >
      <div className="flex items-center justify-between gap-2 text-[12px]">
        <span className="truncate font-medium text-ds-text-2">{from}</span>
        <span className="shrink-0 text-ds-text-4">
          {m.sentAt ? new Date(m.sentAt).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" }) : ""}
        </span>
      </div>
      <p className="truncate text-[12px] text-ds-text-4">{snippet(m)}</p>
    </button>
  );
}

/** Último mensaje expandido; anteriores en tarjetas colapsadas. */
export function CorreoMessages({ messages }: { messages: CorreoMessageDTO[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  if (messages.length === 0) {
    return <p className="text-[13px] text-ds-text-4">Sin mensajes.</p>;
  }
  const last = messages[messages.length - 1];
  const older = messages.slice(0, -1);

  return (
    <div className="space-y-2">
      {older.map((m) =>
        expanded.has(m.id) ? (
          <ExpandedBlock key={m.id} m={m} />
        ) : (
          <CollapsedCard key={m.id} m={m} onExpand={() => setExpanded((s) => new Set(s).add(m.id))} />
        ),
      )}
      <ExpandedBlock m={last} />
    </div>
  );
}
