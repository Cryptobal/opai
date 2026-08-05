"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { CrmDeal, CrmPipelineStage } from "@/types";

type Opts = {
  stages: CrmPipelineStage[];
  findDeal: (id: string) => CrmDeal | undefined;
  onOptimistic: (dealId: string, stage: CrmPipelineStage) => void;
  onRollback: (deal: CrmDeal) => void;
  onSuccess: (deal: CrmDeal) => void;
  onRefreshSummary: () => void;
};

export function useDealStageMove({
  stages,
  findDeal,
  onOptimistic,
  onRollback,
  onSuccess,
  onRefreshSummary,
}: Opts) {
  const router = useRouter();
  const [acceptedPending, setAcceptedPending] = useState<{
    dealId: string;
    stageId: string;
  } | null>(null);
  const [acceptedDate, setAcceptedDate] = useState("");
  const [onboardingTarget, setOnboardingTarget] = useState<{
    dealId: string;
    defaultPlaybookId?: string;
  } | null>(null);

  const updateStage = useCallback(
    async (dealId: string, stageId: string, extraBody?: Record<string, unknown>) => {
      if (!stageId) return;
      const current = findDeal(dealId);
      if (!current || current.stage?.id === stageId) return;
      const nextStage = stages.find((s) => s.id === stageId);
      if (!nextStage) return;

      if (nextStage.isAccepted && !extraBody?.serviceStartDate) {
        setAcceptedPending({ dealId, stageId });
        setAcceptedDate("");
        return;
      }

      const snapshot = JSON.parse(JSON.stringify(current)) as CrmDeal;
      onOptimistic(dealId, nextStage);

      try {
        const response = await fetch(`/api/crm/deals/${dealId}/stage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stageId, ...extraBody }),
        });
        const payload = await response.json();
        if (!response.ok) {
          if (payload?.error?.includes("fecha de inicio")) {
            onRollback(snapshot);
            setAcceptedPending({ dealId, stageId });
            setAcceptedDate("");
            return;
          }
          throw new Error(payload?.error || "Error cambiando etapa");
        }
        onSuccess({ ...current, ...payload.data });
        onRefreshSummary();
        if (payload?.requiresOnboarding && payload?.defaultPlaybookId) {
          setOnboardingTarget({ dealId, defaultPlaybookId: payload.defaultPlaybookId });
        } else if (payload?.existingOnboarding?.id && payload?.existingOnboarding?.accountId) {
          const accountId = payload.existingOnboarding.accountId as string;
          const onboardingId = payload.existingOnboarding.id as string;
          toast.success("Negocio ganado. Onboarding ya iniciado.", {
            action: {
              label: "Ver onboarding",
              onClick: () =>
                router.push(`/crm/accounts/${accountId}/onboarding/${onboardingId}`),
            },
            duration: 8000,
          });
        }
      } catch (error) {
        console.error(error);
        onRollback(snapshot);
        toast.error("No se pudo actualizar la etapa.");
      }
    },
    [
      findDeal,
      stages,
      onOptimistic,
      onRollback,
      onSuccess,
      onRefreshSummary,
      router,
    ],
  );

  const confirmAccepted = useCallback(async () => {
    if (!acceptedPending || !acceptedDate) return;
    const { dealId, stageId } = acceptedPending;
    setAcceptedPending(null);
    await updateStage(dealId, stageId, { serviceStartDate: acceptedDate });
  }, [acceptedPending, acceptedDate, updateStage]);

  return {
    updateStage,
    acceptedPending,
    setAcceptedPending,
    acceptedDate,
    setAcceptedDate,
    confirmAccepted,
    onboardingTarget,
    setOnboardingTarget,
  };
}
