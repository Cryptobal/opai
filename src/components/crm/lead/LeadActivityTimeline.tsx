"use client";

import { Sparkles, Eye, UserCheck, CheckCircle2, XCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CrmLead } from "@/types";
import { NotesSection } from "../NotesSection";

/**
 * LeadActivityTimeline — eventos de ciclo de vida del lead + el compositor de
 * notas existente (NotesSection, con su propio backend). No fabrica persistencia.
 */
export interface LeadActivityTimelineProps {
  lead: CrmLead;
  currentUserId: string;
}

type TimelineItem = {
  key: string;
  icon: LucideIcon;
  iconClass: string;
  title: string;
  detail?: string | null;
  at: string | null;
};

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  phone: "llamada",
  email: "email",
  in_person: "en persona",
};

function fmt(at: string | null): string {
  if (!at) return "";
  return new Date(at).toLocaleString("es-CL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function readRejection(lead: CrmLead): { reason?: string; note?: string; emailSent?: boolean } | null {
  const meta = lead.metadata;
  if (!meta || typeof meta !== "object") return null;
  const rejection = (meta as Record<string, unknown>).rejection;
  if (!rejection || typeof rejection !== "object" || Array.isArray(rejection)) return null;
  const r = rejection as Record<string, unknown>;
  return {
    reason: typeof r.reason === "string" ? r.reason : undefined,
    note: typeof r.note === "string" ? r.note : undefined,
    emailSent: Boolean(r.emailSent),
  };
}

function buildItems(lead: CrmLead): TimelineItem[] {
  const items: TimelineItem[] = [
    {
      key: "created",
      icon: Sparkles,
      iconClass: "text-primary",
      title: "Lead creado",
      detail: lead.source || null,
      at: lead.createdAt,
    },
  ];
  if (lead.firstViewedAt) {
    items.push({ key: "viewed", icon: Eye, iconClass: "text-tint-sky-fg", title: "Primer visto", at: lead.firstViewedAt });
  }
  if (lead.firstContactAt) {
    const ch = lead.firstContactChannel ? CHANNEL_LABELS[lead.firstContactChannel] ?? lead.firstContactChannel : null;
    items.push({
      key: "contacted",
      icon: UserCheck,
      iconClass: "text-status-ok-fg",
      title: "Primer contacto",
      detail: ch ? `Vía ${ch}` : null,
      at: lead.firstContactAt,
    });
  }
  if (lead.status === "approved") {
    items.push({ key: "approved", icon: CheckCircle2, iconClass: "text-status-ok-fg", title: "Aprobado", at: lead.approvedAt ?? null });
  }
  if (lead.status === "rejected") {
    const rej = readRejection(lead);
    const detail = [rej?.reason, rej?.note].filter(Boolean).join(" · ") || null;
    items.push({
      key: "rejected",
      icon: XCircle,
      iconClass: "text-status-danger-fg",
      title: rej?.emailSent ? "Rechazado (email enviado)" : "Rechazado",
      detail,
      at: null,
    });
  }
  // Orden cronológico ascendente cuando hay fecha; los sin fecha van al final.
  return items;
}

export function LeadActivityTimeline({ lead, currentUserId }: LeadActivityTimelineProps) {
  const items = buildItems(lead);

  return (
    <section className="rounded-2xl border border-ds-border-subtle bg-card">
      <header className="px-4 pt-3.5 pb-1">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ds-text-3">Actividad</h3>
      </header>

      {/* Compositor + hilos de notas (backend propio) */}
      <div className="px-4 pb-2">
        <NotesSection entityType="lead" entityId={lead.id} currentUserId={currentUserId} />
      </div>

      {/* Eventos de ciclo de vida */}
      <ol className="space-y-1 border-t border-ds-border-subtle px-4 py-3">
        {items.map((it) => (
          <li key={it.key} className="flex items-start gap-3 py-1.5">
            <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-ds-surface-3", it.iconClass)}>
              <it.icon className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-foreground">
                <span className="font-medium">{it.title}</span>
                {it.detail && <span className="text-ds-text-3"> — {it.detail}</span>}
              </p>
              {it.at && <time className="text-xs text-ds-text-3">{fmt(it.at)}</time>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
