"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AuthBackground } from "@/components/auth/AuthBackground";
import { AuthNavBar } from "@/components/auth/AuthNavBar";
import { ShieldCheckIcon, UsersGroupIcon, BuildingIcon, ZapBoltIcon } from "@/components/auth/icons";
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
  href?: string;
  subOptions?: { label: string; subtitle: string; href: string }[];
}

const PORTALS: PortalDef[] = [
  {
    key: "guardia",
    icon: ShieldCheckIcon,
    title: "Guardia",
    subtitle: "Portal de Guardia",
    accentColor: "#2dd4bf",
    glow: "rgba(45,212,191,0.12)",
    subOptions: [
      { label: "Portal Marcación", subtitle: "Entrada y salida con Face ID o PIN", href: "/portal/marcacion" },
      { label: "Portal Guardia", subtitle: "Novedades, asistencia y documentos", href: "/portal/guardia" },
      { label: "Portal Rondas", subtitle: "Registro de rondas y checkpoints", href: "/portal/rondas" },
    ],
  },
  {
    key: "supervisor",
    icon: UsersGroupIcon,
    title: "Supervisor",
    subtitle: "Hub Operacional",
    accentColor: "#8b5cf6",
    glow: "rgba(139,92,246,0.12)",
    href: "/portal/supervisor",
  },
  {
    key: "cliente",
    icon: BuildingIcon,
    title: "Cliente",
    subtitle: "Portal de Servicios",
    accentColor: "#3b82f6",
    glow: "rgba(59,130,246,0.12)",
    href: "/portal/cliente",
  },
  {
    key: "opai",
    icon: ZapBoltIcon,
    title: "OPAI",
    subtitle: "Sistema ERP Completo",
    accentColor: "#f43f5e",
    glow: "rgba(244,63,94,0.12)",
    href: "/opai/login",
  },
];

export function WelcomeScreen() {
  const router = useRouter();
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

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden"
      style={{
        background: "linear-gradient(180deg, #060a13 0%, #0a0e17 30%, #0d1220 100%)",
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}
    >
      {/* Animated orbs background */}
      <AuthBackground accentRgb="244, 63, 94" />

      {/* Noise overlay */}
      <div
        className="fixed inset-0 pointer-events-none z-[1]"
        style={{
          opacity: 0.025,
          background: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Grid pattern */}
      <div
        className="fixed inset-0 pointer-events-none z-[1]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.008) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.008) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
          maskImage: "radial-gradient(ellipse at center, black 20%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, black 20%, transparent 70%)",
        }}
      />

      {/* Top nav bar */}
      <AuthNavBar activePortalId="home" />

      {/* Main content */}
      <div className="relative z-[2] w-full max-w-[460px] px-5 pt-20 pb-16">
        {/* OPAI Logo */}
        <motion.div
          initial={{ opacity: 0, y: -8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="text-center mb-9"
        >
          <div className="inline-flex mb-3">
            <div
              className="w-[52px] h-[52px] rounded-[15px] flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, #f43f5e, #e11d48, #be123c)",
                boxShadow: "0 0 40px rgba(244,63,94,0.15), 0 0 80px rgba(244,63,94,0.05)",
              }}
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            </div>
          </div>
          <div className="text-[28px] font-extrabold text-[#f9fafb]" style={{ letterSpacing: "-0.03em" }}>
            OPAI
          </div>
          <div
            className="text-[11px] text-[#4b5563] mt-1.5"
            style={{ letterSpacing: "0.08em", textTransform: "uppercase" }}
          >
            by Gard Security
          </div>
        </motion.div>

        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
          className="text-center mb-7"
        >
          <h1 className="text-xl font-bold text-[#f9fafb] mb-1.5" style={{ letterSpacing: "-0.02em" }}>
            Selecciona tu portal
          </h1>
          <p className="text-[13px] text-[#6b7280]">
            Accede al m&oacute;dulo que necesitas
          </p>
        </motion.div>

        {/* Last portal chip */}
        {lastPortal && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            onClick={() => router.push(lastPortal.href)}
            className="mx-auto mb-5 flex items-center gap-2 rounded-full px-4 py-2 text-xs transition-colors"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "#9ca3af",
            }}
          >
            <span>&Uacute;ltimo acceso: <span className="text-[#f9fafb] font-medium capitalize">{lastPortal.key}</span></span>
            <span className="text-[#4b5563]">&rarr; Ir directo</span>
          </motion.button>
        )}

        {/* Portal cards */}
        <div className="w-full grid gap-3 sm:grid-cols-2">
          {PORTALS.map((portal, i) => (
            <PortalCard
              key={portal.key}
              icon={portal.icon}
              title={portal.title}
              subtitle={portal.subtitle}
              accentColor={portal.accentColor}
              glow={portal.glow}
              href={portal.href}
              subOptions={portal.subOptions}
              index={i}
              onNavigate={handleNavigate}
            />
          ))}
        </div>

        {/* Status badge */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="flex justify-center mt-8"
        >
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px]"
            style={{
              background: "rgba(16,185,129,0.06)",
              border: "1px solid rgba(16,185,129,0.15)",
              color: "#6b7280",
            }}
          >
            <div className="w-[6px] h-[6px] rounded-full bg-emerald-500" style={{ boxShadow: "0 0 8px rgba(16,185,129,0.5)" }} />
            Todos los sistemas operativos
          </div>
        </motion.div>
      </div>

      {/* Footer */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[50] opacity-45">
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
