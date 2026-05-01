"use client";

import React, { useState } from "react";
import { ShieldCheck, Eye, History, CalendarClock, Shield } from "lucide-react";
import { OpaiBadge } from "./OpaiBadge";
import { ClientAccessControlLive } from "@/components/access-control/ClientAccessControlLive";
import { ClientAccessControlHistory } from "@/components/access-control/ClientAccessControlHistory";
import { ClientPreregistration } from "@/components/access-control/ClientPreregistration";
import { ClientWhitelistManager } from "@/components/access-control/ClientWhitelistManager";

type ACTab = "live" | "history" | "preregister" | "whitelist";

interface Props {
  session: {
    tenantId: string;
    accountId: string;
    contactId?: string;
    installations: Array<{ id: string; name: string }>;
  };
  selectedInstallation: string;
  isProspect?: boolean;
}

const DEMO_ACCESS_LOG = [
  { time: "08:12", name: "Juan Pérez", type: "Ingreso", method: "Cédula", status: "Autorizado" },
  { time: "08:45", name: "Proveedor TI", type: "Ingreso", method: "Pre-registro", status: "Autorizado" },
  { time: "09:30", name: "María González", type: "Salida", method: "Cédula", status: "Autorizado" },
  { time: "10:15", name: "Courier MercadoLibre", type: "Ingreso", method: "QR temporal", status: "Autorizado" },
  { time: "11:00", name: "Persona no identificada", type: "Ingreso", method: "—", status: "Rechazado" },
];

export function PortalAccessControl({ session, selectedInstallation, isProspect }: Props) {
  const [activeTab, setActiveTab] = useState<ACTab>("live");

  if (!selectedInstallation && !isProspect) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-zinc-600 px-4 py-6">
        <ShieldCheck className="h-12 w-12" />
        <p className="text-sm">Selecciona una instalación para ver el control de acceso</p>
      </div>
    );
  }

  if (isProspect) {
    return (
      <div className="flex-1 max-w-6xl mx-auto w-full px-4 py-4 pb-24">
        <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2 mb-1">
          <ShieldCheck className="h-5 w-5 text-status-info-fg" />
          Control de Acceso
          <OpaiBadge variant="default" />
        </h2>
        <p className="text-xs text-zinc-500 mb-4">Control de acceso digital con lectura de cédula y patentes — Sin papel</p>
        <div className="rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: "linear-gradient(145deg, #1E293B, #1A2332)" }}>
          <div className="px-4 py-3 border-b border-white/[0.06]">
            <p className="text-xs text-zinc-400">Registro digital de ingresos — QR, OCR, tiempo real — Datos de demostración</p>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {DEMO_ACCESS_LOG.map((entry, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <span className="text-xs text-zinc-500 w-12 shrink-0">{entry.time}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-200 truncate">{entry.name}</p>
                  <p className="text-xs text-zinc-500">{entry.type} · {entry.method}</p>
                </div>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                  entry.status === "Autorizado"
                    ? "bg-status-ok-soft text-status-ok-fg"
                    : "bg-status-danger-soft text-status-danger-fg"
                }`}>
                  {entry.status}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {["Pre-registro de visitas online", "Lista blanca de autorizados permanentes", "Historial completo de accesos", "Alertas de accesos no autorizados"].map((feat) => (
            <div key={feat} className="flex items-center gap-2 text-xs text-zinc-400">
              <ShieldCheck className="h-3.5 w-3.5 text-status-info-fg shrink-0" />
              {feat}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const tabs = [
    { key: "live" as ACTab, label: "En Vivo", icon: Eye },
    { key: "history" as ACTab, label: "Historial", icon: History },
    { key: "preregister" as ACTab, label: "Pre-registro", icon: CalendarClock },
    { key: "whitelist" as ACTab, label: "Autorizados", icon: Shield },
  ];

  return (
    <div className="flex-1 max-w-6xl mx-auto w-full px-4 py-4 pb-24">
      <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2 mb-1">
        <ShieldCheck className="h-5 w-5 text-status-info-fg" />
        Control de Acceso
        <OpaiBadge variant="default" />
      </h2>
      <p className="text-xs text-zinc-500 mb-4">Registro digital de ingresos — QR, OCR, tiempo real</p>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto scrollbar-hide">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === key
                ? "bg-status-info-soft text-status-info-fg border border-status-info-border"
                : "text-zinc-400 border border-zinc-700 hover:border-zinc-600"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === "live" && (
        <ClientAccessControlLive installationId={selectedInstallation} />
      )}
      {activeTab === "history" && (
        <ClientAccessControlHistory installationId={selectedInstallation} />
      )}
      {activeTab === "preregister" && (
        <ClientPreregistration
          installationId={selectedInstallation}
          createdBy={session.contactId}
        />
      )}
      {activeTab === "whitelist" && (
        <ClientWhitelistManager
          installationId={selectedInstallation}
          createdBy={session.contactId}
        />
      )}
    </div>
  );
}
