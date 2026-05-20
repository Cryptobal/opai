"use client";

import { useCallback, useState } from "react";
import { PendingSendsBanner } from "./PendingSendsBanner";

/**
 * Server-component bridge: la página /programacion es RSC, pero el banner
 * necesita state + fetch del lado cliente. Este wrapper aísla esa frontera
 * sin requerir convertir la página entera a "use client". Tras un retry,
 * forzamos remount del banner via `key` para refrescar los conteos.
 */
export function PendingSendsBannerWrapper() {
  const [refreshKey, setRefreshKey] = useState(0);
  const onAfterRetry = useCallback(() => setRefreshKey((k) => k + 1), []);
  return <PendingSendsBanner key={refreshKey} onAfterRetry={onAfterRetry} />;
}
