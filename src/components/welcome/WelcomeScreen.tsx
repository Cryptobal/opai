"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Shield, UserCog, Users, Zap } from "lucide-react";
import { useBranding } from "@/lib/branding/useBranding";
import { PortalCard } from "./PortalCard";

const STORAGE_KEY = "opai-last-portal";

interface LastPortal {
  key: string;
  label: string;
  href: string;
}

const PORTALS = [
  {
    key: "guardia",
    icon: Shield,
    title: "Guardia",
    subtitle: "Portal de Guardia",
    accentColor: "#2dd4bf",
    subOptions: [
      { label: "Portal Guardia", subtitle: "Novedades, asistencia y documentos", href: "/portal/guardia" },
      { label: "Portal Rondas", subtitle: "Registro de rondas y checkpoints", href: "/portal/rondas" },
    ],
  },
  {
    key: "supervisor",
    icon: UserCog,
    title: "Supervisor",
    subtitle: "Hub Operacional",
    accentColor: "#a78bfa",
    href: "/portal/supervisor",
  },
  {
    key: "cliente",
    icon: Users,
    title: "Cliente",
    subtitle: "Portal de Servicios",
    accentColor: "#38bdf8",
    href: "/portal/cliente",
  },
  {
    key: "opai",
    icon: Zap,
    title: "OPAI",
    subtitle: "Sistema ERP Completo",
    accentColor: "#f472b6",
    href: "/opai/login",
  },
];

export function WelcomeScreen() {
  const router = useRouter();
  const { branding, loading } = useBranding();
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

  const logoSrc = branding.logoWhite || branding.logoFull;

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-8"
      style={{ backgroundColor: branding.primaryColor }}
    >
      <div className="w-full max-w-lg mx-auto flex flex-col items-center">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          {logoSrc ? (
            <img src={logoSrc} alt={branding.companyName} className="h-14 object-contain" />
          ) : (
            <div className="text-3xl font-bold text-white">{branding.companyName}</div>
          )}
        </motion.div>

        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="text-center mb-8"
        >
          <h1 className="text-2xl font-bold text-white mb-1">
            Bienvenido a {branding.appName}
          </h1>
          <p className="text-white/60 text-sm">Selecciona tu perfil para continuar</p>
        </motion.div>

        {/* Last portal chip */}
        {lastPortal && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            onClick={() => router.push(lastPortal.href)}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs text-white/70 hover:bg-white/10 transition-colors"
          >
            <span>Último acceso: <span className="text-white font-medium capitalize">{lastPortal.key}</span></span>
            <span className="text-white/40">&rarr; Ir directo</span>
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
              href={portal.href}
              subOptions={portal.subOptions}
              index={i}
              onNavigate={handleNavigate}
            />
          ))}
        </div>

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-10 text-center text-xs text-white/30"
        >
          <span>{branding.appName} &middot; {branding.tagline}</span>
        </motion.div>
      </div>
    </div>
  );
}
