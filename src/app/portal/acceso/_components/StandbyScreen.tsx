"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2 } from "lucide-react";

interface StandbyScreenProps {
  installationId: string;
  installationName: string;
  deviceToken: string;
  onWake: (needsGuardSelect: boolean) => void;
  guardSelectedAt: string | null;
}

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

export function StandbyScreen({
  installationId,
  installationName,
  deviceToken,
  onWake,
  guardSelectedAt,
}: StandbyScreenProps) {
  const [time, setTime] = useState(() =>
    new Date().toLocaleTimeString("es-CL", {
      hour: "2-digit",
      minute: "2-digit",
    })
  );
  const [date, setDate] = useState(() =>
    new Date().toLocaleDateString("es-CL", {
      weekday: "long",
      day: "numeric",
      month: "long",
    })
  );
  const [inSiteCount, setInSiteCount] = useState<number | null>(null);

  // Update clock every minute
  useEffect(() => {
    function updateClock() {
      const now = new Date();
      setTime(
        now.toLocaleTimeString("es-CL", {
          hour: "2-digit",
          minute: "2-digit",
        })
      );
      setDate(
        now.toLocaleDateString("es-CL", {
          weekday: "long",
          day: "numeric",
          month: "long",
        })
      );
    }
    updateClock();
    const interval = setInterval(updateClock, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Fetch in-site count every 30 seconds
  useEffect(() => {
    async function fetchCount() {
      try {
        const res = await fetch(
          `/api/access-control/records/${installationId}?status=in_site&limit=1`,
          {
            headers: { Authorization: `Bearer ${deviceToken}` },
          }
        );
        if (res.ok) {
          const data = await res.json();
          const count = data?.meta?.total ?? data?.count ?? 0;
          setInSiteCount(count);
        }
      } catch {
        // Silently fail, keep previous count
      }
    }
    fetchCount();
    const interval = setInterval(fetchCount, 30_000);
    return () => clearInterval(interval);
  }, [installationId, deviceToken]);

  // Release wake lock when entering standby (screen can sleep)
  useEffect(() => {
    // No wake lock in standby mode — wake lock is acquired outside standby
    return () => {
      // Cleanup handled by parent
    };
  }, []);

  const handleWake = useCallback(() => {
    if (!guardSelectedAt) {
      onWake(true);
      return;
    }

    const elapsed = Date.now() - new Date(guardSelectedAt).getTime();
    onWake(elapsed > TWELVE_HOURS_MS);
  }, [guardSelectedAt, onWake]);

  // Capitalize first letter of date string
  const formattedDate = date.charAt(0).toUpperCase() + date.slice(1);

  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center bg-[#0A0F1C] px-6 cursor-pointer select-none"
      onClick={handleWake}
      onTouchStart={handleWake}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") handleWake();
      }}
    >
      {/* Installation */}
      <div className="flex items-center gap-2 mb-12">
        <Building2 className="h-5 w-5 text-cyan-500 shrink-0" />
        <span className="text-sm font-medium text-gray-400">
          {installationName}
        </span>
      </div>

      {/* Clock */}
      <div className="flex flex-col items-center mb-12">
        <p className="text-7xl font-bold text-white tabular-nums tracking-tight">
          {time}
        </p>
        <p className="mt-3 text-lg text-gray-400">{formattedDate}</p>
      </div>

      {/* People counter */}
      {inSiteCount !== null && (
        <div className="mb-16">
          <p className="text-base text-gray-400">
            <span className="mr-1.5">👥</span>
            {inSiteCount} en sitio ahora
          </p>
        </div>
      )}

      {/* Tap hint */}
      <p className="text-sm text-gray-600 animate-pulse">
        Toca para registrar acceso
      </p>
    </div>
  );
}
