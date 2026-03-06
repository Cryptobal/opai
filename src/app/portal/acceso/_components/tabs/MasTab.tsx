"use client";

import React, { useState, useEffect } from "react";
import {
  CalendarCheck,
  History,
  Shield,
  ClipboardList,
  Building2,
  User,
  LogOut,
  ChevronRight,
  ArrowLeft,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import EsperadosHoySection from "./EsperadosHoySection";
import HistorialSection from "./HistorialSection";
import ListasControlSection from "./ListasControlSection";
import ResumenTurnoSection from "./ResumenTurnoSection";

// ── Types ───────────────────────────────────────────────────────────────────

type SubSection =
  | "esperados"
  | "historial"
  | "listas"
  | "resumen"
  | null;

interface MasTabProps {
  installationId: string;
  guardId: string;
  guardName: string;
  installationName: string;
  onChangeInstallation: () => void;
  onLogout: () => void;
}

// ── Menu Item Component ─────────────────────────────────────────────────────

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  description?: string;
  onClick: () => void;
  badge?: string | number | null;
  variant?: "default" | "danger";
  showChevron?: boolean;
  rightContent?: React.ReactNode;
}

function MenuItem({
  icon,
  label,
  description,
  onClick,
  badge,
  variant = "default",
  showChevron = true,
  rightContent,
}: MenuItemProps) {
  const isDanger = variant === "danger";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors active:scale-[0.99] ${
        isDanger
          ? "border-[#EF4444]/20 bg-[#EF4444]/5 active:bg-[#EF4444]/10"
          : "border-[#374151] bg-[#111827] active:bg-[#1F2937]"
      }`}
    >
      {/* Icon */}
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
          isDanger ? "bg-[#EF4444]/10 text-[#EF4444]" : "bg-[#1F2937] text-[#06B6D4]"
        }`}
      >
        {icon}
      </div>

      {/* Label + description */}
      <div className="min-w-0 flex-1">
        <p
          className={`text-sm font-medium ${
            isDanger ? "text-[#EF4444]" : "text-[#F9FAFB]"
          }`}
        >
          {label}
        </p>
        {description && (
          <p className="text-xs text-[#9CA3AF] truncate">{description}</p>
        )}
      </div>

      {/* Badge */}
      {badge !== undefined && badge !== null && (
        <Badge
          variant="outline"
          className="shrink-0 border-[#06B6D4]/30 bg-[#06B6D4]/10 text-[#06B6D4] text-xs"
        >
          {badge}
        </Badge>
      )}

      {/* Right content */}
      {rightContent}

      {/* Chevron */}
      {showChevron && !isDanger && (
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
  onChangeInstallation,
  onLogout,
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

      {/* Settings items */}
      <MenuItem
        icon={<Building2 className="h-5 w-5" />}
        label="Cambiar Instalacion"
        description={installationName}
        onClick={onChangeInstallation}
      />

      <MenuItem
        icon={<User className="h-5 w-5" />}
        label="Mi Perfil"
        description={guardName}
        onClick={() => {
          // Profile could navigate elsewhere or show a modal
        }}
        showChevron={false}
      />

      <MenuSeparator />

      {/* Logout */}
      <MenuItem
        icon={<LogOut className="h-5 w-5" />}
        label="Cerrar Sesion"
        onClick={onLogout}
        variant="danger"
        showChevron={false}
      />
    </div>
  );
}
