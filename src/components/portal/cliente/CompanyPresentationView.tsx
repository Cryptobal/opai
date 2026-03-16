"use client";

import { useEffect, useRef, useState } from "react";
import {
  Shield,
  Award,
  Smartphone,
  CheckCircle2,
  Radio,
  Camera,
  Monitor,
  Zap,
  MapPin,
  MessageSquare,
  FileText,
  BarChart3,
  Fingerprint,
  ShieldCheck,
} from "lucide-react";
import {
  defaultCompanyContent,
  type CompanyContent,
} from "@/lib/presentation/company-content";

/* ── Icon resolver ── */
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Shield,
  Radio,
  Camera,
  Monitor,
  Award,
  Smartphone,
  Zap,
  MapPin,
  MessageSquare,
  FileText,
  BarChart3,
  Fingerprint,
  ShieldCheck,
};

/* ── Fade-in on scroll ── */
function FadeIn({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.15 }
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

/* ── Animated counter ── */
function AnimatedNumber({
  target,
  suffix = "",
}: {
  target: string;
  suffix?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [count, setCount] = useState(0);
  const numericTarget = parseInt(target.replace(/[^0-9]/g, ""), 10) || 0;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.3 }
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

  return (
    <span ref={ref}>
      {display}
      {suffix}
    </span>
  );
}

interface CompanyPresentationViewProps {
  content?: CompanyContent;
  onNavigate?: (section: string) => void;
  ejecutivoName?: string;
}

export function CompanyPresentationView({
  content = defaultCompanyContent,
  onNavigate,
  ejecutivoName,
}: CompanyPresentationViewProps) {
  // Track view on mount
  useEffect(() => {
    fetch("/api/portal/cliente/presentation", { method: "POST" }).catch(
      () => {}
    );
  }, []);

  return (
    <div className="flex-1 max-w-4xl mx-auto w-full px-4 py-6 pb-24 space-y-10">
      {/* ── Hero ── */}
      <FadeIn>
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/20">
            <Shield className="h-4 w-4 text-teal-400" />
            <span className="text-xs font-medium text-teal-400 uppercase tracking-wider">
              {content.companyIntro.subtitle}
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-zinc-100">
            {content.companyIntro.title}
          </h1>
          <p className="text-zinc-400 text-base sm:text-lg max-w-2xl mx-auto leading-relaxed">
            {content.companyIntro.description}
          </p>
        </div>
      </FadeIn>

      {/* ── Stats ── */}
      <FadeIn delay={100}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {content.companyIntro.stats.map((stat, i) => (
            <div
              key={i}
              className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-center"
            >
              <p className="text-2xl sm:text-3xl font-bold text-teal-400">
                <AnimatedNumber target={stat.value} />
              </p>
              <p className="text-xs text-zinc-500 mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      </FadeIn>

      {/* ── Services ── */}
      <FadeIn delay={200}>
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-zinc-100 text-center">
            Nuestros Servicios
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {content.services.map((service, i) => {
              const Icon = ICON_MAP[service.icon] || Shield;
              return (
                <div
                  key={i}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-3 hover:border-teal-500/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-teal-500/10 flex items-center justify-center">
                      <Icon className="h-5 w-5 text-teal-400" />
                    </div>
                    <h3 className="text-sm font-semibold text-zinc-200">
                      {service.name}
                    </h3>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    {service.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </FadeIn>

      {/* ── Certifications ── */}
      <FadeIn delay={300}>
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-zinc-100 text-center">
            Certificaciones
          </h2>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-3">
            {content.certifications.map((cert, i) => (
              <div key={i} className="flex items-start gap-3">
                <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 flex-shrink-0" />
                <span className="text-sm text-zinc-300">{cert}</span>
              </div>
            ))}
          </div>
        </div>
      </FadeIn>

      {/* ── Differentiators ── */}
      <FadeIn delay={400}>
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-zinc-100 text-center">
            ¿Por qué elegirnos?
          </h2>
          <div className="space-y-3">
            {content.differentiators.map((diff, i) => (
              <div
                key={i}
                className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 flex items-start gap-4 hover:border-teal-500/30 transition-colors"
              >
                <div className="h-10 w-10 rounded-lg bg-teal-500/10 flex items-center justify-center flex-shrink-0">
                  <Award className="h-5 w-5 text-teal-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-200 mb-1">
                    {diff.title}
                  </h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    {diff.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </FadeIn>

      {/* ── Technology ── */}
      <FadeIn delay={500}>
        <div className="rounded-xl border border-teal-500/20 bg-gradient-to-br from-teal-500/5 to-transparent p-6 space-y-4">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/10">
              <Smartphone className="h-4 w-4 text-teal-400" />
              <span className="text-xs font-medium text-teal-400 uppercase tracking-wider">
                Tecnología
              </span>
            </div>
            <h2 className="text-xl font-semibold text-zinc-100">
              {content.technology.title}
            </h2>
            <p className="text-sm text-zinc-400 max-w-xl mx-auto">
              {content.technology.description}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {content.technology.features.map((feature, i) => (
              <div key={i} className="flex items-center gap-2 p-2">
                <Zap className="h-3.5 w-3.5 text-teal-400 flex-shrink-0" />
                <span className="text-sm text-zinc-300">{feature}</span>
              </div>
            ))}
          </div>
        </div>
      </FadeIn>

      {/* ── Regulations ── */}
      <FadeIn delay={600}>
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-zinc-100 text-center">
            {content.regulations.title}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {content.regulations.items.map((reg, i) => (
              <div
                key={i}
                className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-center space-y-2"
              >
                <div className="inline-flex items-center px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20">
                  <span className="text-xs font-semibold text-blue-400">
                    {reg.name}
                  </span>
                </div>
                <p className="text-xs text-zinc-400">{reg.description}</p>
              </div>
            ))}
          </div>
        </div>
      </FadeIn>

      {/* ── Contact CTA ── */}
      <FadeIn delay={700}>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 text-center space-y-4">
          <h2 className="text-lg font-semibold text-zinc-100">
            ¿Le interesa conocer más?
          </h2>
          <p className="text-sm text-zinc-400">
            {ejecutivoName
              ? `${ejecutivoName} está disponible para resolver todas sus consultas.`
              : "Nuestro equipo está disponible para resolver todas sus consultas."}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {onNavigate && (
              <button
                onClick={() => onNavigate("chat")}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-400 text-sm font-medium hover:bg-teal-500/20 transition-colors"
              >
                <MessageSquare className="h-4 w-4" />
                Chat directo
              </button>
            )}
            {onNavigate && (
              <button
                onClick={() => onNavigate("propuesta")}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm font-medium hover:bg-zinc-700 transition-colors"
              >
                <FileText className="h-4 w-4" />
                Ver propuesta
              </button>
            )}
          </div>
        </div>
      </FadeIn>
    </div>
  );
}
