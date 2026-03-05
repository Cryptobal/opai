"use client";

import { Shield, Award, Smartphone, Clock, CheckCircle2, Star } from "lucide-react";

export function PortalNosotros() {
  return (
    <div className="space-y-6 pb-24">
      {/* Hero */}
      <div className="text-center py-8">
        <div className="w-20 h-20 rounded-2xl mx-auto mb-4 flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, rgba(45,212,191,0.2), rgba(45,212,191,0.05))" }}>
          <Shield className="w-10 h-10 text-teal-400" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Gard Security</h1>
        <p className="text-zinc-400 text-sm">Protegemos lo que importa</p>
      </div>

      {/* Key figures */}
      <div>
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3 px-1">En números</h2>
        <div className="grid grid-cols-2 gap-3">
          {[
            { value: "15+", label: "Años de experiencia" },
            { value: "200+", label: "Clientes activos" },
            { value: "1,500+", label: "Guardias certificados" },
            { value: "96%", label: "Tasa de retención" },
          ].map(({ value, label }) => (
            <div key={label} className="rounded-xl p-4 border"
              style={{ background: "linear-gradient(145deg, #1E293B, #1A2332)", borderColor: "rgba(255,255,255,0.06)" }}>
              <div className="text-2xl font-bold text-teal-400 mb-1">{value}</div>
              <div className="text-xs text-zinc-400">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Differentiators */}
      <div>
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3 px-1">¿Por qué Gard?</h2>
        <div className="space-y-3">
          {[
            { icon: Star, title: "Tecnología propia (OPAI)", desc: "Sistema de gestión operacional con IA integrada. Control total de tu servicio de seguridad." },
            { icon: Award, title: "Gamificación de guardias", desc: "Motivamos a nuestros guardias con ranking, premios y evaluación continua de desempeño." },
            { icon: Smartphone, title: "Portal del Cliente", desc: "Monitorea tu servicio en tiempo real desde tu celular. KPIs, rondas, bitácora y más." },
            { icon: Clock, title: "Respuesta inmediata", desc: "Equipo de supervisión 24/7 con respuesta en menos de 30 minutos ante cualquier incidente." },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-xl p-4 border flex gap-4"
              style={{ background: "linear-gradient(145deg, #1E293B, #1A2332)", borderColor: "rgba(255,255,255,0.06)" }}>
              <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(45,212,191,0.1)" }}>
                <Icon className="w-5 h-5 text-teal-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white mb-1">{title}</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Certifications */}
      <div>
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3 px-1">Certificaciones</h2>
        <div className="grid grid-cols-2 gap-3">
          {["OS-10", "D.S. 44", "ISO 45001", "ACHS"].map(cert => (
            <div key={cert} className="rounded-xl p-3 border flex items-center gap-2"
              style={{ background: "linear-gradient(145deg, #1E293B, #1A2332)", borderColor: "rgba(255,255,255,0.06)" }}>
              <CheckCircle2 className="w-4 h-4 text-teal-400 flex-shrink-0" />
              <span className="text-sm text-white font-medium">{cert}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
