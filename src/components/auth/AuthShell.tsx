"use client";

import { type ReactNode } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { AuthBackground } from "./AuthBackground";
import { AuthNavBar } from "./AuthNavBar";
import type { PortalId } from "./auth-config";
import { useBranding } from "@/lib/branding/useBranding";

interface AuthShellProps {
  children: ReactNode;
  portalId: PortalId | "home";
  accent: string; // ej: "#2dd4bf"
  accentRgb: string; // ej: "45, 212, 191"
  portalName: string; // ej: "Portal Guardia"
  portalSubtitle: string; // ej: "Novedades y asistencia"
  showPortalBadge?: boolean;
  showBackLink?: boolean;
}

/**
 * AuthShell — the chrome shared by every login / pairing screen.
 *
 * Visual rules (mobile-first):
 *   - Full-height dark gradient background, safe-area aware.
 *   - Two non-interactive decorative layers: noise + grid pattern.
 *   - AuthNavBar fixed at top (3 hub tabs: Terreno / Personas / OPAI ERP).
 *   - Centered hero: tenant logo (or OPAI fallback) with a soft radial halo
 *     tinted using the tenant's primaryColor. Falls back to the portal
 *     accent when branding is still loading.
 *   - Portal badge chip (optional).
 *   - Card container using glassmorphism (backdrop blur + white 5.5% border).
 *   - Footer "Powered by LX3.ai".
 *
 * Tenant branding source: `useBranding()` reads `/api/branding` and returns
 * logos + primaryColor. The `/api/branding` endpoint resolves the tenant
 * from the caller's auth (NextAuth admin, portal cliente cookie, or
 * device bearer token). If there's no session, OPAI defaults are returned.
 */
export function AuthShell({
  children,
  portalId,
  accent,
  accentRgb,
  portalName,
  portalSubtitle,
  showPortalBadge = true,
  showBackLink = true,
}: AuthShellProps) {
  const { branding } = useBranding();

  // Halo color: prefer tenant primaryColor, fall back to accent. A valid hex
  // is required for the rgba() construction below — if primaryColor is
  // missing or malformed we gracefully fall back to the portal accent.
  const haloHex = normalizeHex(branding.primaryColor) ?? accent;
  const haloRgb = hexToRgb(haloHex);

  return (
    <div
      className="min-h-dvh flex flex-col items-center justify-center relative overflow-hidden"
      style={{
        background:
          "linear-gradient(180deg, #060a13 0%, #0a0e17 30%, #0d1220 100%)",
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        paddingTop: "var(--safe-area-top, 0px)",
        paddingBottom: "var(--safe-area-bottom, 0px)",
      }}
    >
      {/* Animated orbs (existing) */}
      <AuthBackground accentRgb={accentRgb} />

      {/* Tenant halo — large radial gradient behind the hero logo.
          Uses the tenant's primaryColor so each tenant's login feels
          subtly different without needing a heavy background image. */}
      <div
        className="fixed inset-0 pointer-events-none z-[1]"
        aria-hidden
        style={{
          background: haloRgb
            ? `radial-gradient(ellipse 70% 50% at 50% 30%, rgba(${haloRgb},0.18) 0%, rgba(${haloRgb},0.06) 30%, transparent 70%)`
            : undefined,
        }}
      />

      {/* Noise overlay */}
      <div
        className="fixed inset-0 pointer-events-none z-[1]"
        aria-hidden
        style={{
          opacity: 0.025,
          background: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Grid pattern */}
      <div
        className="fixed inset-0 pointer-events-none z-[1]"
        aria-hidden
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.008) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.008) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
          maskImage:
            "radial-gradient(ellipse at center, black 20%, transparent 70%)",
          WebkitMaskImage:
            "radial-gradient(ellipse at center, black 20%, transparent 70%)",
        }}
      />

      {/* Top nav bar */}
      <AuthNavBar activePortalId={portalId} />

      {/* Main content */}
      <div className="relative z-[2] w-full max-w-[420px] px-5 pt-20 pb-16">
        {/* Tenant logo hero */}
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="text-center mb-8 relative"
        >
          {/* Logo with a tight halo directly behind it */}
          <div className="relative inline-flex mb-3">
            {/* Glow plate behind the icon */}
            <div
              aria-hidden
              className="absolute inset-0 -m-3 rounded-3xl blur-xl"
              style={{
                background: haloRgb
                  ? `radial-gradient(circle, rgba(${haloRgb},0.45) 0%, rgba(${haloRgb},0.1) 60%, transparent 80%)`
                  : undefined,
              }}
            />
            {branding.logoIcon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={branding.logoIcon}
                alt={branding.appName}
                className="relative w-[58px] h-[58px] rounded-[16px] object-contain"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src="/brand/opai/isotipo/isotipo-white.png"
                alt="OPAI"
                className="relative w-[58px] h-[58px] rounded-[16px] object-contain"
              />
            )}
          </div>

          {/* Wordmark */}
          {branding.logoFull ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={branding.logoFull}
              alt={branding.appName}
              className="h-8 object-contain mx-auto"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/brand/opai/logotipo/logo-stacked-white.png"
              alt="OPAI"
              className="h-8 object-contain mx-auto"
            />
          )}

          {/* Company / tenant name */}
          <div
            className="text-[11px] text-[#6b7280] mt-2"
            style={{ letterSpacing: "0.08em", textTransform: "uppercase" }}
          >
            {branding.companyName}
          </div>
        </motion.div>

        {/* Portal badge */}
        {showPortalBadge ? (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.5,
              ease: [0.16, 1, 0.3, 1],
              delay: 0.15,
            }}
            className="text-center mb-6"
          >
            <div
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full"
              style={{
                background: `${accent}0d`,
                border: `1px solid ${accent}25`,
              }}
            >
              <div
                className="w-[7px] h-[7px] rounded-full"
                style={{
                  background: accent,
                  boxShadow: `0 0 12px ${accent}60`,
                }}
              />
              <span
                className="text-xs font-semibold"
                style={{ color: accent, letterSpacing: "-0.01em" }}
              >
                {portalName}
              </span>
              <span className="text-[11px] text-[#6b7280]">&middot;</span>
              <span className="text-[11px] text-[#9ca3af]">{portalSubtitle}</span>
            </div>
          </motion.div>
        ) : null}

        {/* Card container */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.25 }}
          className="relative p-6 sm:p-7 rounded-[22px]"
          style={{
            background: "rgba(255,255,255,0.022)",
            border: "1px solid rgba(255,255,255,0.06)",
            backdropFilter: "blur(24px) saturate(1.2)",
            WebkitBackdropFilter: "blur(24px) saturate(1.2)",
            boxShadow: `0 12px 50px rgba(0,0,0,0.35), 0 0 80px ${accent}08`,
          }}
        >
          {/* Top hairline glow */}
          <div
            aria-hidden
            className="absolute -top-px left-1/2 -translate-x-1/2 w-[60%] h-px"
            style={{
              background: `linear-gradient(90deg, transparent, ${accent}70, transparent)`,
            }}
          />
          {children}
        </motion.div>

        {/* Back to welcome */}
        {showBackLink ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-center mt-6"
          >
            <Link
              href="/welcome"
              className="text-[13px] text-[#4b5563] hover:text-[#9ca3af] transition-colors"
            >
              &larr; Volver a selecci&oacute;n de portales
            </Link>
          </motion.div>
        ) : null}
      </div>

      {/* Footer */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[50] opacity-50">
        <span className="text-[11px] text-[#4b5563]">
          Powered by{" "}
          <a
            href="https://lx3.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#6b7280] no-underline font-medium hover:text-[#9ca3af] transition-colors"
            style={{ borderBottom: "1px solid rgba(107,114,128,0.25)" }}
          >
            LX3.ai
          </a>
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Color helpers                                                        */
/* ------------------------------------------------------------------ */

function normalizeHex(value: string | undefined | null): string | null {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed)) return null;
  return trimmed;
}

function hexToRgb(hex: string | null): string | null {
  if (!hex) return null;
  let h = hex.replace("#", "");
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
  return `${r},${g},${b}`;
}
