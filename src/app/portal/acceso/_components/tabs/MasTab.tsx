"use client";

import React, { useState, useEffect } from "react";
import {
  CalendarCheck,
  History,
  Shield,
  ClipboardList,
  UserRoundCheck,
  Smartphone,
  ChevronRight,
  ArrowLeft,
  Info,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import EsperadosHoySection from "./EsperadosHoySection";
import HistorialSection from "./HistorialSection";
import ListasControlSection from "./ListasControlSection";
import ResumenTurnoSection from "./ResumenTurnoSection";

// ── Types ───────────────────────────────────────────────────────────────────

type SubSection = "esperados" | "historial" | "listas" | "resumen" | null;

interface MasTabProps {
  installationId: string;
  guardId: string;
  guardName: string;
  installationName: string;
  deviceToken: string;
  pairedAt?: string;
  onChangeGuard: () => void;
}

// ── Menu Item Component ─────────────────────────────────────────────────────

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  description?: string;
  onClick: () => void;
  badge?: string | number | null;
  showChevron?: boolean;
  rightContent?: React.ReactNode;
}

function MenuItem({
  icon,
  label,
  description,
  onClick,
  badge,
  showChevron = true,
  rightContent,
}: MenuItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-[#374151] bg-[#111827] px-4 py-3.5 text-left transition-colors active:scale-[0.99] active:bg-[#1F2937]"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#1F2937] text-[#06B6D4]">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[#F9FAFB]">{label}</p>
        {description && (
          <p className="truncate text-xs text-[#9CA3AF]">{description}</p>
        )}
      </div>
      {badge !== undefined && badge !== null && (
        <Badge
          variant="outline"
          className="shrink-0 border-[#06B6D4]/30 bg-[#06B6D4]/10 text-[#06B6D4] text-xs"
        >
          {badge}
        </Badge>
      )}
      {rightContent}
      {showChevron && (
        <ChevronRight className="h-4 w-4 shrink-0 text-[#374151]" />
      )}
    </button>
  );
}

// ── Separator ───────────────────────────────────────────────────────────────

function MenuSeparator() {
  return <div className="my-2 border-t border-[#374151]/50" />;
}

// ── Component ───────────────────────────────────────────────────────────────

export default function MasTab({
  installationId,
  guardId,
  guardName,
  installationName,
  deviceToken,
  pairedAt,
  onChangeGuard,
}: MasTabProps) {
  const [activeSection, setActiveSection] = useState<SubSection>(null);
  const [esperadosCount, setEsperadosCount] = useState<number | null>(null);

  // Fetch expected today count
  useEffect(() => {
    async function fetchCount() {
      try {
        const res = await fetch(
          `/api/access-control/preregistrations/${installationId}/today`
        );
        const json = await res.json();
        if (json.success) {
          const pending = (json.data ?? []).filter(
            (p: { status: string }) => p.status === "pending"
          );
          setEsperadosCount(pending.length);
        }
      } catch {
        // Silently fail
      }
    }
    fetchCount();
  }, [installationId]);

  const pairedDate = pairedAt
    ? new Date(pairedAt).toLocaleDateString("es-CL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : null;

  // ── Sub-section rendering ─────────────────────────────────────────────

  if (activeSection === "esperados") {
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setActiveSection(null)}
          className="flex items-center gap-2 text-sm text-[#06B6D4] hover:text-[#22D3EE]"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </button>
        <EsperadosHoySection installationId={installationId} />
      </div>
    );
  }

  if (activeSection === "historial") {
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setActiveSection(null)}
          className="flex items-center gap-2 text-sm text-[#06B6D4] hover:text-[#22D3EE]"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </button>
        <HistorialSection installationId={installationId} />
      </div>
    );
  }

  if (activeSection === "listas") {
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setActiveSection(null)}
          className="flex items-center gap-2 text-sm text-[#06B6D4] hover:text-[#22D3EE]"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </button>
        <ListasControlSection installationId={installationId} />
      </div>
    );
  }

  if (activeSection === "resumen") {
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setActiveSection(null)}
          className="flex items-center gap-2 text-sm text-[#06B6D4] hover:text-[#22D3EE]"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </button>
        <ResumenTurnoSection
          installationId={installationId}
          guardId={guardId}
          guardName={guardName}
        />
      </div>
    );
  }

  // ── Main menu ─────────────────────────────────────────────────────────

  return (
    <div className="space-y-2">
      <h2 className="mb-4 text-lg font-semibold text-[#F9FAFB]">
        Mas opciones
      </h2>

      {/* Guard on duty */}
      <button
        type="button"
        onClick={onChangeGuard}
        className="flex w-full items-center gap-3 rounded-xl border border-[#06B6D4]/20 bg-[#06B6D4]/5 px-4 py-3.5 text-left transition-colors active:bg-[#06B6D4]/10"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#06B6D4]/10 text-[#06B6D4]">
          <UserRoundCheck className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-[#9CA3AF]">Guardia en Turno</p>
          <p className="text-sm font-medium text-[#F9FAFB]">{guardName}</p>
        </div>
        <span className="text-xs font-medium text-[#06B6D4]">Cambiar</span>
      </button>

      <MenuSeparator />

      {/* Primary menu items */}
      <MenuItem
        icon={<CalendarCheck className="h-5 w-5" />}
        label="Esperados Hoy"
        description="Visitas pre-registradas para hoy"
        onClick={() => setActiveSection("esperados")}
        badge={esperadosCount}
      />

      <MenuItem
        icon={<History className="h-5 w-5" />}
        label="Historial de Registros"
        description="Consultar registros anteriores"
        onClick={() => setActiveSection("historial")}
      />

      <MenuItem
        icon={<Shield className="h-5 w-5" />}
        label="Listas de Control"
        description="Lista negra y lista blanca"
        onClick={() => setActiveSection("listas")}
      />

      <MenuItem
        icon={<ClipboardList className="h-5 w-5" />}
        label="Resumen del Turno"
        description="Estadisticas de tu turno actual"
        onClick={() => setActiveSection("resumen")}
      />

      <MenuSeparator />

      {/* Device info */}
      <div className="rounded-xl border border-[#374151] bg-[#111827] px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#1F2937] text-[#9CA3AF]">
            <Smartphone className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-[#9CA3AF]">
              Este Dispositivo
            </p>
            <p className="text-sm text-[#F9FAFB]">{installationName}</p>
            {pairedDate && (
              <p className="text-xs text-[#6B7280]">
                Vinculado: {pairedDate}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <span className="relative flex h-2 w-2">
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </span>
            <span className="text-xs text-green-400">Activo</span>
          </div>
        </div>
      </div>

      <MenuSeparator />

      {/* Version */}
      <div className="flex items-center gap-2 px-2 py-1">
        <Info className="h-3.5 w-3.5 text-[#4B5563]" />
        <span className="text-xs text-[#4B5563]">
          Control de Acceso v1.0.0
        </span>
      </div>
    </div>
  );
}
