export default function CtaSection() {
  return (
    <section className="relative py-24 sm:py-32">
      <div className="absolute inset-0 bg-gradient-to-b from-[#0B1120] via-[#06080F] to-[#0B1120]" />

      <div className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
        {/* Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-[#00D4AA]/5 rounded-full blur-[100px]" />

        <div className="relative">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white mb-6 leading-tight">
            Deja de apagar incendios.{" "}
            <span className="text-[#00D4AA]">Empieza a prevenir.</span>
          </h2>
          <p className="text-lg text-[#94A3B8] max-w-2xl mx-auto mb-10">
            14 días de prueba con Suite completa. Sin contrato. Sin tarjeta de crédito.
          </p>

          <a
            href="#demo"
            className="inline-flex items-center gap-2 px-10 py-4 text-lg font-semibold bg-[#00D4AA] hover:bg-[#00B894] text-[#0B1120] rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            Solicitar demo gratis
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M4 10h12m-5-5 5 5-5 5" />
            </svg>
          </a>

          <p className="text-sm text-[#94A3B8] mt-6">
            Onboarding incluido · Soporte en español · Datos en Chile
          </p>
        </div>
      </div>
    </section>
  );
}
