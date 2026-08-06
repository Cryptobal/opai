"use client";

import dynamic from "next/dynamic";

/**
 * Providers / hosts del root layout que no participan del primer paint.
 * `ssr: false` no es válido en Server Components (App Router); este
 * wrapper cliente concentra el deferral (mismo patrón que AppLayoutClient).
 *
 * Toaster (sonner) y ConfirmHost son imperativos: toleran montaje diferido
 * (llamadas antes del mount se pierden; en el cold start no hay toasts).
 */

const Toaster = dynamic(
  () => import("@/components/ui/toaster").then((m) => m.Toaster),
  { ssr: false },
);

const UndoSnackbarHost = dynamic(
  () => import("@/components/opai-ds").then((m) => m.UndoSnackbarHost),
  { ssr: false },
);

const ConfirmHost = dynamic(
  () => import("@/components/ui/confirm-service").then((m) => m.ConfirmHost),
  { ssr: false },
);

const CookieConsentBanner = dynamic(
  () => import("@/components/CookieConsent").then((m) => m.CookieConsentBanner),
  { ssr: false },
);

const ConditionalAnalytics = dynamic(
  () =>
    import("@/components/ConditionalAnalytics").then(
      (m) => m.ConditionalAnalytics,
    ),
  { ssr: false },
);

const Analytics = dynamic(
  () => import("@vercel/analytics/react").then((m) => m.Analytics),
  { ssr: false },
);

/** Overlays que viven dentro de ThemeProvider. */
export function DeferredThemeOverlays() {
  return (
    <>
      <Toaster />
      <UndoSnackbarHost />
      <ConfirmHost />
    </>
  );
}

/** Overlays / analytics fuera de ThemeProvider. */
export function DeferredRootOverlays() {
  return (
    <>
      <CookieConsentBanner />
      <ConditionalAnalytics />
      <Analytics />
    </>
  );
}
