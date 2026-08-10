/**
 * Runtime battery / network probe for Safari Web Inspector (iPad/iPhone PWA).
 * Paste into the console, wait, then call: __batteryProbe.report()
 */
(function installBatteryProbe() {
  if (typeof window === "undefined") return;
  if (window.__batteryProbe?.installed) {
    console.info("[battery-probe] already installed");
    return window.__batteryProbe;
  }

  const startedAt = Date.now();
  const requests = [];
  let whileHidden = 0;
  let hiddenStartedAt = null;
  let hiddenMs = 0;

  const origFetch = window.fetch.bind(window);
  window.fetch = function probedFetch(input, init) {
    const url =
      typeof input === "string"
        ? input
        : input && typeof input === "object" && "url" in input
          ? String(input.url)
          : String(input);
    const ts = Date.now();
    const hidden = typeof document !== "undefined" && document.visibilityState !== "visible";
    if (hidden) whileHidden += 1;
    requests.push({ url, ts, hidden, method: (init && init.method) || "GET" });
    return origFetch(input, init);
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      hiddenStartedAt = Date.now();
    } else if (hiddenStartedAt != null) {
      hiddenMs += Date.now() - hiddenStartedAt;
      hiddenStartedAt = null;
    }
  });

  function pathOf(url) {
    try {
      return new URL(url, location.origin).pathname;
    } catch {
      return url;
    }
  }

  function report() {
    const now = Date.now();
    const elapsedMs = now - startedAt;
    const elapsedMin = Math.max(elapsedMs / 60000, 1 / 60);
    const byPath = {};
    for (const r of requests) {
      const p = pathOf(r.url);
      byPath[p] = (byPath[p] || 0) + 1;
    }
    const result = {
      elapsedMs,
      elapsedMin: Number(elapsedMin.toFixed(3)),
      requests: {
        total: requests.length,
        perMinute: Number((requests.length / elapsedMin).toFixed(2)),
        whileHidden,
        byPath,
      },
      hiddenMs:
        hiddenMs + (hiddenStartedAt != null ? now - hiddenStartedAt : 0),
      visibilityState: document.visibilityState,
    };
    console.table(
      Object.entries(byPath)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30)
        .map(([path, count]) => ({
          path,
          count,
          perMinute: Number((count / elapsedMin).toFixed(2)),
        })),
    );
    console.info("[battery-probe] report", result);
    return result;
  }

  window.__batteryProbe = {
    installed: true,
    report,
    reset() {
      requests.length = 0;
      whileHidden = 0;
      hiddenMs = 0;
      hiddenStartedAt =
        document.visibilityState === "hidden" ? Date.now() : null;
    },
    get raw() {
      return { requests: requests.slice(), whileHidden, startedAt };
    },
  };

  console.info(
    "[battery-probe] installed — wait, then __batteryProbe.report()",
  );
  return window.__batteryProbe;
})();
