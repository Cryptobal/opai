"use client";

import { useState } from "react";
import { FileText, FileCheck2, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { PortalContractsSection } from "@/components/portales/PortalContractsSection";
import { PortalProtocolos } from "./PortalProtocolos";
import { ClienteSession } from "@/lib/portal-cliente-types";

interface Props {
  session: ClienteSession;
  isProspect?: boolean;
}

type Tab = "contratos" | "protocolos";

const TABS: Array<{ id: Tab; label: string; icon: typeof FileText }> = [
  { id: "contratos", label: "Contratos", icon: FileCheck2 },
  { id: "protocolos", label: "Protocolos", icon: BookOpen },
];

export function PortalDocumentos({ session, isProspect }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("contratos");

  return (
    <div className="flex-1 max-w-6xl mx-auto w-full px-4 py-4 pb-24">
      {/* Tab bar */}
      <div className="flex gap-1 mb-4 bg-zinc-800/50 p-1 rounded-lg">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors flex-1 justify-center",
                activeTab === tab.id
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-400 hover:text-zinc-300"
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === "contratos" && (
        <PortalContractsSection
          tenantId={session.tenantId}
          accountId={session.accountId}
        />
      )}
      {activeTab === "protocolos" && (
        <PortalProtocolos
          session={session}
          selectedInstallation={session.installations[0]?.id ?? ""}
          isProspect={isProspect}
        />
      )}
    </div>
  );
}
