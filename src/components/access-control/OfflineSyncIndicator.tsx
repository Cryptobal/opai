"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Wifi, WifiOff, Loader2 } from "lucide-react";
import type { SyncStatus } from "@/lib/access-control/types";

interface Props {
  installationId: string;
}

export function OfflineSyncIndicator({ installationId }: Props) {
  const [status, setStatus] = useState<SyncStatus>("online");
  const [pendingCount, setPendingCount] = useState(0);

  const checkStatus = useCallback(() => {
    const isOnline = navigator.onLine;
    const offlineRecords = JSON.parse(
      localStorage.getItem(`ac_offline_records_${installationId}`) || "[]"
    );
    setPendingCount(offlineRecords.length);

    if (!isOnline) {
      setStatus("offline");
    } else if (offlineRecords.length > 0) {
      setStatus("syncing");
      syncPending(offlineRecords);
    } else {
      setStatus("online");
    }
  }, [installationId]);

  const syncPending = async (records: unknown[]) => {
    try {
      const res = await fetch("/api/access-control/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records, exits: [] }),
      });

      const json = await res.json();
      if (json.success) {
        localStorage.removeItem(`ac_offline_records_${installationId}`);
        setPendingCount(0);
        setStatus("online");
      }
    } catch {
      setStatus("offline");
    }
  };

  useEffect(() => {
    checkStatus();

    const handleOnline = () => checkStatus();
    const handleOffline = () => setStatus("offline");

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Check periodically
    const interval = setInterval(checkStatus, 15000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, [checkStatus]);

  const configs = {
    online: {
      icon: <Wifi className="h-3.5 w-3.5" />,
      color: "text-status-ok-fg",
      bg: "bg-status-ok-soft",
      label: "Online",
    },
    syncing: {
      icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
      color: "text-status-warn-fg",
      bg: "bg-status-warn-soft",
      label: "Sincronizando",
    },
    offline: {
      icon: <WifiOff className="h-3.5 w-3.5" />,
      color: "text-status-danger-fg",
      bg: "bg-status-danger-soft",
      label: "Offline",
    },
  };

  const cfg = configs[status];

  return (
    <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 ${cfg.bg}`}>
      <span className={cfg.color}>{cfg.icon}</span>
      <span className={`text-xs font-medium ${cfg.color}`}>
        {cfg.label}
        {pendingCount > 0 && ` (${pendingCount})`}
      </span>
    </div>
  );
}
