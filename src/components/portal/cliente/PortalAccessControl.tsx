"use client";

import React, { useState } from "react";
import { ShieldCheck, Eye, History, CalendarClock, Shield } from "lucide-react";
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
}

export function PortalAccessControl({ session, selectedInstallation }: Props) {
  const [activeTab, setActiveTab] = useState<ACTab>("live");

  if (!selectedInstallation) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-zinc-600 px-4 py-6">
        <ShieldCheck className="h-12 w-12" />
        <p className="text-sm">Selecciona una instalación para ver el control de acceso</p>
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
      <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2 mb-4">
        <ShieldCheck className="h-5 w-5 text-blue-400" />
        Control de Acceso
      </h2>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === key
                ? "bg-blue-500/10 text-blue-400 border border-blue-500/30"
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
