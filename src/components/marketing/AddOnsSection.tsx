const ADDONS = [
  {
    icon: "🚪",
    name: "Control de Acceso",
    description:
      "Gestión de acceso físico a instalaciones: whitelist de visitantes, pre-registro, torniquetes, dispositivos IoT. Historial completo de accesos.",
    price: "+0.15 UF/dispositivo/mes",
  },
  {
    icon: "🤖",
    name: "Centro de IA",
    description:
      "Predicción de ausentismo, análisis de patrones de rondas, alertas proactivas de riesgo operacional.",
    price: "+0.8 UF/mes",
  },
  {
    icon: "📊",
    name: "Reportes Avanzados",
    description:
      "Dashboards ejecutivos personalizados, exportación automatizada, reportes programados por cliente.",
    price: "+0.5 UF/mes",
  },
  {
    icon: "🏆",
    name: "Gamificación",
    description:
      "Sistema de badges, desafíos, rankings y beneficios para guardias.",
    price: "+0.1 UF/guardia/mes",
  },
  {
    icon: "🔗",
    name: "Integración API",
    description:
      "Acceso a la API de OPAI para integrar con sistemas propios del cliente.",
    price: "+1.5 UF/mes",
  },
  {
    icon: "📱",
    name: "App White-label",
    description:
      "App del guardia y portal del cliente con branding propio de tu empresa.",
    price: "Cotizar",
  },
  {
    icon: "🌐",
    name: "Dominio Propio",
    description:
      "Portal del cliente en tu dominio: portal.tuempresa.cl",
    price: "+0.3 UF/mes",
  },
];

export default function AddOnsSection() {
  return (
    <section id="addons" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">
            Suma lo que necesitas, cuando lo necesitas
          </h2>
          <p className="text-lg text-[#94A3B8] max-w-2xl mx-auto">
            Add-ons se agregan sobre cualquier plan base. Facturación adicional en UF/mes.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {ADDONS.map((addon) => (
            <div
              key={addon.name}
              className="rounded-xl border border-white/[0.07] bg-[#141E30]/30 p-5 transition-all hover:border-[#00D4AA]/20 hover:bg-[#141E30]/50"
            >
              <div className="flex items-start justify-between mb-3">
                <span className="text-2xl">{addon.icon}</span>
                <span className="text-xs font-mono font-medium text-[#00D4AA] bg-[#00D4AA]/10 px-2 py-1 rounded-md whitespace-nowrap">
                  {addon.price}
                </span>
              </div>
              <h3 className="text-base font-bold text-white mb-1.5">
                {addon.name}
              </h3>
              <p className="text-sm text-[#94A3B8] leading-relaxed">
                {addon.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
