import Link from "next/link";
import { FileBarChart } from "lucide-react";

const REPORTS = [
  { href: "/reportes/dt/asistencia-diaria", label: "Asistencia Diaria", desc: "Listado de asistencia para el período seleccionado (Res. N°38 Art. 4)" },
  { href: "/reportes/dt/jornada-diaria", label: "Jornada Diaria", desc: "Horas normales y extras por trabajador (Res. N°38 Art. 6)" },
  { href: "/reportes/dt/domingos-festivos", label: "Domingos y Festivos", desc: "Días domingo y festivos trabajados (Art. 38 CT)" },
  { href: "/reportes/dt/modificaciones-turnos", label: "Modificaciones de Turnos", desc: "Registro de todas las marcaciones modificadas" },
];

export default function ReportesDtPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reportes DT</h1>
        <p className="text-sm text-muted-foreground">Reportes obligatorios Dirección del Trabajo — Res. Exenta N°38.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {REPORTS.map((r) => (
          <Link key={r.href} href={r.href}
            className="flex items-start gap-4 p-5 rounded-xl border border-border bg-card hover:bg-accent/30 transition-colors">
            <FileBarChart className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-sm">{r.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{r.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
