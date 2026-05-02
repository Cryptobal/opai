// @ds-allow-legacy
// ListValidationResult muestra resultados full-screen de validación de
// acceso. Los rojos/verdes intensos son intencionales — es alarma visual
// operativa de máxima legibilidad para el guardia en terreno.
"use client";

import React from "react";
import { ShieldAlert, ShieldCheck, AlertTriangle, Clock, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RutValidationResult } from "@/lib/access-control/types";
import { formatRut } from "@/lib/access-control/utils";

interface Props {
  result: RutValidationResult;
  rut: string;
  fullName?: string;
  onContinue: () => void;
  onBack: () => void;
}

export function ListValidationResult({ result, rut, fullName, onContinue, onBack }: Props) {
  // ── BLACKLIST: Full red screen ──
  if (result.listMatch === "blacklist") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-red-700 p-6">
        <div className="text-center space-y-4">
          <ShieldAlert className="mx-auto h-20 w-20 text-white" />
          <h2 className="text-3xl font-bold text-white">ACCESO DENEGADO</h2>
          <div className="rounded-lg bg-red-800/50 p-4 space-y-2">
            <p className="text-xl font-semibold text-red-100">
              {result.personData?.fullName || "Persona no identificada"}
            </p>
            <p className="text-lg text-red-200">{formatRut(rut)}</p>
            {result.personData?.blockReason && (
              <p className="text-red-200 text-sm mt-2">
                Motivo: {result.personData.blockReason}
              </p>
            )}
            {result.personData?.scope === "global" && (
              <p className="text-status-danger-fg text-xs">Bloqueo global — aplica en todas las instalaciones</p>
            )}
          </div>
          <Button
            onClick={() => {
              navigator.vibrate?.([100, 50, 100]);
              onBack();
            }}
            className="mt-6 bg-white text-status-danger-fg hover:bg-red-100 text-lg px-8 py-3 h-auto"
          >
            Entendido
          </Button>
        </div>
      </div>
    );
  }

  // ── WHITELIST: Green banner ──
  if (result.listMatch === "whitelist") {
    const outOfSchedule = result.personData?.isWithinSchedule === false;
    const outOfValidity = result.personData?.isWithinValidity === false;
    const hasWarning = outOfSchedule || outOfValidity;

    return (
      <div className="space-y-4">
        <div className="rounded-xl border-2 border-status-ok-border bg-status-ok-soft p-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-8 w-8 text-status-ok-fg flex-shrink-0" />
            <div>
              <p className="font-semibold text-status-ok-fg">Persona Autorizada</p>
              <p className="text-sm text-emerald-200/80">
                {result.personData?.fullName || "Datos auto-completados"}
              </p>
              {result.personData?.company && (
                <p className="text-xs text-emerald-200/60">{result.personData.company}</p>
              )}
            </div>
          </div>
        </div>

        {hasWarning && (
          <div className="rounded-xl border border-status-warn-border bg-status-warn-soft p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-status-warn-fg flex-shrink-0 mt-0.5" />
              <div>
                {outOfSchedule && (
                  <p className="text-sm text-status-warn-fg">
                    Fuera del horario autorizado
                    {result.personData?.allowedTimeFrom && result.personData?.allowedTimeTo && (
                      <span className="text-amber-200/60 ml-1">
                        ({result.personData.allowedTimeFrom} - {result.personData.allowedTimeTo})
                      </span>
                    )}
                  </p>
                )}
                {outOfValidity && (
                  <p className="text-sm text-status-warn-fg">Vigencia vencida o no iniciada</p>
                )}
              </div>
            </div>
          </div>
        )}

        <Button onClick={onContinue} className="w-full h-12 bg-status-ok hover:bg-status-ok">
          Continuar <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    );
  }

  // ── NOT IN ANY LIST ──
  const displayName =
    fullName ||
    result.frequentData?.fullName ||
    result.preregistration?.visitorName;
  const displayCompany =
    result.frequentData?.company ||
    result.personData?.company;

  return (
    <div className="space-y-4">
      {/* Person data card */}
      <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4 space-y-1.5">
        {displayName && (
          <p className="text-lg font-semibold text-zinc-100">{displayName}</p>
        )}
        <p className="text-sm font-mono text-zinc-400">{formatRut(rut)}</p>
        {displayCompany && (
          <p className="text-xs text-zinc-500">{displayCompany}</p>
        )}
      </div>

      {result.isFrequent && result.frequentData && (
        <div className="rounded-xl border border-status-info-border bg-status-info-soft p-4">
          <div className="flex items-center gap-3">
            <Clock className="h-5 w-5 text-status-info-fg" />
            <div>
              <p className="text-sm text-status-info-fg">
                Visitante frecuente — {result.frequentData.visitCount} visita(s)
              </p>
              {result.frequentData.lastVisitAt && (
                <p className="text-xs text-blue-200/60">
                  Última visita:{" "}
                  {new Date(result.frequentData.lastVisitAt).toLocaleDateString("es-CL")}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {result.preregistration && (
        <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-purple-400" />
            <div>
              <p className="text-sm text-purple-300">
                Visita pre-registrada
              </p>
              {result.preregistration.hostName && (
                <p className="text-xs text-purple-200/60">
                  Visita a: {result.preregistration.hostName}
                </p>
              )}
              {result.preregistration.purpose && (
                <p className="text-xs text-purple-200/60">
                  Motivo: {result.preregistration.purpose}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <Button onClick={onContinue} className="w-full h-12">
        Continuar <ChevronRight className="ml-1 h-4 w-4" />
      </Button>
    </div>
  );
}
