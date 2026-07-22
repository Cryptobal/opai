"use client";

import { Avatar, Tag } from "@/components/opai-ds";
import { cn } from "@/lib/utils";

export type DetailParticipant = {
  userId: string;
  name: string;
  role: string;
  responseStatus: string;
  hasGoogle: boolean;
};

export type DetailExternal = {
  email: string;
  name: string | null;
  responseStatus: string;
};

const ROLE_LABELS: Record<string, string> = {
  organizer: "Organiza",
  owner: "Responsable",
  required: "Participante",
  optional: "Opcional",
  watcher: "Seguidor",
};

/** Badge RSVP (spec §6): ✓ Va / ? Sin responder / ◉ OPAI / ✕ No va. */
function RsvpBadge({ status, hasGoogle }: { status: string; hasGoogle: boolean }) {
  if (status === "accepted") {
    return <span className="rounded-full bg-status-ok-soft px-2 py-0.5 text-[12px] text-status-ok-fg">✓ Va</span>;
  }
  if (status === "declined") {
    return <span className="rounded-full bg-status-danger-soft px-2 py-0.5 text-[12px] text-status-danger-fg">✕ No va</span>;
  }
  if (status === "tentative") {
    return <span className="rounded-full bg-status-warn-soft px-2 py-0.5 text-[12px] text-status-warn-fg">? Tentativo</span>;
  }
  if (!hasGoogle) {
    return <span className="rounded-full bg-primary/[0.12] px-2 py-0.5 text-[12px] text-primary">◉ OPAI</span>;
  }
  return <span className="rounded-full bg-status-warn-soft px-2 py-0.5 text-[12px] text-status-warn-fg">? Sin responder</span>;
}

export function ParticipantsBlock({
  participants,
  externals,
  fallbackName,
}: {
  participants: DetailParticipant[];
  externals: DetailExternal[];
  fallbackName: string | null;
}) {
  if (!participants.length && !externals.length) {
    if (!fallbackName) return null;
    return (
      <section className="space-y-2">
        <p className="text-[12px] font-medium uppercase tracking-wide text-ds-text-4">Participantes</p>
        <div className="flex items-center gap-2.5">
          <Avatar name={fallbackName} size="md" className="h-[30px] w-[30px]" />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-ds-text-1">{fallbackName}</p>
            <p className="text-[12px] text-ds-text-4">Responsable</p>
          </div>
        </div>
      </section>
    );
  }
  return (
    <section className="space-y-2">
      <p className="text-[12px] font-medium uppercase tracking-wide text-ds-text-4">Participantes</p>
      {participants.map((p) => (
        <div key={p.userId} className="flex items-center gap-2.5">
          <Avatar name={p.name} size="md" className="h-[30px] w-[30px]" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-ds-text-1">{p.name}</p>
            <p className="text-[12px] text-ds-text-4">{ROLE_LABELS[p.role] ?? p.role}</p>
          </div>
          <RsvpBadge status={p.responseStatus} hasGoogle={p.hasGoogle} />
        </div>
      ))}
      {externals.map((e) => (
        <div key={e.email} className="flex items-center gap-2.5">
          <Avatar name={e.name ?? e.email} size="md" variant="neutral" className="h-[30px] w-[30px]" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-ds-text-1">{e.name ?? e.email}</p>
            <p className="truncate text-[12px] text-ds-text-4">{e.email}</p>
          </div>
          <RsvpBadge status={e.responseStatus} hasGoogle />
        </div>
      ))}
    </section>
  );
}

export function ContextBlock({
  account,
  installation,
  deal,
}: {
  account: { id: string; name: string } | null;
  installation: { id: string; name: string } | null;
  deal: { id: string; title: string } | null;
}) {
  if (!account && !installation && !deal) return null;
  return (
    <section className="space-y-1.5">
      <p className="text-[12px] font-medium uppercase tracking-wide text-ds-text-4">Contexto</p>
      <div className="flex flex-wrap gap-1.5">
        {account && (
          <a href={`/crm/cuentas/${account.id}`} className={ctxChip()}>
            <Tag variant="neutral" className="text-[12px]">Cuenta</Tag> {account.name}
          </a>
        )}
        {installation && (
          <a href={`/crm/instalaciones/${installation.id}`} className={ctxChip()}>
            <Tag variant="neutral" className="text-[12px]">Instalación</Tag> {installation.name}
          </a>
        )}
        {deal && (
          <a href={`/crm/deals/${deal.id}`} className={ctxChip()}>
            <Tag variant="neutral" className="text-[12px]">Negocio</Tag> {deal.title}
          </a>
        )}
      </div>
    </section>
  );
}

function ctxChip(): string {
  return cn(
    "inline-flex max-w-full items-center gap-1.5 truncate rounded-full",
    "opai-glass-soft px-2.5 py-1.5 text-[13px] text-ds-text-1 ds-tap",
  );
}
