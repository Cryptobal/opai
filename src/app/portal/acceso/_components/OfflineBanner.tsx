"use client";

import { useEffect, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";

interface OfflineBannerProps {
  isOnline: boolean;
  pendingCount: number;
}

export function OfflineBanner({ isOnline, pendingCount }: OfflineBannerProps) {
  const [wasPreviouslyOffline, setWasPreviouslyOffline] = useState(false);
  const [showSyncing, setShowSyncing] = useState(false);

  useEffect(() => {
    if (!isOnline) {
      setWasPreviouslyOffline(true);
      setShowSyncing(false);
    } else if (wasPreviouslyOffline && pendingCount > 0) {
      // Just came back online with pending records
      setShowSyncing(true);
      const timer = setTimeout(() => {
        setShowSyncing(false);
        setWasPreviouslyOffline(false);
      }, 5000);
      return () => clearTimeout(timer);
    } else if (wasPreviouslyOffline && pendingCount === 0) {
      // Came back online and everything synced
      setShowSyncing(false);
      setWasPreviouslyOffline(false);
    }
  }, [isOnline, pendingCount, wasPreviouslyOffline]);

  // Syncing state: green banner
  if (showSyncing && isOnline) {
    return (
      <div className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-40 flex items-center justify-center gap-2 bg-green-600/90 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition-all">
        <RefreshCw className="h-4 w-4 animate-spin" />
        <span>
          Sincronizando {pendingCount} {pendingCount === 1 ? "registro" : "registros"}...
        </span>
      </div>
    );
  }

  // Offline state: amber banner
  if (!isOnline) {
    return (
      <div className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-40 flex items-center justify-center gap-2 bg-amber-600/90 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition-all">
        <CloudOff className="h-4 w-4" />
        <span>
          Sin conexion
          {pendingCount > 0 && (
            <>
              {" "}
              &middot; {pendingCount}{" "}
              {pendingCount === 1 ? "registro pendiente" : "registros pendientes"}
            </>
          )}
        </span>
      </div>
    );
  }

  // Online and no sync needed: don't render anything
  return null;
}
