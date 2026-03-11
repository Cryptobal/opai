"use client";

import { type ReactNode } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { AuthBackground } from "./AuthBackground";
import { AuthNavBar } from "./AuthNavBar";
import type { PortalId } from "./auth-config";

interface AuthShellProps {
  children: ReactNode;
  portalId: PortalId | "home";
  accent: string;       // ej: "#2dd4bf"
  accentRgb: string;    // ej: "45, 212, 191"
  portalName: string;   // ej: "Portal Guardia"
  portalSubtitle: string; // ej: "Novedades y asistencia"
  showPortalBadge?: boolean;
  showBackLink?: boolean;
}

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
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden"
      style={{
        background: "linear-gradient(180deg, #060a13 0%, #0a0e17 30%, #0d1220 100%)",
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}
    >
      {/* Animated orbs background */}
      <AuthBackground accentRgb={accentRgb} />

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
      <AuthNavBar activePortalId={portalId} />

      {/* Main content */}
      <div className="relative z-[2] w-full max-w-[400px] px-5 pt-20 pb-16">
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
              {/* Zap icon */}
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

        {/* Portal badge */}
        {showPortalBadge && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
            className="text-center mb-7"
          >
            <div
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full"
              style={{
                background: `${accent}0a`,
                border: `1px solid ${accent}20`,
              }}
            >
              <div
                className="w-[7px] h-[7px] rounded-full"
                style={{
                  background: accent,
                  boxShadow: `0 0 10px ${accent}50`,
                }}
              />
              <span className="text-xs font-semibold" style={{ color: accent }}>
                {portalName}
              </span>
              <span className="text-[11px] text-[#6b7280]">&middot;</span>
              <span className="text-[11px] text-[#6b7280]">{portalSubtitle}</span>
            </div>
          </motion.div>
        )}

        {/* Card container */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.25 }}
          className="relative p-7 rounded-[20px]"
          style={{
            background: "rgba(255,255,255,0.018)",
            border: "1px solid rgba(255,255,255,0.055)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            boxShadow: `0 4px 40px rgba(0,0,0,0.25), 0 0 80px ${accent}05`,
          }}
        >
          {/* Top glow line */}
          <div
            className="absolute -top-px left-1/2 -translate-x-1/2 w-1/2 h-px"
            style={{
              background: `linear-gradient(90deg, transparent, ${accent}50, transparent)`,
            }}
          />
          {children}
        </motion.div>

        {/* Back to selector */}
        {showBackLink && (
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
        )}
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
