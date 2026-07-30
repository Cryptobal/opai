"use client";

import { useMemo, useState } from "react";
import { Send } from "lucide-react";
import { Skeleton } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { useRegisterChatPageContext } from "@/components/opai/ChatPageContextProvider";
import { BundleHeader } from "./BundleHeader";
import { BundleTabs, type BundleTabId } from "./BundleTabs";
import { BundleConsolidatedTab } from "./BundleConsolidatedTab";
import { BundleInstallationTab } from "./BundleInstallationTab";
import { BundleControlCenter } from "./BundleControlCenter";
import { AddInstallationModal } from "./AddInstallationModal";
import { SendBundleModal } from "./SendBundleModal";
import { useBundle } from "./useBundle";

export function BundleWorkspace({ bundleId }: { bundleId: string }) {
  const { bundle, loading, error, saving, refresh } = useBundle(bundleId);
  const [tab, setTab] = useState<BundleTabId>("consolidated");
  const [addOpen, setAddOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [ccCollapsed, setCcCollapsed] = useState(false);

  useRegisterChatPageContext(
    useMemo(
      () =>
        bundle
          ? {
              entityType: "cpq_bundle",
              entityId: bundle.id,
              entityName: bundle.name || bundle.code,
              entityUrl: `/crm/propuestas/${bundle.id}`,
              extra: `Propuesta multi-instalación ${bundle.code} · ${bundle.totals.includedCount} instalaciones · deal ${bundle.dealId}`,
            }
          : null,
      [bundle],
    ),
  );

  if (loading && !bundle) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !bundle) {
    return (
      <div className="p-6 text-[13px] text-status-danger-fg">
        {error || "Propuesta no encontrada"}
      </div>
    );
  }

  const activeQuoteId =
    tab.startsWith("inst:") ? tab.slice(5) : null;

  const totalLabel =
    bundle.currency === "UF"
      ? `${bundle.totals.totalMonthly.toLocaleString("es-CL", { maximumFractionDigits: 2 })} UF`
      : `$${Math.round(bundle.totals.totalMonthly).toLocaleString("es-CL")}`;

  return (
    <div className="min-w-0 pb-24 lg:pb-6">
      <div className="flex gap-4 min-w-0">
        <div className="min-w-0 flex-1 space-y-4">
          <BundleHeader bundle={bundle} saving={saving} />
          <BundleTabs
            members={bundle.quotes}
            active={tab}
            onChange={setTab}
            onAdd={() => setAddOpen(true)}
          />
          {tab === "consolidated" ? (
            <BundleConsolidatedTab
              bundle={bundle}
              onRefresh={refresh}
              onOpenInstall={(qid) => setTab(`inst:${qid}`)}
            />
          ) : activeQuoteId ? (
            <BundleInstallationTab
              quoteId={activeQuoteId}
              onBundleRefresh={refresh}
            />
          ) : null}
        </div>
        <BundleControlCenter
          bundle={bundle}
          collapsed={ccCollapsed}
          onToggle={() => setCcCollapsed((v) => !v)}
          onSend={() => setSendOpen(true)}
        />
      </div>

      {/* Mobile bottom bar */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t border-ds-border-subtle bg-ds-surface-1/95 px-4 py-3 lg:hidden"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <div>
          <p className="text-[12px] text-ds-text-3">Total incluido</p>
          <p className="font-mono text-[15px] text-primary">{totalLabel}</p>
        </div>
        <Button
          className="h-11 bg-status-ok hover:bg-status-ok/90"
          onClick={() => setSendOpen(true)}
          disabled={bundle.totals.includedCount === 0}
        >
          <Send className="mr-2 h-4 w-4" />
          Enviar
        </Button>
      </div>

      <AddInstallationModal
        open={addOpen}
        onOpenChange={setAddOpen}
        bundle={bundle}
        onAdded={refresh}
      />
      <SendBundleModal
        open={sendOpen}
        onOpenChange={setSendOpen}
        bundle={bundle}
        onSent={refresh}
      />
    </div>
  );
}
