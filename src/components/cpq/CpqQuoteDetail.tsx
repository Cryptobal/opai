/**
 * Detalle de cotización CPQ
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader, KpiCard } from "@/components/opai";
import { CreatePositionModal } from "@/components/cpq/CreatePositionModal";
import { CpqPositionCard } from "@/components/cpq/CpqPositionCard";
import { CpqQuoteCosts } from "@/components/cpq/CpqQuoteCosts";
import { CpqPricingCalc } from "@/components/cpq/CpqPricingCalc";
import { formatCurrency } from "@/components/cpq/utils";
import type { CpqQuote, CpqPosition, CpqQuoteCostSummary, CpqQuoteParameters } from "@/types/cpq";
import { ArrowLeft, Copy, RefreshCw } from "lucide-react";

interface CpqQuoteDetailProps {
  quoteId: string;
}

export function CpqQuoteDetail({ quoteId }: CpqQuoteDetailProps) {
  const router = useRouter();
  const [quote, setQuote] = useState<CpqQuote | null>(null);
  const [positions, setPositions] = useState<CpqPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [costSummary, setCostSummary] = useState<CpqQuoteCostSummary | null>(null);
  const [costParams, setCostParams] = useState<CpqQuoteParameters | null>(null);
  const [marginPct, setMarginPct] = useState(20);
  const [cloning, setCloning] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [quoteForm, setQuoteForm] = useState({
    clientName: "",
    validUntil: "",
    notes: "",
    status: "draft" as CpqQuote["status"],
  });
  const [quoteDirty, setQuoteDirty] = useState(false);
  const [savingQuote, setSavingQuote] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const steps = ["Datos", "Puestos", "Costos", "Resumen"];
  const formatDateInput = (value?: string | null) => (value ? value.split("T")[0] : "");

  const refresh = async () => {
    setLoading(true);
    try {
      const [quoteRes, costsRes] = await Promise.all([
        fetch(`/api/cpq/quotes/${quoteId}`),
        fetch(`/api/cpq/quotes/${quoteId}/costs`),
      ]);
      const quoteData = await quoteRes.json();
      const costsData = await costsRes.json();
      if (quoteData.success) {
        setQuote(quoteData.data);
        setPositions(quoteData.data.positions || []);
      }
      if (costsData.success) {
        setCostSummary(costsData.data.summary);
        setCostParams(costsData.data.parameters || null);
        setMarginPct(costsData.data.parameters?.marginPct ?? 20);
      }
    } catch (err) {
      console.error("Error loading CPQ quote:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, [quoteId]);

  useEffect(() => {
    if (!quote) return;
    setQuoteForm({
      clientName: quote.clientName || "",
      validUntil: formatDateInput(quote.validUntil),
      notes: quote.notes || "",
      status: quote.status,
    });
    setQuoteDirty(false);
  }, [quote]);

  const saveQuoteBasics = async (options?: { goNext?: boolean }) => {
    setSavingQuote(true);
    setQuoteError(null);
    try {
      const res = await fetch(`/api/cpq/quotes/${quoteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: quoteForm.clientName,
          validUntil: quoteForm.validUntil || null,
          notes: quoteForm.notes,
          status: quoteForm.status,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Error");
      setQuote(data.data);
      setQuoteDirty(false);
      if (options?.goNext) setActiveStep(1);
    } catch (error) {
      console.error("Error saving CPQ quote:", error);
      setQuoteError("No se pudo guardar la cotización.");
    } finally {
      setSavingQuote(false);
    }
  };

  const handleClone = async () => {
    setCloning(true);
    try {
      const response = await fetch(`/api/cpq/quotes/${quoteId}/clone`, {
        method: "POST",
      });
      const data = await response.json();
      if (data.success) {
        router.push(`/cpq/${data.data.id}`);
      }
    } catch (error) {
      console.error("Error cloning quote:", error);
    } finally {
      setCloning(false);
    }
  };

  const stats = useMemo(() => {
    const totalGuards = quote?.totalGuards ?? positions.reduce((sum, p) => sum + p.numGuards, 0);
    const monthly = quote?.monthlyCost ?? positions.reduce((sum, p) => sum + Number(p.monthlyPositionCost), 0);
    return { totalGuards, monthly };
  }, [positions, quote]);

  const additionalCostsTotal = costSummary?.monthlyExtras ?? 0;
  const financialRatePct = costSummary
    ? (costSummary.monthlyFinancial / (costSummary.monthlyTotal || 1)) * 100
    : 0;
  const policyRatePct = costSummary
    ? (costSummary.monthlyPolicy / (costSummary.monthlyTotal || 1)) * 100
    : 0;
  const monthlyHours = costParams?.monthlyHoursStandard ?? 180;
  const monthlyTotal = costSummary?.monthlyTotal ?? stats.monthly + additionalCostsTotal;

  if (loading && !quote) {
    return <div className="text-sm text-muted-foreground">Cargando...</div>;
  }

  if (!quote) {
    return (
      <div className="space-y-3">
        <Button variant="outline" size="sm" onClick={() => router.push("/cpq")}>
          Volver
        </Button>
        <div className="text-sm text-muted-foreground">Cotización no encontrada.</div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href="/cpq">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <PageHeader
            title={quote.code}
            description={quote.clientName || "Sin cliente"}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-2" onClick={refresh}>
            <RefreshCw className="h-3 w-3" />
            <span className="hidden sm:inline">Actualizar</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={handleClone}
            disabled={cloning}
          >
            <Copy className="h-3 w-3" />
            <span className="hidden sm:inline">
              {cloning ? "Clonando..." : "Clonar"}
            </span>
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {steps.map((step, index) => {
          const active = index === activeStep;
          return (
            <Button
              key={step}
              size="sm"
              variant={active ? "default" : "outline"}
              className={active ? "bg-primary/90" : "bg-transparent"}
              onClick={() => setActiveStep(index)}
            >
              <span className="text-[10px]">{index + 1}</span>
              <span className="ml-1 text-xs">{step}</span>
            </Button>
          );
        })}
      </div>

      <div className="grid gap-3 grid-cols-3 md:grid-cols-3">
        <KpiCard
          title="Puestos"
          value={positions.length}
          variant="blue"
          size="lg"
        />
        <KpiCard
          title="Guardias"
          value={stats.totalGuards}
          variant="purple"
          size="lg"
        />
        <KpiCard
          title="Costo mensual"
          value={formatCurrency(stats.monthly)}
          variant="emerald"
          size="lg"
        />
      </div>

      {activeStep === 0 && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Datos básicos</h2>
              <p className="text-xs text-muted-foreground">
                Completa la información principal de la cotización.
              </p>
            </div>
            <Badge variant="outline" className="text-xs">
              {quote.status}
            </Badge>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Cliente</Label>
              <Input
                value={quoteForm.clientName}
                onChange={(e) => {
                  setQuoteForm((prev) => ({ ...prev, clientName: e.target.value }));
                  setQuoteDirty(true);
                }}
                placeholder="Nombre del cliente"
                className="h-11 sm:h-9 bg-background text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Válida hasta</Label>
              <Input
                type="date"
                value={quoteForm.validUntil}
                onChange={(e) => {
                  setQuoteForm((prev) => ({ ...prev, validUntil: e.target.value }));
                  setQuoteDirty(true);
                }}
                className="h-11 sm:h-9 bg-background text-sm"
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label className="text-xs">Notas</Label>
              <Input
                value={quoteForm.notes}
                onChange={(e) => {
                  setQuoteForm((prev) => ({ ...prev, notes: e.target.value }));
                  setQuoteDirty(true);
                }}
                placeholder="Observaciones internas"
                className="h-11 sm:h-9 bg-background text-sm"
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label className="text-xs">Estado</Label>
              <select
                className="flex h-11 sm:h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
                value={quoteForm.status}
                onChange={(e) => {
                  setQuoteForm((prev) => ({
                    ...prev,
                    status: e.target.value as CpqQuote["status"],
                  }));
                  setQuoteDirty(true);
                }}
              >
                <option value="draft">Borrador</option>
                <option value="sent">Enviada</option>
                <option value="approved">Aprobada</option>
                <option value="rejected">Rechazada</option>
              </select>
            </div>
          </div>

          {quoteError && (
            <div className="text-xs text-red-400">{quoteError}</div>
          )}

          <div className="flex flex-col sm:flex-row gap-2 justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={() => saveQuoteBasics()}
              disabled={!quoteDirty || savingQuote}
            >
              {savingQuote ? "Guardando..." : "Guardar"}
            </Button>
            <Button
              size="sm"
              onClick={() => saveQuoteBasics({ goNext: true })}
              disabled={savingQuote}
            >
              Guardar y seguir
            </Button>
          </div>
        </Card>
      )}

      {activeStep === 1 && (
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">Puestos de trabajo</h2>
              <Badge variant="outline" className="text-xs">
                {quote.status}
              </Badge>
            </div>
            <CreatePositionModal quoteId={quoteId} onCreated={refresh} />
          </div>

          {positions.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              Agrega el primer puesto para comenzar la estructura de servicio.
            </div>
          ) : (
            <div className="space-y-3">
              {positions.map((position) => (
                <CpqPositionCard
                  key={position.id}
                  position={position}
                  quoteId={quoteId}
                  onUpdated={refresh}
                  totalGuards={stats.totalGuards}
                  additionalCostsTotal={additionalCostsTotal}
                  marginPct={marginPct}
                  financialRatePct={financialRatePct}
                  policyRatePct={policyRatePct}
                  monthlyHours={monthlyHours}
                />
              ))}
            </div>
          )}
        </Card>
      )}

      {activeStep === 2 && (
        <CpqQuoteCosts quoteId={quoteId} />
      )}

      {activeStep === 3 && (
        <div className="space-y-3">
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">Resumen y precio</h2>
                <p className="text-xs text-muted-foreground">
                  Revisa los totales antes de enviar la cotización.
                </p>
              </div>
              <Badge variant="outline" className="text-xs">
                {quote.status}
              </Badge>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-md border border-border/50 p-2">
                <p className="text-[11px] text-muted-foreground uppercase">Puestos</p>
                <p className="text-sm font-semibold">{positions.length}</p>
              </div>
              <div className="rounded-md border border-border/50 p-2">
                <p className="text-[11px] text-muted-foreground uppercase">Guardias</p>
                <p className="text-sm font-semibold">{stats.totalGuards}</p>
              </div>
              <div className="rounded-md border border-border/50 p-2">
                <p className="text-[11px] text-muted-foreground uppercase">Adicionales</p>
                <p className="text-sm font-semibold">{formatCurrency(additionalCostsTotal)}</p>
              </div>
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2">
                <p className="text-[11px] text-emerald-300 uppercase">Total mensual</p>
                <p className="text-sm font-semibold text-emerald-300">{formatCurrency(monthlyTotal)}</p>
              </div>
            </div>
          </Card>

          <CpqPricingCalc
            summary={costSummary}
            marginPct={marginPct}
            onMarginChange={async (newMargin) => {
              setMarginPct(newMargin);
              try {
                await fetch(`/api/cpq/quotes/${quoteId}/margin`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ marginPct: newMargin }),
                });
                await refresh();
              } catch (error) {
                console.error("Error saving margin:", error);
              }
            }}
            uniformTotal={costSummary?.monthlyUniforms ?? 0}
            examTotal={costSummary?.monthlyExams ?? 0}
            mealTotal={costSummary?.monthlyMeals ?? 0}
            operationalTotal={costSummary ? (costSummary.monthlyCostItems || 0) : 0}
            transportTotal={0}
            vehicleTotal={0}
            infraTotal={0}
            systemTotal={0}
          />
        </div>
      )}

      <div className="sticky bottom-0 z-20 -mx-4 border-t border-border/60 bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setActiveStep((prev) => Math.max(0, prev - 1))}
            disabled={activeStep === 0}
          >
            Atrás
          </Button>
          <span className="text-xs text-muted-foreground">
            Paso {activeStep + 1} de {steps.length}
          </span>
          <Button
            size="sm"
            onClick={() =>
              setActiveStep((prev) => Math.min(steps.length - 1, prev + 1))
            }
            disabled={activeStep === steps.length - 1}
          >
            {activeStep === steps.length - 1 ? "Listo" : "Siguiente"}
          </Button>
        </div>
      </div>
    </div>
  );
}
