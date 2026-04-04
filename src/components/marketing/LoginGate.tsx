"use client";

import { useState } from "react";

export default function LoginGate() {
  const [slug, setSlug] = useState("");

  const handleGoToTenant = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (clean) {
      window.location.href = `https://${clean}.opai.cl/opai/login`;
    }
  };

  return (
    <section id="login" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">
            ¿Cómo quieres ingresar?
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Tenant login */}
          <div className="rounded-2xl border border-white/[0.07] bg-[#141E30]/30 p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#00D4AA]/10 flex items-center justify-center text-xl">
                🏢
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Ingresar a mi empresa</h3>
                <p className="text-xs text-[#94A3B8]">Accede al panel de tu empresa</p>
              </div>
            </div>

            <form onSubmit={handleGoToTenant} className="space-y-4">
              <div>
                <label className="text-xs text-[#94A3B8] mb-1.5 block">
                  Subdominio de tu empresa
                </label>
                <div className="flex rounded-lg border border-white/[0.07] bg-[#0B1120]/50 overflow-hidden focus-within:border-[#00D4AA]/30">
                  <input
                    type="text"
                    placeholder="tu-empresa"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    className="flex-1 px-4 py-3 bg-transparent text-white placeholder-[#94A3B8]/50 text-sm outline-none"
                  />
                  <span className="flex items-center px-3 text-sm text-[#94A3B8] border-l border-white/[0.07] bg-[#0B1120]/80">
                    .opai.cl
                  </span>
                </div>
              </div>
              <button
                type="submit"
                className="w-full py-3 bg-[#00D4AA] hover:bg-[#00B894] text-[#0B1120] font-semibold rounded-lg transition-colors text-sm"
              >
                Ingresar
              </button>
              <p className="text-xs text-[#94A3B8] text-center">
                Ej: gard.opai.cl, prosegur.opai.cl
              </p>
            </form>
          </div>

          {/* Platform admin */}
          <div className="rounded-2xl border border-white/[0.07] bg-[#141E30]/30 p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-xl">
                ⚙️
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Panel de plataforma</h3>
                <p className="text-xs text-[#94A3B8]">
                  Administradores OPAI
                </p>
              </div>
            </div>

            <p className="text-sm text-[#94A3B8] leading-relaxed mb-6">
              Acceso exclusivo para administradores de la plataforma OPAI.
              Gestión de tenants, billing, métricas globales y soporte.
            </p>

            <a
              href="/platform/login"
              className="block w-full py-3 text-center border border-white/10 hover:border-white/20 text-white font-semibold rounded-lg transition-colors text-sm hover:bg-white/5"
            >
              Acceso plataforma
            </a>
            <p className="text-xs text-[#94A3B8] text-center mt-3">
              Superadmin · Soporte · Operaciones OPAI
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
