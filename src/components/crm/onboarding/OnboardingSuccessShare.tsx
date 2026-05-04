"use client";

import { useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  MapPin,
  MessageSquare,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { CreatedTicketSummary } from "./whatsapp-summary";

export function OnboardingSuccessShare({
  ticketCount,
  message,
  dealUrl,
  ticketsUrl,
  hasMaps,
  mapsUrl,
  recipientPhone,
  tickets,
  onClose,
}: {
  ticketCount: number;
  message: string;
  dealUrl: string;
  ticketsUrl?: string;
  hasMaps: boolean;
  mapsUrl?: string | null;
  recipientPhone?: string | null;
  tickets: CreatedTicketSummary[];
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message);

  const sendToContact = () => {
    const text = encodeURIComponent(editing ? draft : message);
    const digits = recipientPhone ? recipientPhone.replace(/[^\d]/g, "") : "";
    // Normalizamos a formato CL (56...) si el número no incluye código país.
    const phone = digits
      ? digits.startsWith("56")
        ? digits
        : `56${digits}`
      : null;
    const url = phone
      ? `https://wa.me/${phone}?text=${text}`
      : `https://wa.me/?text=${text}`;
    window.open(url, "_blank");
  };

  const sendToGroup = () => {
    const text = encodeURIComponent(editing ? draft : message);
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(editing ? draft : message);
      toast.success("Mensaje copiado");
    } catch {
      toast.error("No se pudo copiar el mensaje");
    }
  };

  return (
    <div className="space-y-5">
      {/* Hero success */}
      <div className="relative overflow-hidden rounded-2xl border border-status-ok/30 bg-gradient-to-br from-status-ok/[0.08] to-status-ok/[0.02] px-5 py-6">
        <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-status-ok/10 blur-2xl" />
        <div className="relative flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-status-ok/15 ring-4 ring-status-ok/10">
            <Check
              className="h-5 w-5 text-status-ok-fg"
              strokeWidth={3}
            />
          </span>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-ds-text-1">
                Onboarding creado
              </h3>
              <Sparkles className="h-3.5 w-3.5 text-status-ok-fg" />
            </div>
            <p className="mt-0.5 text-sm text-ds-text-2">
              {ticketCount} ticket{ticketCount === 1 ? "" : "s"} generado
              {ticketCount === 1 ? "" : "s"}. Comparte el resumen con el equipo
              para arrancar.
            </p>
          </div>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-2">
        <a
          href={dealUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center justify-between gap-2 rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 py-2 text-xs text-ds-text-2 transition-colors hover:border-primary/50 hover:bg-primary/5"
        >
          <span>Negocio</span>
          <ExternalLink className="h-3.5 w-3.5 text-ds-text-3 transition-colors group-hover:text-primary" />
        </a>
        {ticketsUrl ? (
          <a
            href={ticketsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center justify-between gap-2 rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 py-2 text-xs text-ds-text-2 transition-colors hover:border-primary/50 hover:bg-primary/5"
          >
            <span>Tickets</span>
            <span className="flex items-center gap-1">
              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                {ticketCount}
              </span>
              <ExternalLink className="h-3.5 w-3.5 text-ds-text-3 transition-colors group-hover:text-primary" />
            </span>
          </a>
        ) : (
          <div className="rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 py-2 text-xs text-ds-text-3">
            Tickets: {ticketCount}
          </div>
        )}
        {hasMaps && mapsUrl ? (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center justify-between gap-2 rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 py-2 text-xs text-ds-text-2 transition-colors hover:border-primary/50 hover:bg-primary/5"
          >
            <span>Maps</span>
            <MapPin className="h-3.5 w-3.5 text-ds-text-3 transition-colors group-hover:text-primary" />
          </a>
        ) : (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 py-2 text-xs text-ds-text-3">
            <span>Maps</span>
            <MapPin className="h-3.5 w-3.5 text-ds-text-4" />
          </div>
        )}
      </div>

      {/* Tickets resumen */}
      {tickets.length > 0 ? (
        <section className="rounded-xl border border-ds-border-default bg-ds-surface-1 p-4">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-ds-text-3">
            Pendientes
          </h4>
          <ul className="space-y-1.5">
            {tickets.slice(0, 6).map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="truncate text-ds-text-1">{t.title}</span>
                <span className="shrink-0 text-[11px] tabular-nums text-ds-text-3">
                  {t.dueDate
                    ? t.dueDate.toLocaleDateString("es-CL", {
                        day: "2-digit",
                        month: "short",
                      })
                    : "—"}
                </span>
              </li>
            ))}
            {tickets.length > 6 ? (
              <li className="text-[11px] text-ds-text-3">
                +{tickets.length - 6} más…
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}

      {/* Mensaje WhatsApp */}
      <section className="rounded-xl border border-ds-border-default bg-ds-surface-1 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-ds-text-3">
            Mensaje para WhatsApp
          </h4>
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className={cn(
              "rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors",
              editing
                ? "bg-primary/10 text-primary"
                : "text-ds-text-3 hover:bg-ds-surface-2 hover:text-ds-text-1",
            )}
          >
            {editing ? "Listo" : "Editar"}
          </button>
        </div>
        {editing ? (
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={10}
            className="min-h-[200px] resize-y font-mono text-xs leading-relaxed"
          />
        ) : (
          <pre className="max-h-[260px] overflow-y-auto whitespace-pre-wrap rounded-md bg-ds-surface-0/60 p-3 font-mono text-[11px] leading-relaxed text-ds-text-2">
            {message}
          </pre>
        )}
      </section>

      {/* Actions */}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Button
          variant="ghost"
          onClick={onClose}
          className="text-ds-text-3 hover:text-ds-text-1"
        >
          Cerrar
        </Button>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button
            variant="outline"
            onClick={copyMessage}
            className="gap-1.5"
          >
            <Copy className="h-3.5 w-3.5" /> Copiar
          </Button>
          <Button
            variant="outline"
            onClick={sendToGroup}
            className="gap-1.5"
          >
            <MessageSquare className="h-3.5 w-3.5" /> A un grupo
          </Button>
          <Button
            onClick={sendToContact}
            className="gap-1.5 bg-status-ok text-white hover:brightness-110"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            {recipientPhone ? "Enviar al contacto" : "WhatsApp"}
          </Button>
        </div>
      </div>
    </div>
  );
}
