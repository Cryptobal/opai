"use client";

import { useState } from "react";
import type { CorreoMessageDTO } from "@/modules/crm/email/correos.types";
import { EmailHtmlBody } from "./EmailHtmlBody";

function MessageBlock({ m }: { m: CorreoMessageDTO }) {
  return (
    <div className="rounded-xl border border-ds-border-subtle bg-ds-surface-1 p-3">
      <div className="mb-1 flex items-center justify-between gap-2 text-[12px] text-ds-text-4">
        <span className="truncate">
          {m.direction === "out" ? "Para: " : "De: "}
          {m.direction === "out" ? m.toEmails.join(", ") || "—" : m.fromEmail}
        </span>
        <span className="shrink-0">
          {m.sentAt ? new Date(m.sentAt).toLocaleString("es-CL") : ""}
        </span>
      </div>
      <EmailHtmlBody htmlBody={m.htmlBody} textBody={m.textBody} />
    </div>
  );
}

/** Último mensaje expandido + anteriores colapsados. */
export function CorreoMessages({ messages }: { messages: CorreoMessageDTO[] }) {
  const [showAll, setShowAll] = useState(false);
  if (messages.length === 0) {
    return <p className="text-[13px] text-ds-text-4">Sin mensajes.</p>;
  }
  const last = messages[messages.length - 1];
  const older = messages.slice(0, -1);

  return (
    <div className="space-y-2">
      {older.length > 0 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="text-[12px] text-primary ds-tap"
        >
          {showAll
            ? "Ocultar anteriores"
            : `Ver ${older.length} mensaje${older.length !== 1 ? "s" : ""} anterior${older.length !== 1 ? "es" : ""}`}
        </button>
      )}
      {showAll && older.map((m) => <MessageBlock key={m.id} m={m} />)}
      <MessageBlock m={last} />
    </div>
  );
}
