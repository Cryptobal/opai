"use client";

import React, { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  UserPlus, LogOut, Users, Clock, Search,
  Loader2, QrCode, Car, Truck, BadgeCheck, Package,
  ChevronRight, CalendarClock, Wifi, WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AccessControlEntry } from "./AccessControlEntry";
import { AccessControlExit } from "./AccessControlExit";
import { InSiteList } from "./InSiteList";
import { ExpectedToday } from "./ExpectedToday";
import { OfflineSyncIndicator } from "./OfflineSyncIndicator";
import type { AccessRecordType, AccessControlConfigData } from "@/lib/access-control/types";
import { RECORD_TYPE_CONFIG } from "@/lib/access-control/types";
import { formatDuration, elapsedMinutes } from "@/lib/access-control/utils";

// ═══════════════════════════════════════════════════════════════

type GuardACTab = "registro" | "en-sitio" | "esperados";

interface Props {
  installationId: string;
  installationName: string;
  guardId: string;
  tenantId: string;
}

export function AccessControlGuardHome({
  installationId,
  installationName,
  guardId,
  tenantId,
}: Props) {
  const [activeTab, setActiveTab] = useState<GuardACTab>("registro");
  const [config, setConfig] = useState<AccessControlConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEntry, setShowEntry] = useState(false);
  const [showExit, setShowExit] = useState(false);
  const [inSiteCount, setInSiteCount] = useState({ persons: 0, vehicles: 0 });

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch(`/api/access-control/config/${installationId}`);
      const json = await res.json();
      if (json.success) setConfig(json.data);
    } catch {
      // Offline: try cached config
      const cached = localStorage.getItem(`ac_config_${installationId}`);
      if (cached) setConfig(JSON.parse(cached));
    } finally {
      setLoading(false);
    }
  }, [installationId]);

  const fetchInSiteCount = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/access-control/records/${installationId}/in-site`
      );
      const json = await res.json();
      if (json.success) {
        setInSiteCount({
          persons: json.data.personCount,
          vehicles: json.data.vehicleCount,
        });
      }
    } catch {
      // Offline - count from local
    }
  }, [installationId]);

  useEffect(() => {
    fetchConfig();
    fetchInSiteCount();
  }, [fetchConfig, fetchInSiteCount]);

  // Cache config for offline
  useEffect(() => {
    if (config) {
      localStorage.setItem(`ac_config_${installationId}`, JSON.stringify(config));
    }
  }, [config, installationId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (showEntry && config) {
    return (
      <AccessControlEntry
        installationId={installationId}
        guardId={guardId}
        tenantId={tenantId}
        config={config}
        onClose={() => { setShowEntry(false); fetchInSiteCount(); }}
      />
    );
  }

  if (showExit) {
    return (
      <AccessControlExit
        installationId={installationId}
        guardId={guardId}
        onClose={() => { setShowExit(false); fetchInSiteCount(); }}
      />
    );
  }

  const now = new Date();
  const dateStr = now.toLocaleDateString("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const timeStr = now.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex flex-col min-h-full bg-zinc-950">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-zinc-800">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-zinc-100">{installationName}</h2>
            <p className="text-xs text-zinc-500 capitalize">{dateStr} — {timeStr}</p>
          </div>
          <OfflineSyncIndicator installationId={installationId} />
        </div>
        <div className="mt-2 flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-sm">
            <Users className="h-4 w-4 text-blue-400" />
            <span className="font-semibold text-zinc-200">{inSiteCount.persons}</span>
            <span className="text-zinc-500">personas</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <Car className="h-4 w-4 text-purple-400" />
            <span className="font-semibold text-zinc-200">{inSiteCount.vehicles}</span>
            <span className="text-zinc-500">vehículos</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-800">
        {[
          { key: "registro" as GuardACTab, label: "Registro", icon: QrCode },
          { key: "en-sitio" as GuardACTab, label: "En Sitio", icon: Users },
          { key: "esperados" as GuardACTab, label: "Esperados", icon: CalendarClock },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium transition-colors ${
              activeTab === key
                ? "border-b-2 border-blue-500 text-blue-400"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 p-4">
        {activeTab === "registro" && (
          <div className="space-y-4">
            {/* Entry Button */}
            <Button
              onClick={() => setShowEntry(true)}
              className="w-full h-14 text-base bg-emerald-600 hover:bg-emerald-500 text-white"
              size="lg"
            >
              <UserPlus className="mr-2 h-5 w-5" />
              Registrar Entrada
            </Button>

            {/* Exit Button */}
            <Button
              onClick={() => setShowExit(true)}
              variant="outline"
              className="w-full h-12 border-zinc-600 text-zinc-300"
            >
              <LogOut className="mr-2 h-5 w-5" />
              Registrar Salida
            </Button>

            {/* Enabled types */}
            {config && config.enabledRecordTypes.length > 0 && (
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                <p className="text-xs text-zinc-500 mb-2">Tipos de registro habilitados</p>
                <div className="flex flex-wrap gap-2">
                  {config.enabledRecordTypes.map((type) => {
                    const tc = RECORD_TYPE_CONFIG[type];
                    return (
                      <Badge key={type} variant="outline" className="border-zinc-600 text-zinc-300">
                        {tc.label}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "en-sitio" && (
          <InSiteList
            installationId={installationId}
            guardId={guardId}
            maxStayHours={config?.maxStayHours}
            onExitRegistered={fetchInSiteCount}
          />
        )}

        {activeTab === "esperados" && (
          <ExpectedToday installationId={installationId} />
        )}
      </div>
    </div>
  );
}
