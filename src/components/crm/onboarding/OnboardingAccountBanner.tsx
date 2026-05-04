"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, Clock3, Sparkles } from "lucide-react";
import { OnboardingClientModal } from "./OnboardingClientModal";

type Summary = {
  id: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  serviceStartDate: string;
  total: number;
  done: number;
  nextDueAt: string | null;
};

type Probe = {
  hasOnboarding: boolean;
  onboarding?: Summary;
  pendingDealId?: string;
  defaultPlaybookId?: string;
};

export function OnboardingAccountBanner({ accountId }: { accountId: string }) {
  const [probe, setProbe] = useState<Probe | null>(null);
  const [modalDealId, setModalDealId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/onboarding/by-account?accountId=${accountId}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled || !j?.success) return;
        setProbe(j.data);
      })
      .catch(() => {
        if (!cancelled) setProbe(null);
      });
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  if (!probe) return null;

  if (probe.hasOnboarding && probe.onboarding) {
    const o = probe.onboarding;
    const pct = o.total === 0 ? 0 : Math.round((o.done / o.total) * 100);
    return (
      <Card>
        <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium">
              {o.status === "completed" ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : (
                <Clock3 className="h-4 w-4 text-blue-500" />
              )}
              Onboarding {o.status === "completed" ? "completado" : "en progreso"}
            </div>
            <p className="text-xs text-muted-foreground">
              {o.done} de {o.total} steps · {pct}%
              {o.nextDueAt
                ? ` · próximo vencimiento ${new Date(o.nextDueAt).toLocaleDateString("es-CL")}`
                : ""}
            </p>
          </div>
          <Link
            href={`/crm/accounts/${accountId}/onboarding/${o.id}`}
            className="text-sm text-primary hover:underline"
          >
            Ver detalle →
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (probe.pendingDealId) {
    return (
      <>
        <Card className="border-blue-200 bg-blue-50/40 dark:border-blue-900/40 dark:bg-blue-950/20">
          <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2">
              <Sparkles className="mt-0.5 h-4 w-4 text-blue-500" />
              <div>
                <p className="text-sm font-medium">Onboarding pendiente</p>
                <p className="text-xs text-muted-foreground">
                  Este cliente fue ganado pero aún no se inició el onboarding.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => setModalDealId(probe.pendingDealId ?? null)}
            >
              Iniciar onboarding
            </Button>
          </CardContent>
        </Card>
        {modalDealId ? (
          <OnboardingClientModal
            open
            dealId={modalDealId}
            defaultPlaybookId={probe.defaultPlaybookId}
            onClose={() => setModalDealId(null)}
            onCreated={() => {
              setModalDealId(null);
              window.location.reload();
            }}
          />
        ) : null}
      </>
    );
  }

  return null;
}
