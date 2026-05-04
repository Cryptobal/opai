"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { PlatformConfigPanel } from "./PlatformConfigPanel";
import type { PlatformConfigStatus } from "./types";
import { Surface } from "@/components/opai-ds/Surface";
import { SectionHeader } from "@/components/opai-ds/SectionHeader";
import { Tag, type TagVariant } from "@/components/opai-ds/Tag";
import { Skeleton } from "@/components/opai-ds/Skeleton";

type Step = {
  id: string;
  title: string;
  status: string;
  isCustom: boolean;
  resolvedAt: string | null;
  ticket: {
    id: string;
    code: string;
    title: string;
    status: string;
    priority: string;
    assignedTeam: string;
    assignedTo: string | null;
    slaDueAt: string | null;
    slaBreached: boolean;
  } | null;
};

type Onboarding = {
  id: string;
  status: string;
  serviceStartDate: string;
  startedAt: string;
  completedAt: string | null;
  percentComplete: number;
  steps: Step[];
  platformConfigStatus: PlatformConfigStatus;
  account: { id: string; name: string } | null;
  installation: { id: string; name: string; address: string | null } | null;
  playbook: { id: string; name: string; version: number };
};

const STEP_STATUS_TO_TAG: Record<string, { label: string; variant: TagVariant }> = {
  open:             { label: "Abierto",    variant: "info"    },
  in_progress:      { label: "En curso",   variant: "info"    },
  resolved:         { label: "Resuelto",   variant: "ok"      },
  closed:           { label: "Cerrado",    variant: "neutral" },
  skipped:          { label: "No aplica",  variant: "neutral" },
  pending_approval: { label: "Aprobación", variant: "warn"    },
  waiting:          { label: "En espera",  variant: "neutral" },
};

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}

export function OnboardingHub({
  onboardingId,
  accountId,
}: {
  onboardingId: string;
  accountId: string;
}) {
  const [data, setData] = useState<Onboarding | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/onboarding/${onboardingId}`);
      const json = await res.json();
      if (json?.success) setData(json.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onboardingId]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/onboarding/${onboardingId}/refresh-status`, {
        method: "POST",
      });
      const json = await res.json();
      if (!json?.success) throw new Error(json?.error ?? "Error refrescando");
      await load();
      toast.success("Estado actualizado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo actualizar");
    } finally {
      setRefreshing(false);
    }
  };

  const complete = async () => {
    try {
      const res = await fetch(`/api/onboarding/${onboardingId}/complete`, {
        method: "POST",
      });
      const json = await res.json();
      if (!json?.success) throw new Error(json?.error ?? "No se pudo completar");
      toast.success("Onboarding marcado como completado");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al completar");
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto max-w-4xl space-y-4 p-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="container mx-auto max-w-4xl p-4">
        <Surface elevation={1} padding="md">
          <p className="text-sm text-ds-text-3">No se pudo cargar el onboarding.</p>
        </Surface>
      </div>
    );
  }

  const startDays = daysUntil(data.serviceStartDate);
  const allDone = data.steps.every((s) =>
    ["resolved", "closed", "skipped"].includes(s.status),
  );
  const startDaysLabel = startDays >= 0 ? `+${startDays}` : `${startDays}`;

  return (
    <div className="container mx-auto max-w-4xl space-y-4 p-4">
      <Link
        href={`/crm/accounts/${accountId}`}
        className="inline-block text-xs text-ds-text-3 hover:underline"
      >
        ← Volver a la cuenta
      </Link>

      {/* Header / hero */}
      <Surface elevation={1} padding="md">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <p className="text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4">
              Onboarding · {data.playbook.name} v{data.playbook.version}
            </p>
            <h2 className="font-display text-2xl font-bold tracking-tight text-ds-text-1">
              {data.account?.name ?? "Cliente"}
            </h2>
            {data.installation ? (
              <p className="text-sm text-ds-text-3">
                {data.installation.name}
                {data.installation.address ? ` · ${data.installation.address}` : ""}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
              {refreshing ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
              )}
              Refrescar
            </Button>
            {allDone && data.status === "in_progress" ? (
              <Button size="sm" onClick={complete}>
                <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
                Completar onboarding
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <Stat label="Avance" value={`${data.percentComplete}%`} />
          <Stat
            label="Inicio servicio"
            value={new Date(data.serviceStartDate).toLocaleDateString("es-CL")}
          />
          <Stat label="Días" value={startDaysLabel} />
        </div>
      </Surface>

      {/* Steps */}
      <Surface elevation={1} padding="md" className="space-y-3">
        <SectionHeader
          size="md"
          title="Tickets del onboarding"
          hint={`${data.steps.length} pasos`}
        />
        <ul className="space-y-2">
          {data.steps.map((s) => {
            const meta =
              STEP_STATUS_TO_TAG[s.status] ?? { label: s.status, variant: "neutral" as TagVariant };
            return (
              <li
                key={s.id}
                className="flex items-start justify-between gap-3 rounded-ds-md border border-ds-border-subtle bg-ds-surface-2 p-3"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Tag variant={meta.variant} size="sm">
                      {meta.label}
                    </Tag>
                    <span className="text-sm font-medium text-ds-text-1 truncate">
                      {s.ticket?.code ? (
                        <span className="font-mono tabular-nums text-ds-text-3">
                          {s.ticket.code} ·{" "}
                        </span>
                      ) : null}
                      {s.title}
                    </span>
                  </div>
                  {s.ticket ? (
                    <p className="text-xs text-ds-text-3">
                      {s.ticket.assignedTeam}
                      {s.ticket.slaDueAt ? (
                        <>
                          {" "}· SLA{" "}
                          <span
                            className={
                              s.ticket.slaBreached
                                ? "font-mono tabular-nums text-status-danger-fg"
                                : "font-mono tabular-nums"
                            }
                          >
                            {new Date(s.ticket.slaDueAt).toLocaleDateString("es-CL")}
                          </span>
                        </>
                      ) : null}
                    </p>
                  ) : null}
                </div>
                {s.ticket ? (
                  <Link
                    href={`/ops/tickets/${s.ticket.id}`}
                    className="shrink-0 text-xs font-medium text-primary hover:underline"
                  >
                    Ver ticket →
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Surface>

      {/* Platform config */}
      <PlatformConfigPanel
        status={data.platformConfigStatus}
        installationId={data.installation?.id ?? null}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] uppercase tracking-wider text-ds-text-4">{label}</p>
      <p className="font-mono tabular-nums text-lg font-semibold text-ds-text-1">{value}</p>
    </div>
  );
}
