import "@testing-library/jest-dom";

// Env vars mínimas para que módulos con guard de import (src/lib/resend.ts)
// no revienten suites completas en CI. Ningún test envía correos reales.
process.env.RESEND_API_KEY ||= "re_test_dummy";

// Polyfills for jsdom — needed by components that use ResizeObserver,
// IntersectionObserver, scrollIntoView, etc.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
if (typeof globalThis.IntersectionObserver === "undefined") {
  globalThis.IntersectionObserver = class {
    root = null;
    rootMargin = "";
    thresholds = [];
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
}
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}
