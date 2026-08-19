"use client";

/**
 * Workspace unificado de cotización: la cotización ES la propuesta.
 *
 * - Modo única (sin bundle, o bundle con 1 instalación): la cotización actual
 *   con todas sus secciones y el botón «Convertir en multi-instalación».
 * - Modo multi (bundle con >1 instalación): pestañas [Consolidado | una por
 *   instalación | ＋]. Cada tab de instalación monta el set COMPLETO de
 *   secciones de esa cotización; las condiciones comerciales y la tasa
 *   financiera se editan una sola vez en el Consolidado y el servidor las
 *   propaga a todas las hijas.
 *
 * La conversión es in-place: la URL /crm/cotizaciones/[id] no cambia.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { CpqQuoteDetail } from "@/components/cpq/CpqQuoteDetail";
import { useBundle } from "@/components/cpq/bundle/useBundle";
import { BundleTabs, type BundleTabId } from "@/components/cpq/bundle/BundleTabs";
import { AddInstallationModal } from "@/components/cpq/bundle/AddInstallationModal";
import { SendBundleModal } from "@/components/cpq/bundle/SendBundleModal";
import { useUfValue } from "./useUfValue";
import { MobileTotalBar } from "./MobileTotalBar";
import { ConsolidadoPanel } from "./consolidado/ConsolidadoPanel";
import { BundleStickyBar } from "./consolidado/BundleStickyBar";
import { BundleMobileActionBar } from "./consolidado/BundleMobileActionBar";
import { computeBundleBilling } from "./consolidado/bundle-billing";
import { useQuoteDeleteFlow } from "@/components/cpq/useQuoteDeleteFlow";
import { referenceQuoteIdFromMembers } from "@/lib/cpq/bundles/reference-quote";

type ActivityEvent = {
  id: string;
  action: string;
  details?: Record<string, unknown> | null;
  createdAt: string;
  createdBy?: string | null;
  createdByName?: string | null;
};

export function QuoteWorkspace({
  quoteId,
  currentUserId,
  activityEvents = [],
  defaultPortalEmailSubject,
  tenantBrandName,
  initialBundleId,
}: {
  quoteId: string;
  currentUserId?: string;
  activityEvents?: ActivityEvent[];
  defaultPortalEmailSubject?: string;
  tenantBrandName?: string;
  /** Bundle al que ya pertenece la cotización (resuelto en servidor). */
  initialBundleId: string | null;
}) {
  const router = useRouter();
  const [bundleId, setBundleId] = useState<string | null>(initialBundleId);
  const { bundle, loading, error, saving, refresh, patch } = useBundle(bundleId);
  /** Cambia con cada recarga del bundle para refrescar la auditoría (agregar,
   *  quitar e incluir/excluir no tocan la fila del bundle, así que `updatedAt`
   *  no basta como señal). */
  const [bundleRevision, setBundleRevision] = useState(0);
  // La URL manda: abrir /crm/cotizaciones/[id] de una hija entra directo a su
  // instalación. Solo al convertir se fuerza el Consolidado.
  const [tab, setTab] = useState<BundleTabId>(
    initialBundleId ? `inst:${quoteId}` : "consolidated",
  );
  const [addOpen, setAddOpen] = useState(false);
  const [cloneFromQuoteId, setCloneFromQuoteId] = useState<string | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const ufValue = useUfValue();
  const {
    requestDeleteQuote,
    requestUnlinkQuote,
    requestDeleteBundle,
  } = useQuoteDeleteFlow();

  /** El servidor manda: el modo lo decide la relación real, no un flag del cliente. */
  const isMulti = Boolean(bundle && bundle.quotes.length > 1);
  const billing = useMemo(
    () => (bundle ? computeBundleBilling(bundle) : null),
    [bundle],
  );

  // El tab puede quedar huérfano si la instalación se desvincula (aquí o en otra
  // pestaña) o si la URL apunta a una quote que aún no está en el bundle: el
  // servidor manda, así que caemos al Consolidado.
  const requestedQuoteId = tab.startsWith("inst:") ? tab.slice(5) : null;
  const activeQuoteId =
    requestedQuoteId && bundle?.quotes.some((m) => m.quoteId === requestedQuoteId)
      ? requestedQuoteId
      : null;
  useEffect(() => {
    if (requestedQuoteId && bundle && !activeQuoteId) setTab("consolidated");
  }, [requestedQuoteId, bundle, activeQuoteId]);
  const openInstall = useCallback((qid: string) => setTab(`inst:${qid}`), []);
  const openAdd = useCallback((cloneFrom?: string | null) => {
    setCloneFromQuoteId(cloneFrom ?? null);
    setAddOpen(true);
  }, []);

  const handleConverted = useCallback(
    (newBundleId: string, existing: boolean) => {
      setBundleId(newBundleId);
      setTab("consolidated");
      // Recién convertida queda con 1 instalación: abrimos Agregar para que la
      // propuesta nazca multi de inmediato (§5 del brief).
      if (!existing) setAddOpen(true);
    },
    [],
  );

  const refreshBundle = useCallback(async () => {
    await refresh();
    setBundleRevision((n) => n + 1);
  }, [refresh]);

  const handleAdded = useCallback(
    async (newQuoteId?: string) => {
      await refreshBundle();
      if (newQuoteId) openInstall(newQuoteId);
    },
    [refreshBundle, openInstall],
  );

  const redirectAfterBundleDeleted = useCallback(() => {
    setBundleId(null);
    router.push("/crm/cotizaciones");
    router.refresh();
  }, [router]);

  const getMemberLabel = useCallback(
    (qid: string) => {
      const member = bundle?.quotes.find((m) => m.quoteId === qid);
      return member?.quote.installation?.name || member?.quote.name || member?.quote.code || "esta cotización";
    },
    [bundle],
  );

  const handleRequestUnlink = useCallback(
    async (qid: string) => {
      if (!bundle) return;
      const result = await requestUnlinkQuote({
        bundleId: bundle.id,
        quoteId: qid,
        quoteLabel: getMemberLabel(qid),
      });
      if (!result) return;
      if (result.bundleDeleted) {
        redirectAfterBundleDeleted();
        return;
      }
      if (activeQuoteId === qid) setTab("consolidated");
      await refreshBundle();
      router.refresh();
    },
    [
      activeQuoteId,
      bundle,
      getMemberLabel,
      redirectAfterBundleDeleted,
      refreshBundle,
      requestUnlinkQuote,
      router,
    ],
  );

  const handleRequestDeleteQuote = useCallback(
    async (qid: string) => {
      const result = await requestDeleteQuote({
        quoteId: qid,
        quoteLabel: getMemberLabel(qid),
      });
      if (!result) return;
      if (result.bundleDeleted) {
        redirectAfterBundleDeleted();
        return;
      }
      if (activeQuoteId === qid) setTab("consolidated");
      await refreshBundle();
      router.refresh();
    },
    [
      activeQuoteId,
      getMemberLabel,
      redirectAfterBundleDeleted,
      refreshBundle,
      requestDeleteQuote,
      router,
    ],
  );

  const handleRequestDeleteBundle = useCallback(
    async (mode: "unlink" | "cascade") => {
      if (!bundle) return;
      const result = await requestDeleteBundle({
        bundleId: bundle.id,
        bundleLabel: bundle.name || bundle.code,
        memberCount: bundle.quotes.length,
        mode,
      });
      if (!result) return;
      redirectAfterBundleDeleted();
    },
    [bundle, redirectAfterBundleDeleted, requestDeleteBundle],
  );

  // Si se quita del bundle la cotización de la URL, la ruta deja de
  // corresponder a la propuesta: seguimos a la primera instalación restante.
  useEffect(() => {
    if (!bundle || bundle.quotes.length === 0) return;
    if (bundle.quotes.some((m) => m.quoteId === quoteId)) return;
    router.replace(`/crm/cotizaciones/${bundle.quotes[0]!.quoteId}`);
  }, [bundle, quoteId, router]);

  // Con bundle conocido en servidor y GET en vuelo, esperar: si no, la
  // propuesta multi parpadea como cotización única en cada carga.
  if (initialBundleId && !bundle && loading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Un fallo transitorio del GET no debe colapsar una propuesta a modo única.
  if (initialBundleId && !bundle && error) {
    return (
      <div className="space-y-3 p-4">
        <p className="text-[13px] text-status-danger-fg">{error}</p>
        <Button variant="outline" className="h-10" onClick={() => void refresh()}>
          Reintentar
        </Button>
      </div>
    );
  }

  // Modo única: sin bundle o con una sola instalación. La cotización que se
  // edita es siempre la de la URL.
  if (!isMulti) {
    return (
      <>
        <CpqQuoteDetail
          quoteId={quoteId}
          currentUserId={currentUserId}
          activityEvents={activityEvents}
          defaultPortalEmailSubject={defaultPortalEmailSubject}
          tenantBrandName={tenantBrandName}
          bundleId={bundleId}
          onConverted={handleConverted}
          onAddInstallation={bundle ? () => openAdd(quoteId) : undefined}
        />
        {bundle && (
          <AddInstallationModal
            open={addOpen}
            onOpenChange={setAddOpen}
            bundle={bundle}
            onAdded={handleAdded}
            defaultCloneFromQuoteId={cloneFromQuoteId}
          />
        )}
      </>
    );
  }

  if (loading && !bundle) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!bundle || !billing) return null;

  const effectiveTab: BundleTabId = activeQuoteId
    ? `inst:${activeQuoteId}`
    : "consolidated";
  const tabs = (
    <BundleTabs
      members={bundle.quotes}
      active={effectiveTab}
      onChange={setTab}
      onAdd={() => openAdd(null)}
      onRequestUnlink={(member) => void handleRequestUnlink(member.quoteId)}
      onRequestDelete={(member) => void handleRequestDeleteQuote(member.quoteId)}
    />
  );

  return (
    <div className="cpq-touch-inputs min-w-0 space-y-3 pb-4 overflow-x-clip">
      <BundleStickyBar
        bundle={bundle}
        billing={billing}
        ufValue={ufValue}
        saving={saving}
        onSend={() => setSendOpen(true)}
        onRequestDeleteBundle={(mode) => void handleRequestDeleteBundle(mode)}
      />

      {/* Pestañas sticky bajo la barra KPI (desktop). En móvil viajan dentro
          del stack sticky (total → pestañas → chips). */}
      <div className="hidden lg:block sticky top-[calc(var(--app-topbar-offset)+3.75rem)] z-20 bg-background/95 backdrop-blur-md py-1">
        {tabs}
      </div>

      {!activeQuoteId ? (
        <>
          {/* Stack sticky móvil del consolidado: total + pestañas. */}
          <div
            className="sticky top-[var(--app-island-bottom)] z-[25] -mx-4 sm:-mx-6 lg:hidden opai-liquid-glass-bar-top"
            style={{ ["--cpq-sticky-h" as string]: "7.75rem" }}
          >
            <MobileTotalBar
              totalClp={billing.monthlyClp}
              currency={bundle.currency}
              ufValue={ufValue}
              saving={saving}
            />
            <div className="px-2 pb-1.5">{tabs}</div>
          </div>
          <ConsolidadoPanel
            bundle={bundle}
            ufValue={ufValue}
            saving={saving}
            onPatch={patch}
            onRefresh={refreshBundle}
            onOpenInstall={openInstall}
            onAdd={() => openAdd(null)}
            onDuplicate={(qid) => openAdd(qid)}
            onRequestUnlink={(member) => void handleRequestUnlink(member.quoteId)}
            onRequestDelete={(member) => void handleRequestDeleteQuote(member.quoteId)}
            auditRefreshKey={bundleRevision}
          />
        </>
      ) : (
        <CpqQuoteDetail
          key={activeQuoteId}
          quoteId={activeQuoteId}
          currentUserId={currentUserId}
          defaultPortalEmailSubject={defaultPortalEmailSubject}
          tenantBrandName={tenantBrandName}
          bundleId={bundle.id}
          embedded
          proposalQuoteId={referenceQuoteIdFromMembers(bundle.quotes)}
          conditionsGovernedByProposal
          onEditConditionsAtProposal={() => setTab("consolidated")}
          mobileTabsSlot={<div className="px-2 pb-1.5">{tabs}</div>}
          mobileTotalClpOverride={billing.monthlyClp}
          onQuoteSaved={() => void refreshBundle()}
          onRequestUnlink={handleRequestUnlink}
          onRequestDelete={handleRequestDeleteQuote}
        />
      )}

      {/* Barra inferior móvil: PDF + WhatsApp + instalación + enviar. */}
      <BundleMobileActionBar
        bundle={bundle}
        onAddInstallation={() => openAdd(null)}
        onSend={() => setSendOpen(true)}
      />

      <AddInstallationModal
        open={addOpen}
        onOpenChange={setAddOpen}
        bundle={bundle}
        onAdded={handleAdded}
        defaultCloneFromQuoteId={cloneFromQuoteId}
      />
      <SendBundleModal
        open={sendOpen}
        onOpenChange={setSendOpen}
        bundle={bundle}
        tenantBrandName={tenantBrandName}
        onSent={refreshBundle}
      />
    </div>
  );
}
