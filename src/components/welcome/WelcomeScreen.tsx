"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useBranding } from "@/lib/branding/useBranding";
import { motion } from "framer-motion";
import { AuthBackground } from "@/components/auth/AuthBackground";
import { AuthNavBar } from "@/components/auth/AuthNavBar";
import {
  ShieldCheckIcon,
  UsersGroupIcon,
  ZapBoltIcon,
} from "@/components/auth/icons";
import { PortalCard } from "./PortalCard";

const STORAGE_KEY = "opai-last-portal";

interface LastPortal {
  key: string;
  label: string;
  href: string;
}

interface PortalDef {
  key: string;
  icon: React.ComponentType<{ color: string }>;
  title: string;
  subtitle: string;
  accentColor: string;
  glow: string;
  href: string;
  subChips: string[];
}

const PORTALS: PortalDef[] = [
  {
    key: "terreno",
    icon: ShieldCheckIcon,
    title: "Terreno",
    subtitle: "Dispositivo de instalación, compartido entre turnos",
    accentColor: "#f59e0b",
    glow: "rgba(245,158,11,0.14)",
    href: "/portal/terreno",
    subChips: ["Marcación", "Rondas", "Acceso"],
  },
  {
    key: "personas",
    icon: UsersGroupIcon,
    title: "Personas",
    subtitle: "Tu app personal: pauta, documentos, chat, reportes",
    accentColor: "#2dd4bf",
    glow: "rgba(45,212,191,0.14)",
    href: "/portal/personas",
    subChips: ["Guardia", "Supervisor", "Cliente"],
  },
  {
    key: "opai",
    icon: ZapBoltIcon,
    title: "OPAI ERP",
    subtitle: "Sistema completo de gestión operativa y comercial",
    accentColor: "#f43f5e",
    glow: "rgba(244,63,94,0.14)",
    href: "/opai/login",
    subChips: ["Admin"],
  },
];

export function WelcomeScreen() {
  const router = useRouter();
  const { branding } = useBranding();
  const [lastPortal, setLastPortal] = useState<LastPortal | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setLastPortal(JSON.parse(stored));
    } catch {
      // ignore
    }
  }, []);

  function handleNavigate(href: string, portalKey: string) {
    const portal: LastPortal = { key: portalKey, label: portalKey, href };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(portal));
    } catch {
      // ignore
    }
    router.push(href);
  }

  // Halo tint: prefer tenant primary color, fall back to OPAI rose.
  const primaryHex = branding.primaryColor || "#f43f5e";
  const primaryRgb = hexToRgb(primaryHex) ?? "244,63,94";

  return (
    <div
      className="min-h-dvh flex flex-col items-center relative overflow-hidden"
      style={{
        background:
          "linear-gradient(180deg, #060a13 0%, #0a0e17 30%, #0d1220 100%)",
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        paddingTop: "var(--safe-area-top, 0px)",
        paddingBottom: "var(--safe-area-bottom, 0px)",
      }}
    >
      {/* Animated orbs background */}
      <AuthBackground accentRgb={primaryRgb} />

      {/* Tenant halo */}
      <div
        aria-hidden
        className="fixed inset-0 pointer-events-none z-[1]"
        style={{
          background: `radial-gradient(ellipse 80% 55% at 50% 28%, rgba(${primaryRgb},0.2) 0%, rgba(${primaryRgb},0.06) 32%, transparent 70%)`,
        }}
      />

      {/* Noise overlay */}
      <div
        aria-hidden
        className="fixed inset-0 pointer-events-none z-[1]"
        style={{
          opacity: 0.025,
          background: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Grid pattern */}
      <div
        aria-hidden
        className="fixed inset-0 pointer-events-none z-[1]"
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
      <AuthNavBar activePortalId="home" />

      {/* Main content — flex-1 so footer sits at the bottom on short screens */}
      <div className="relative z-[2] flex-1 w-full max-w-[840px] px-5 pt-20 pb-10 flex flex-col justify-center">
        {/* Tenant hero */}
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="text-center mb-9"
        >
          <div className="relative inline-flex mb-3">
            {/* Soft halo plate right behind the icon */}
            <div
              aria-hidden
              className="absolute inset-0 -m-3 rounded-3xl blur-xl"
              style={{
                background: `radial-gradient(circle, rgba(${primaryRgb},0.5) 0%, rgba(${primaryRgb},0.12) 60%, transparent 80%)`,
              }}
            />
            {branding.logoIcon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={branding.logoIcon}
                alt={branding.appName}
                className="relative w-[60px] h-[60px] rounded-[17px] object-contain"
              />
            ) : (
              <div
                className="relative w-[60px] h-[60px] rounded-[17px] flex items-center justify-center"
                style={{
                  background: "linear-gradient(135deg, #f43f5e, #e11d48, #be123c)",
                  boxShadow: "0 0 40px rgba(244,63,94,0.25)",
                }}
              >
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </div>
            )}
          </div>

          {branding.logoFull ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={branding.logoFull}
              alt={branding.appName}
              className="h-9 object-contain mx-auto"
            />
          ) : (
            <div
              className="text-[30px] font-extrabold text-[#f9fafb]"
              style={{ letterSpacing: "-0.03em" }}
            >
              OPAI
            </div>
          )}

          <div
            className="text-[11px] text-[#6b7280] mt-2"
            style={{ letterSpacing: "0.08em", textTransform: "uppercase" }}
          >
            {branding.companyName}
          </div>
        </motion.div>

        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.5,
            ease: [0.16, 1, 0.3, 1],
            delay: 0.12,
          }}
          className="text-center mb-7"
        >
          <h1
            className="text-[22px] sm:text-[24px] font-bold text-[#f9fafb] mb-1.5"
            style={{ letterSpacing: "-0.02em" }}
          >
            Selecciona tu portal
          </h1>
          <p className="text-[13px] text-[#9ca3af]">
            Una plataforma, tres modos de trabajo
          </p>
        </motion.div>

        {/* Last portal chip */}
        {lastPortal ? (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.28 }}
            onClick={() => router.push(lastPortal.href)}
            className="mx-auto mb-5 flex items-center gap-2 rounded-full px-4 py-2 text-xs transition-all hover:bg-white/[0.08]"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "#9ca3af",
            }}
          >
            <span>
              Último acceso:{" "}
              <span className="text-[#f9fafb] font-medium capitalize">
                {lastPortal.key}
              </span>
            </span>
            <span className="text-[#4b5563]">→ Ir directo</span>
          </motion.button>
        ) : null}

        {/* Portal cards — 1 col mobile, 3 col desktop, equal height */}
        <div className="w-full grid gap-3.5 sm:gap-4 grid-cols-1 sm:grid-cols-3">
          {PORTALS.map((portal, i) => (
            <PortalCard
              key={portal.key}
              icon={portal.icon}
              title={portal.title}
              subtitle={portal.subtitle}
              accentColor={portal.accentColor}
              glow={portal.glow}
              href={portal.href}
              subChips={portal.subChips}
              index={i}
              onNavigate={handleNavigate}
            />
          ))}
        </div>

        {/* Status chip */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.55 }}
          className="flex justify-center mt-8"
        >
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px]"
            style={{
              background: "rgba(16,185,129,0.06)",
              border: "1px solid rgba(16,185,129,0.18)",
              color: "#9ca3af",
            }}
          >
            <div
              className="w-[6px] h-[6px] rounded-full bg-status-ok"
              style={{ boxShadow: "0 0 8px rgba(16,185,129,0.6)" }}
              aria-hidden
            />
            Todos los sistemas operativos
          </div>
        </motion.div>
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
/*  Helpers                                                              */
/* ------------------------------------------------------------------ */

function hexToRgb(hex: string | null | undefined): string | null {
  if (!hex || typeof hex !== "string") return null;
  let h = hex.trim().replace("#", "");
  if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(h)) return null;
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
