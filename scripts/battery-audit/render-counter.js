/**
 * Counts layout-ish work proxies during interaction (scroll / rAF).
 * Paste into Web Inspector, interact, then: __renderCounter.report()
 */
(function installRenderCounter() {
  if (typeof window === "undefined") return;
  if (window.__renderCounter?.installed) {
    console.info("[render-counter] already installed");
    return window.__renderCounter;
  }

  const startedAt = Date.now();
  let rafFrames = 0;
  let scrollEvents = 0;
  let vvScrollEvents = 0;
  let styleWrites = 0;
  let lastReport = null;

  const origRaf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = function probedRaf(cb) {
    return origRaf((t) => {
      rafFrames += 1;
      return cb(t);
    });
  };

  window.addEventListener(
    "scroll",
    () => {
      scrollEvents += 1;
    },
    { passive: true, capture: true },
  );
  window.visualViewport?.addEventListener(
    "scroll",
    () => {
      vvScrollEvents += 1;
    },
    { passive: true },
  );

  const proto = CSSStyleDeclaration.prototype;
  const origSetProperty = proto.setProperty;
  proto.setProperty = function probedSetProperty(name, value, priority) {
    if (String(name).startsWith("--portal-") || String(name).startsWith("--")) {
      styleWrites += 1;
    }
    return origSetProperty.call(this, name, value, priority);
  };

  function snapshot() {
    return {
      elapsedMs: Date.now() - startedAt,
      rafFrames,
      scrollEvents,
      visualViewportScrollEvents: vvScrollEvents,
      customPropertyWrites: styleWrites,
    };
  }

  function report() {
    lastReport = snapshot();
    console.info("[render-counter] report", lastReport);
    return lastReport;
  }

  window.__renderCounter = {
    installed: true,
    report,
    reset() {
      rafFrames = 0;
      scrollEvents = 0;
      vvScrollEvents = 0;
      styleWrites = 0;
    },
    get last() {
      return lastReport;
    },
  };

  console.info(
    "[render-counter] installed — scroll, then __renderCounter.report()",
  );
  return window.__renderCounter;
})();
