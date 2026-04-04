const COLUMNS = [
  {
    tag: "Antes",
    title: "Excel y llamadas",
    color: "#EF4444",
    items: [
      "Planillas manuales por instalación",
      "Llamadas para confirmar asistencia",
      "Informes mensuales en Word",
      "Sin visibilidad para el cliente",
      "Cero trazabilidad",
    ],
    icon: (
      <svg width="32" height="32" fill="none" stroke="#EF4444" strokeWidth="1.5" viewBox="0 0 24 24">
        <path d="M9 17H4a2 2 0 01-2-2V5a2 2 0 012-2h16a2 2 0 012 2v10a2 2 0 01-2 2h-5m-4 0v4m-4 0h8" />
      </svg>
    ),
  },
  {
    tag: "Hoy",
    title: "Sistemas aislados",
    color: "#F59E0B",
    items: [
      "ERP genérico que no entiende \"pautas de turno\"",
      "Software de rondas separado del de RRHH",
      "Payroll en una planilla aparte",
      "Cada sistema con su propio login",
      "El gerente de ops exporta e importa Excel entre sistemas",
    ],
    icon: (
      <svg width="32" height="32" fill="none" stroke="#F59E0B" strokeWidth="1.5" viewBox="0 0 24 24">
        <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.49 8.49l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.49-8.49l2.83-2.83" />
      </svg>
    ),
  },
  {
    tag: "Con OPAI",
    title: "Un solo sistema",
    color: "#00D4AA",
    items: [
      "Todo conectado: operación, personal, finanzas, cliente",
      "IA que detecta patrones y alerta antes del problema",
      "Guardia marca desde el celular → supervisor ve en tiempo real",
      "Cliente ve en su portal sin llamarte",
      "Payroll se calcula con las marcaciones reales",
    ],
    icon: (
      <svg width="32" height="32" fill="none" stroke="#00D4AA" strokeWidth="1.5" viewBox="0 0 24 24">
        <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  },
];

export default function ProblemSection() {
  return (
    <section className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">
            No compites solo con el papel
          </h2>
          <p className="text-lg text-[#94A3B8] max-w-2xl mx-auto">
            Compites con sistemas robustos pero aislados, costosos de mantener,
            sin movilidad, sin IA, y sin visibilidad para el cliente.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {COLUMNS.map((col) => (
            <div
              key={col.tag}
              className="relative rounded-2xl border border-white/[0.07] bg-[#141E30]/40 p-6 sm:p-8 transition-all hover:border-white/10"
              style={{
                borderTopColor: col.color,
                borderTopWidth: col.tag === "Con OPAI" ? "2px" : undefined,
              }}
            >
              <div className="flex items-center gap-3 mb-4">
                {col.icon}
                <div>
                  <span
                    className="text-xs font-semibold uppercase tracking-wider"
                    style={{ color: col.color }}
                  >
                    {col.tag}
                  </span>
                  <h3 className="text-lg font-bold text-white">{col.title}</h3>
                </div>
              </div>
              <ul className="space-y-3">
                {col.items.map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <span
                      className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: col.color }}
                    />
                    <span className="text-sm text-[#94A3B8] leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
              {col.tag === "Con OPAI" && (
                <div className="mt-6 p-3 rounded-lg bg-[#00D4AA]/5 border border-[#00D4AA]/10">
                  <p className="text-xs text-[#00D4AA] font-medium">
                    &ldquo;El guardia marca con el celular. Tú ves en tiempo real. Tu
                    cliente también.&rdquo;
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
