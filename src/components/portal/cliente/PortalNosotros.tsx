"use client";

import { useEffect, useRef, useState } from "react";
import { useBranding } from "@/lib/branding/useBranding";
import {
  Shield, Award, Smartphone, Clock, CheckCircle2, Star,
  MapPin, BarChart3, Users, Zap, Radio, Eye,
  Bot, FileText, ShieldCheck, MessageSquare, GraduationCap,
  Fingerprint, ClipboardList, Gauge, Globe, Ticket,
} from "lucide-react";
import { OpaiBadge } from "./OpaiBadge";
import { WhatsAppButton } from "./cotizaciones/WhatsAppButton";

/* ── Animated counter ── */
function AnimatedNumber({ target, suffix = "" }: { target: string; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [count, setCount] = useState(0);

  const numericTarget = parseInt(target.replace(/[^0-9]/g, ""), 10) || 0;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.3 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || numericTarget === 0) return;
    const duration = 1200;
    const start = performance.now();
    let raf: number;
    const animate = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * numericTarget));
      if (progress < 1) raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [visible, numericTarget]);

  const display = visible
    ? target.replace(/[0-9,]+/, count.toLocaleString("es-CL"))
    : "0";

  return <span ref={ref}>{display}{suffix}</span>;
}

/* ── Fade-in on scroll ── */
function FadeIn({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.15 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(20px)",
        transition: `opacity 0.6s ease ${delay}ms, transform 0.6s ease ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

/* ── Rondas live pulse ── */
function LivePulse() {
  return (
    <span className="relative flex h-2 w-2">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
    </span>
  );
}

const STATS = [
  { value: "15+", label: "Años de experiencia", color: "text-status-info-fg", bg: "from-teal-500/15 to-teal-600/5" },
  { value: "200+", label: "Clientes activos", color: "text-status-info-fg", bg: "from-blue-500/15 to-blue-600/5" },
  { value: "1,500+", label: "Guardias certificados", color: "text-violet-400", bg: "from-violet-500/15 to-violet-600/5" },
  { value: "96%", label: "Tasa de retención", color: "text-status-warn-fg", bg: "from-amber-500/15 to-amber-600/5" },
];

/* ── 19 Diferenciadores agrupados por tier ── */

const DIFFERENTIATOR_TIERS = [
  {
    tier: "Tier 1 — Tecnología única",
    items: [
      { icon: Star, title: "Sistema Operativo Completo (OPAI)", desc: "Plataforma propia de gestión operacional con IA integrada. Control total de tu servicio de seguridad." },
      { icon: MapPin, title: "Rondas en Tiempo Real", desc: "Monitoreo GPS con geofencing automático. Si una ronda no se completa, recibes una alerta." },
      { icon: Gauge, title: "Trust Score de Guardias", desc: "Cada guardia tiene un puntaje basado en datos reales: asistencia, rondas, capacitación." },
      { icon: Smartphone, title: "Portal del Cliente en Tiempo Real", desc: "Monitorea tu servicio desde tu celular. KPIs, rondas, bitácora y más — 24/7." },
    ],
  },
  {
    tier: "Tier 2 — Inteligencia y capacitación",
    items: [
      { icon: GraduationCap, title: "Programa de Capacitación Integral (LMS)", desc: "Plataforma de aprendizaje con cursos certificados para cada guardia." },
      { icon: ShieldCheck, title: "Control de Acceso Digital", desc: "Registro de ingresos con QR, lectura de cédula y patentes. Sin papel." },
      { icon: MessageSquare, title: "Chat Directo con el Equipo", desc: "Canal de comunicación directa con tu ejecutivo y equipo operativo." },
      { icon: FileText, title: "Documentación Digital Completa", desc: "Contratos, OS-10, antecedentes — todo digital con trazabilidad completa." },
    ],
  },
  {
    tier: "Tier 3 — IA y automatización",
    items: [
      { icon: Bot, title: "Protocolos con IA", desc: "Generación y verificación automática de protocolos operacionales." },
      { icon: Zap, title: "Centro IA (Inteligencia Predictiva)", desc: "Análisis predictivo de incidentes y recomendaciones automáticas." },
      { icon: BarChart3, title: "Cotizaciones Interactivas", desc: "Propuestas digitales con desglose completo y aceptación en línea." },
      { icon: Fingerprint, title: "Control Anti-Doble Turno", desc: "Verificación biométrica para evitar fraudes en turnos de guardia." },
    ],
  },
  {
    tier: "Tier 4 — Ecosistema completo",
    items: [
      { icon: CheckCircle2, title: "Cumplimiento Normativo Automático", desc: "Ley 21.659 y D.S. 44 verificados automáticamente en cada operación." },
      { icon: Award, title: "Sistema de Exámenes con IA", desc: "Evaluaciones automáticas de conocimiento y competencias." },
      { icon: Globe, title: "Ecosistema Multi-Portal (6 portales)", desc: "Portales para clientes, guardias, supervisores, RRHH, administración y candidatos." },
      { icon: ClipboardList, title: "Encuestas de Satisfacción Integradas", desc: "Feedback directo del servicio con métricas de NPS." },
      { icon: Eye, title: "Reportes de Visita de Supervisor", desc: "Informes detallados de cada visita de supervisión a tus instalaciones." },
      { icon: Ticket, title: "Sistema de Tickets/Incidentes", desc: "Seguimiento completo de incidentes con SLA y trazabilidad." },
      { icon: Radio, title: "PWA Mobile-First", desc: "Aplicación web progresiva que funciona como app nativa en tu celular." },
    ],
  },
];

const RONDAS_FEATURES = [
  { icon: MapPin, label: "Checkpoints GPS verificados", color: "text-status-ok-fg" },
  { icon: Eye, label: "Mapa en tiempo real", color: "text-status-info-fg" },
  { icon: Radio, label: "Alertas instantáneas", color: "text-status-warn-fg" },
  { icon: BarChart3, label: "Métricas de cumplimiento", color: "text-violet-400" },
];

const CERTS = [
  { name: "OS-10", desc: "Autorización vigente" },
  { name: "D.S. 44", desc: "Cumplimiento normativo" },
  { name: "Ley 21.659", desc: "Seguridad privada" },
  { name: "ACHS", desc: "Prevención de riesgos" },
];

const TIER_COLORS = [
  { iconColor: "text-status-info-fg", iconBg: "rgba(45,212,191,0.12)", borderColor: "rgba(45,212,191,0.15)" },
  { iconColor: "text-status-info-fg", iconBg: "rgba(96,165,250,0.12)", borderColor: "rgba(96,165,250,0.15)" },
  { iconColor: "text-violet-400", iconBg: "rgba(139,92,246,0.12)", borderColor: "rgba(139,92,246,0.15)" },
  { iconColor: "text-status-warn-fg", iconBg: "rgba(251,191,36,0.12)", borderColor: "rgba(251,191,36,0.15)" },
];

interface Props {
  onNavigate?: (section: string) => void;
}

export function PortalNosotros({ onNavigate }: Props) {
  const { branding } = useBranding();
  const logoClara = branding.logoWhite || branding.logoFull || "";

  return (
    <div className="space-y-8 pb-24 px-4 py-4">
      {/* ── Hero ── */}
      <FadeIn>
        <div className="text-center py-6">
          <div
            className="w-24 h-24 rounded-3xl mx-auto mb-5 flex items-center justify-center relative overflow-hidden p-4"
            style={{
              background: "linear-gradient(135deg, rgba(45,212,191,0.2), rgba(14,165,233,0.1), rgba(139,92,246,0.08))",
              border: "1px solid rgba(45,212,191,0.2)",
              boxShadow: "0 0 60px rgba(45,212,191,0.15), inset 0 0 30px rgba(45,212,191,0.05)",
            }}
          >
            <img src={logoClara} alt={branding.companyName} className="w-full h-full object-contain relative z-10" />
          </div>
          <h1
            className="text-2xl font-bold mb-2"
            style={{
              background: "linear-gradient(135deg, #ffffff, #2dd4bf)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
            }}
          >
            {branding.companyName}
          </h1>
          <p className="text-zinc-400 text-sm mb-2">El único sistema operativo completo de seguridad en Chile</p>
          <OpaiBadge text="19 capacidades integradas" />
        </div>
      </FadeIn>

      {/* ── Stats ── */}
      <div>
        <FadeIn>
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3 px-1">En números</h2>
        </FadeIn>
        <div className="grid grid-cols-2 gap-3">
          {STATS.map(({ value, label, color, bg }, i) => (
            <FadeIn key={label} delay={i * 80}>
              <div
                className={`rounded-xl p-4 bg-gradient-to-br ${bg} border border-white/[0.06]`}
                style={{ backdropFilter: "blur(8px)" }}
              >
                <div className={`text-2xl font-bold ${color} mb-1`}>
                  <AnimatedNumber target={value} />
                </div>
                <div className="text-xs text-zinc-400">{label}</div>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>

      {/* ── 19 Diferenciadores por Tier ── */}
      {DIFFERENTIATOR_TIERS.map((tier, tIdx) => {
        const colors = TIER_COLORS[tIdx % TIER_COLORS.length];
        return (
          <div key={tier.tier}>
            <FadeIn>
              <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3 px-1">{tier.tier}</h2>
            </FadeIn>
            <div className="space-y-3">
              {tier.items.map(({ icon: Icon, title, desc }, i) => (
                <FadeIn key={title} delay={i * 80}>
                  <div
                    className="rounded-xl p-4 flex gap-4 transition-all hover:scale-[1.01]"
                    style={{
                      background: "linear-gradient(145deg, rgba(30,41,59,0.8), rgba(26,35,50,0.8))",
                      border: `1px solid ${colors.borderColor}`,
                    }}
                  >
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: colors.iconBg }}
                    >
                      <Icon className={`w-5 h-5 ${colors.iconColor}`} />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-white mb-1">{title}</h3>
                      <p className="text-xs text-zinc-400 leading-relaxed">{desc}</p>
                    </div>
                  </div>
                </FadeIn>
              ))}
            </div>
          </div>
        );
      })}

      {/* ── Rondas en vivo ── */}
      <FadeIn>
        <div
          className="rounded-2xl p-5 relative overflow-hidden"
          style={{
            background: "linear-gradient(145deg, rgba(16,185,129,0.08), rgba(6,78,59,0.12))",
            border: "1px solid rgba(16,185,129,0.2)",
          }}
        >
          <div className="flex items-center gap-2 mb-4">
            <LivePulse />
            <h2 className="text-sm font-semibold text-status-ok-fg">Monitoreo de rondas en vivo</h2>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed mb-4">
            Cada ronda queda registrada con evidencia verificable. Siga en tiempo real los recorridos de cada guardia,
            con checkpoints GPS, fotos y notificaciones instantáneas.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {RONDAS_FEATURES.map(({ icon: Icon, label, color }) => (
              <div key={label} className="flex items-center gap-2 rounded-lg bg-white/[0.04] px-3 py-2">
                <Icon className={`w-3.5 h-3.5 ${color} shrink-0`} />
                <span className="text-[11px] text-zinc-300">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </FadeIn>

      {/* ── Certifications ── */}
      <div>
        <FadeIn>
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3 px-1">Certificaciones</h2>
        </FadeIn>
        <div className="grid grid-cols-2 gap-3">
          {CERTS.map(({ name, desc }, i) => (
            <FadeIn key={name} delay={i * 60}>
              <div
                className="rounded-xl p-3 border border-white/[0.06] flex items-start gap-2.5"
                style={{ background: "linear-gradient(145deg, rgba(30,41,59,0.6), rgba(26,35,50,0.6))" }}
              >
                <CheckCircle2 className="w-4 h-4 text-status-info-fg mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-sm text-white font-semibold block">{name}</span>
                  <span className="text-[10px] text-zinc-500">{desc}</span>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>

      {/* ── CTA ── */}
      <FadeIn delay={200}>
        <div className="text-center pt-2 space-y-4">
          <p className="text-xs text-zinc-500">¿Tienes preguntas sobre nuestros servicios?</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            {onNavigate && (
              <button
                onClick={() => onNavigate("chat")}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-[0.98]"
                style={{
                  background: "linear-gradient(135deg, rgba(45,212,191,0.15), rgba(45,212,191,0.05))",
                  border: "1px solid rgba(45,212,191,0.25)",
                  color: "#2dd4bf",
                }}
              >
                <Users className="w-4 h-4" />
                Hablar con tu ejecutivo
              </button>
            )}
            <WhatsAppButton variant="compact" />
          </div>
        </div>
      </FadeIn>

      {/* ── Footer ── */}
      <FadeIn>
        <div className="text-center pt-4 pb-4 space-y-1">
          <p className="text-xs text-zinc-500">
            Plataforma{" "}
            <span className="font-medium text-zinc-400">OPAI</span>
            {" · Desarrollado por "}
            <a
              href="https://lx3.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-zinc-300 transition-colors text-zinc-400"
            >
              LX3.ai
            </a>
          </p>
        </div>
      </FadeIn>
    </div>
  );
}
