const PORTALS = [
  {
    title: "Portal del Cliente",
    subtitle: "Visibilidad 24/7 para tu cliente",
    description:
      "Tu cliente ve en tiempo real qué guardias están en su instalación, qué rondas se realizaron, qué incidentes ocurrieron. Sin llamarte. Sin esperar el informe de fin de mes.",
    features: [
      "Marcaciones con foto y GPS",
      "Estado de rondas en vivo",
      "Documentos e informes",
      "Comunicación directa",
    ],
    icon: "🖥️",
    color: "#3B82F6",
  },
  {
    title: "Portal del Guardia",
    subtitle: "iOS + Android",
    description:
      "El guardia llega, marca con su celular, ejecuta rondas escaneando QR, reporta incidentes con foto, ve su liquidación, recibe documentos. Sin papeles.",
    features: [
      "Check-in/out GPS",
      "Rondas con QR",
      "Liquidaciones y anticipos",
      "Chat y protocolos",
    ],
    icon: "📱",
    color: "#00D4AA",
  },
  {
    title: "Portal del Supervisor",
    subtitle: "App de campo",
    description:
      "El supervisor de campo lleva todo en el celular: sus instalaciones asignadas, evaluación de guardias, registro de visitas técnicas con foto, hallazgos y novedades.",
    features: [
      "Visitas técnicas digitales",
      "Evaluación de guardias",
      "Gestión de su equipo",
      "Novedades en tiempo real",
    ],
    icon: "👔",
    color: "#A855F7",
  },
  {
    title: "Portal de Marcación",
    subtitle: "Terminal kiosko",
    description:
      "Terminal de marcación para instalaciones. iPad o tablet en recepción. El personal registra entradas y salidas con PIN o QR.",
    features: [
      "Marcación por PIN o QR",
      "Compatible con iPad/tablet",
      "Sin app, sin instalación",
      "Historial completo",
    ],
    icon: "📍",
    color: "#F59E0B",
  },
];

export default function PortalsSection() {
  return (
    <section id="portales" className="relative py-24 sm:py-32">
      {/* Background accent */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0B1120] via-[#06080F] to-[#0B1120]" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">
            Portal del Cliente, Portal del Guardia, Portal del Supervisor
          </h2>
          <p className="text-lg text-[#94A3B8] max-w-2xl mx-auto">
            Cada rol tiene su app optimizada. Nada sobra, nada falta.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {PORTALS.map((portal) => (
            <div
              key={portal.title}
              className="group rounded-2xl border border-white/[0.07] bg-[#141E30]/30 p-6 sm:p-8 transition-all hover:border-white/10"
            >
              {/* Header */}
              <div className="flex items-start gap-4 mb-4">
                <div
                  className="flex items-center justify-center w-12 h-12 rounded-xl text-2xl"
                  style={{ backgroundColor: `${portal.color}10` }}
                >
                  {portal.icon}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">{portal.title}</h3>
                  <span className="text-xs font-medium" style={{ color: portal.color }}>
                    {portal.subtitle}
                  </span>
                </div>
              </div>

              {/* Description */}
              <p className="text-sm text-[#94A3B8] leading-relaxed mb-5">
                {portal.description}
              </p>

              {/* Features */}
              <div className="grid grid-cols-2 gap-2">
                {portal.features.map((feat) => (
                  <div
                    key={feat}
                    className="flex items-center gap-2 text-sm text-[#E2E8F0]"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 14 14"
                      fill="none"
                      style={{ color: portal.color }}
                    >
                      <path
                        d="M3.5 7l2.333 2.333L10.5 4.667"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    {feat}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
