"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, RefreshCw, CheckCircle2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { PlatformConfigPanel } from "./PlatformConfigPanel";
import type { PlatformConfigStatus } from "./types";

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

function badgeForStatus(status: string): string {
  if (["resolved", "closed"].includes(status)) {
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
  }
  if (status === "skipped") return "bg-gray-100 text-gray-600";
  if (status === "in_progress") return "bg-blue-100 text-blue-700";
  return "bg-amber-100 text-amber-700";
}

function daysUntil(dateStr: string): number {
  const d = new Date(dateStr).getTime();
  return Math.ceil((d - Date.now()) / 86_400_000);
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

  const refreshStatus = async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/onboarding/${onboardingId}/refresh-status`, {
        method: "POST",
      });
      const json = await res.json();
      if (!json?.success) throw new Error(json?.error ?? "Error refrescando");
      toast.success("Estado actualizado");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error refrescando");
    } finally {
      setRefreshing(false);
    }
  };

  const completeOnboarding = async () => {
    try {
      const res = await fetch(`/api/onboarding/${onboardingId}/complete`, {
        method: "POST",
      });
      const json = await res.json();
      if (!json?.success) throw new Error(json?.error ?? "No se pudo completar");
      toast.success("Onboarding completado");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error completando");
    }
  };

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const stepsByPhase = data.steps.reduce<Record<string, Step[]>>((acc, s) => {
    const ticketSlug = s.ticket?.code ?? "";
    const phase = inferPhase(s, ticketSlug);
    (acc[phase] ||= []).push(s);
    return acc;
  }, {});
  const phases = Object.keys(stepsByPhase).sort();

  const allTerminal = data.steps.every((s) =>
    ["resolved", "closed", "skipped"].includes(s.status),
  );
  const daysLeft = daysUntil(data.serviceStartDate);

  return (
    <div className="container mx-auto max-w-4xl space-y-4 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href={`/crm/accounts/${accountId}`}
            className="text-xs text-muted-foreground hover:underline"
          >
            ← Volver a la cuenta
          </Link>
          <h1 className="mt-1 text-xl font-semibold">
            Onboarding · {data.account?.name ?? "Cliente"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Sitio: {data.installation?.name ?? "—"} · Inicio:{" "}
            {new Date(data.serviceStartDate).toLocaleDateString("es-CL")} ·{" "}
            {data.percentComplete}% completado · {daysLeft} días restantes
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            size="sm"
            onClick={refreshStatus}
            disabled={refreshing}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refrescar estado
          </Button>
          {data.status === "in_progress" && allTerminal ? (
            <Button size="sm" onClick={completeOnboarding}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Marcar como completado
            </Button>
          ) : null}
        </div>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <h2 className="text-sm font-semibold">Tickets</h2>
          {phases.map((phase) => (
            <div key={phase} className="space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Fase {phase}
              </h3>
              <ul className="space-y-2">
                {stepsByPhase[phase].map((s) => (
                  <li
                    key={s.id}
                    className="flex flex-col gap-1 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">{s.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.ticket
                          ? `${s.ticket.code} · ${s.ticket.assignedTeam} · ${s.ticket.priority}`
                          : "Sin ticket"}
                        {s.ticket?.slaDueAt
                          ? ` · vence ${new Date(s.ticket.slaDueAt).toLocaleDateString("es-CL")}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${badgeForStatus(s.status)}`}
                      >
                        {s.status}
                      </span>
                      {s.ticket ? (
                        <Link
                          href={`/ops/tickets/${s.ticket.id}`}
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          Ver ticket <ExternalLink className="h-3 w-3" />
                        </Link>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>

      <PlatformConfigPanel
        status={data.platformConfigStatus}
        installationId={data.installation?.id ?? null}
      />
    </div>
  );
}

function inferPhase(step: Step, code: string): string {
  if (step.isCustom) return "4";
  const t = step.title.toLowerCase();
  if (t.includes("contrato")) return "1";
  if (t.includes("vulnerabilidad") || t.includes("directiva") || t.includes("protocolo"))
    return "2";
  if (t.includes("test") || t.includes("uniforme")) return "3";
  return code ? "2" : "4";
}
