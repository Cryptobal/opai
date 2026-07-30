"use client";

import { useCallback, useEffect, useState } from "react";

export type BundleMember = {
  id: string;
  quoteId: string;
  includedInProposal: boolean;
  displayOrder: number;
  quote: {
    id: string;
    code: string;
    name: string | null;
    status: string;
    currency: string;
    monthlyCost: number | string;
    totalGuards: number;
    totalPositions: number;
    paymentTerms: string;
    serviceStartDays: number;
    contractDuration: number;
    isOngoingService: boolean;
    adjustmentType: string;
    adjustmentFreq: string | null;
    ipcWeight: number | null;
    imoWeight: number | null;
    realAnnualIncrement: number;
    paymentDays: number;
    paymentDayMode: string;
    insurancePolicyUF: number | string | null;
    liabilityMonths: number;
    validUntil: string | null;
    installation: {
      id: string;
      name: string;
      city: string | null;
      address: string | null;
    } | null;
    parameters: {
      marginPct: number | string;
      marginMode: string;
      salePriceMonthly: number | string;
      financialEnabled?: boolean;
      financialRatePct?: number | string;
    } | null;
    additionalLines?: Array<{
      id: string;
      nombre: string;
      precio: number | string;
      tipo: string;
      recurrencia: string;
      cantidad: number;
      marginPct: number | string | null;
    }>;
  };
};

export type BundleDetail = {
  id: string;
  code: string;
  name: string | null;
  status: string;
  currency: string;
  dealId: string;
  accountId: string | null;
  contactId: string | null;
  validUntil: string | null;
  visibleInClientPortal: boolean | null;
  notes: string | null;
  sentAt: string | null;
  updatedAt: string;
  /** Condiciones comerciales a nivel propuesta (null = aún no gobernadas). */
  paymentTerms: string | null;
  serviceStartDays: number | null;
  contractDuration: number | null;
  isOngoingService: boolean | null;
  adjustmentType: string | null;
  adjustmentFreq: string | null;
  ipcWeight: number | null;
  imoWeight: number | null;
  insurancePolicyUF: number | string | null;
  liabilityMonths: number | null;
  realAnnualIncrement: number | null;
  paymentDays: number | null;
  paymentDayMode: string | null;
  financialEnabled: boolean | null;
  financialRatePct: number | string | null;
  quotes: BundleMember[];
  totals: {
    totalMonthly: number;
    totalGuards: number;
    totalPositions: number;
    weightedMarginPct: number | null;
    includedCount: number;
    installationCount: number;
    currency: string;
  };
  conditionsSynced: boolean;
  deal: { id: string; title: string } | null;
  account: { id: string; name: string } | null;
  contact: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
  } | null;
};

export function useBundle(bundleId: string | null) {
  const [bundle, setBundle] = useState<BundleDetail | null>(null);
  const [loading, setLoading] = useState(Boolean(bundleId));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!bundleId) {
      setBundle(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/cpq/bundles/${bundleId}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || "Error al cargar propuesta");
        setBundle(null);
        return;
      }
      setBundle(json.data as BundleDetail);
    } catch {
      setError("Error de red al cargar propuesta");
    } finally {
      setLoading(false);
    }
  }, [bundleId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const patch = useCallback(
    async (data: Record<string, unknown>) => {
      if (!bundleId) return;
      setSaving(true);
      try {
        const res = await fetch(`/api/cpq/bundles/${bundleId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || "Error al guardar");
        }
        await refresh();
      } finally {
        setSaving(false);
      }
    },
    [bundleId, refresh],
  );

  return { bundle, loading, error, saving, refresh, patch };
}
