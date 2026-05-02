"use client";

import React, { useState, useEffect } from "react";
import {
  ArrowUpRight,
  ArrowDownLeft,
  UserPlus,
  Truck,
  Car,
  BadgeCheck,
  Package,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AccessControlEntry, AccessControlExit } from "@/components/access-control";
import {
  RECORD_TYPE_CONFIG,
  type AccessRecordType,
  type AccessControlConfigData,
} from "@/lib/access-control/types";

// ── Icon map ────────────────────────────────────────────────────────────────

const TYPE_ICONS: Record<AccessRecordType, React.ReactNode> = {
  visit: <UserPlus className="h-3.5 w-3.5" />,
  provider: <Truck className="h-3.5 w-3.5" />,
  vehicle: <Car className="h-3.5 w-3.5" />,
  staff: <BadgeCheck className="h-3.5 w-3.5" />,
  delivery: <Package className="h-3.5 w-3.5" />,
};

const TYPE_BADGE_COLORS: Record<AccessRecordType, string> = {
  visit: "border-status-info-border bg-status-info-soft text-status-info-fg",
  provider: "border-status-warn-border bg-status-warn-soft text-status-warn-fg",
  vehicle: "border-tint-violet-fg/30 bg-tint-violet text-tint-violet-fg",
  staff: "border-status-ok-border bg-status-ok-soft text-status-ok-fg",
  delivery: "border-status-warn-border bg-status-warn-soft text-status-warn-fg",
};

// ── Props ───────────────────────────────────────────────────────────────────

interface RegistroTabProps {
  installationId: string;
  guardId: string;
  tenantId: string;
  config: AccessControlConfigData;
  onEntryRegistered?: () => void;
  quickEntry?: boolean;
  onQuickEntryConsumed?: () => void;
}

type ActiveFlow = "none" | "entry" | "exit";

// ── Component ───────────────────────────────────────────────────────────────

export default function RegistroTab({
  installationId,
  guardId,
  tenantId,
  config,
  onEntryRegistered,
  quickEntry,
  onQuickEntryConsumed,
}: RegistroTabProps) {
  const [activeFlow, setActiveFlow] = useState<ActiveFlow>("none");

  useEffect(() => {
    if (quickEntry && activeFlow === "none") {
      setActiveFlow("entry");
      onQuickEntryConsumed?.();
    }
  }, [quickEntry, activeFlow, onQuickEntryConsumed]);

  const enabledTypes = config.enabledRecordTypes ?? [];

  // ── Entry flow ────────────────────────────────────────────────────────

  if (activeFlow === "entry") {
    return (
      <AccessControlEntry
        installationId={installationId}
        guardId={guardId}
        tenantId={tenantId}
        config={config}
        onClose={() => {
          setActiveFlow("none");
          onEntryRegistered?.();
        }}
      />
    );
  }

  // ── Exit flow ─────────────────────────────────────────────────────────

  if (activeFlow === "exit") {
    return (
      <AccessControlExit
        installationId={installationId}
        guardId={guardId}
        onClose={() => {
          setActiveFlow("none");
          onEntryRegistered?.();
        }}
      />
    );
  }

  // ── Main view ─────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h2 className="text-lg font-semibold text-[#F9FAFB]">
          Registro de Acceso
        </h2>
        <p className="mt-1 text-sm text-[#9CA3AF]">
          Registra ingresos y salidas de personas y vehiculos.
        </p>
      </div>

      {/* ── Action Buttons ────────────────────────────────────────── */}
      <div className="grid gap-4">
        {/* Entry Button */}
        <button
          type="button"
          onClick={() => setActiveFlow("entry")}
          className="group relative flex items-center gap-4 rounded-2xl border-2 border-[#10B981]/40 bg-[#10B981]/10 p-5 text-left transition-all active:scale-[0.98] active:bg-[#10B981]/20"
        >
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#10B981]/20">
            <ArrowUpRight className="h-7 w-7 text-[#10B981]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold text-[#10B981] tracking-wide">
              REGISTRAR ENTRADA
            </p>
            <p className="text-sm text-[#9CA3AF]">
              Persona o vehiculo ingresa a la instalacion
            </p>
          </div>
        </button>

        {/* Exit Button */}
        <button
          type="button"
          onClick={() => setActiveFlow("exit")}
          className="group relative flex items-center gap-4 rounded-2xl border-2 border-[#374151] bg-[#111827] p-5 text-left transition-all active:scale-[0.98] active:bg-[#1F2937]"
        >
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#1F2937]">
            <ArrowDownLeft className="h-7 w-7 text-[#F59E0B]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold text-[#F9FAFB] tracking-wide">
              REGISTRAR SALIDA
            </p>
            <p className="text-sm text-[#9CA3AF]">
              Persona o vehiculo sale de la instalacion
            </p>
          </div>
        </button>
      </div>

      {/* ── Enabled Record Types ──────────────────────────────────── */}
      {enabledTypes.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-wider text-[#9CA3AF]">
            Tipos habilitados
          </p>
          <div className="flex flex-wrap gap-2">
            {enabledTypes.map((type) => {
              const tc = RECORD_TYPE_CONFIG[type];
              return (
                <Badge
                  key={type}
                  variant="outline"
                  className={`flex items-center gap-1.5 px-3 py-1.5 ${TYPE_BADGE_COLORS[type]}`}
                >
                  {TYPE_ICONS[type]}
                  <span>{tc.label}</span>
                </Badge>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
