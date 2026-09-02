"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DetailHeader, KPIStrip, Skeleton } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { StatusTag } from "../StatusTag";
import { PlatformError } from "../PlatformError";
import { impersonateTenant } from "../impersonate";
import { platformJson } from "../platform-fetch";
import { DeleteTenantModal } from "../DeleteTenantModal";
import { LifecycleMenu, OverflowMenu, type LifecycleItem } from "./LifecycleMenu";
import { ReasonDialog } from "./ReasonDialog";
import { TenantTabNav, isTenantTab, type TenantTabId } from "./TenantTabNav";
import { TenantResumenTab } from "./TenantResumenTab";
import { TenantPlanTab } from "./TenantPlanTab";
import { TenantModulesTab } from "./TenantModulesTab";
import { TenantUsoTab } from "./TenantUsoTab";
import { TenantHistorialTab } from "./TenantHistorialTab";
import { toast } from "sonner";

interface DetailPayload {
  tenant: {
    id: string;
    name: string;
    slug: string;
    companyRut: string | null;
    legalName: string | null;
    giro: string | null;
    direccion: string | null;
    billingEmail: string | null;
    telefono: string | null;
    createdAt: string;
    signupSource: string | null;
    signupUtm: unknown;
    dpaAcceptedAt: string | null;
    dpaAcceptedBy: string | null;
  };
  owner: { name: string; email: string } | null;
  plan: {
    plan: string;
    maxGuards: number;
    maxAdmins: number;
    customPricePerGuard: number | null;
    customBaseMinimum: number | null;
    statusChangedAt: string | null;
    statusReason: string | null;
    trialEndsAt: string | null;
    graceEndsAt: string | null;
  } | null;
  metrics: { activeGuards: number };
  admins: unknown[];
  access: {
    state: string;
    statusLabel: string;
    statusVariant: "ok" | "warn" | "danger" | "neutral" | "info" | "brand";
    daysLeft: number | null;
    missingPlan: boolean;
    allowedTransitions: LifecycleItem[];
  };
  monthly: { text: string; total: number | null; kind: string };
  lifecycleTimeline: { id: string; action: string; actorEmail: string | null; createdAt: string }[];
}

export function TenantDetailClient({ tenantId }: { tenantId: string }) {
  const sp = useSearchParams();
  const tab: TenantTabId = isTenantTab(sp.get("tab")) ? (sp.get("tab") as TenantTabId) : "resumen";
  const [data, setData] = useState<DetailPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<LifecycleItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await platformJson<DetailPayload>(`/api/platform/tenants/${tenantId}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const runLifecycle = async (item: LifecycleItem, reason?: string) => {
    setBusy(true);
    try {
      await platformJson(`/api/platform/tenants/${tenantId}/lifecycle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: item.action, reason }),
      });
      toast.success(item.label);
      setPending(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo aplicar");
    } finally {
      setBusy(false);
    }
  };

  if (loading && !data) return <Skeleton className="h-48 w-full" />;
  if (error || !data) return <PlatformError message={error ?? undefined} onRetry={() => void load()} />;

  const guardsLabel =
    data.plan?.maxGuards && data.plan.maxGuards > 0
      ? `${data.metrics.activeGuards} / ${data.plan.maxGuards}`
      : `${data.metrics.activeGuards} / sin tope`;

  return (
    <div className="space-y-6 min-w-0">
      <DetailHeader
        title={data.tenant.name}
        code={`${data.tenant.slug} · ${data.tenant.companyRut ?? "s/RUT"}`}
        backHref="/platform/tenants"
        status={<StatusTag label={data.access.statusLabel} variant={data.access.statusVariant} />}
        actions={
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" className="h-10 sm:h-9" onClick={() => impersonateTenant(tenantId)}>
              Entrar como tenant
            </Button>
            <LifecycleMenu
              items={data.access.allowedTransitions}
              onSelect={(item) => {
                if (item.requiresReason) setPending(item);
                else void runLifecycle(item);
              }}
            />
            <OverflowMenu onDelete={() => setDeleteOpen(true)} />
          </div>
        }
      />
      <KPIStrip
        items={[
          { label: "Guardias", value: guardsLabel },
          { label: "Admins", value: `${data.admins.length} / ${data.plan?.maxAdmins ?? "—"}` },
          { label: "Mensual", value: data.monthly.text },
          { label: "Uso 30 d", value: "Sin datos" },
        ]}
      />
      <TenantTabNav tenantId={tenantId} tab={tab} />
      {tab === "resumen" ? (
        <TenantResumenTab
          tenantId={tenantId}
          tenant={data.tenant}
          owner={data.owner}
          access={data.access}
          statusChangedAt={data.plan?.statusChangedAt ?? null}
          statusReason={data.plan?.statusReason ?? null}
          trialEndsAt={data.plan?.trialEndsAt ?? null}
          graceEndsAt={data.plan?.graceEndsAt ?? null}
          timeline={data.lifecycleTimeline}
        />
      ) : null}
      {tab === "plan" ? (
        <TenantPlanTab
          tenantId={tenantId}
          currentPlan={data.plan?.plan ?? null}
          customPricePerGuard={data.plan?.customPricePerGuard ?? null}
          customBaseMinimum={data.plan?.customBaseMinimum ?? null}
        />
      ) : null}
      {tab === "modulos" ? <TenantModulesTab tenantId={tenantId} /> : null}
      {tab === "uso" ? <TenantUsoTab /> : null}
      {tab === "historial" ? <TenantHistorialTab tenantId={tenantId} /> : null}

      <ReasonDialog
        open={pending != null}
        title={pending?.label ?? ""}
        onOpenChange={(o) => !o && setPending(null)}
        loading={busy}
        onConfirm={(reason) => {
          if (!pending) return;
          return runLifecycle(pending, reason);
        }}
      />
      <DeleteTenantModal
        open={deleteOpen}
        tenantId={tenantId}
        tenantSlug={data.tenant.slug}
        tenantName={data.tenant.name}
        onClose={() => setDeleteOpen(false)}
        onDeleted={() => {
          window.location.href = "/platform/tenants";
        }}
      />
    </div>
  );
}
