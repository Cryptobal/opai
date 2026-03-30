"use client";

import { useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface AlertaData {
  id: string;
  estado: string;
  fechaInicio: string;
  fechaFin: string;
  montoOfrecido: number;
  funciones: string;
  urgencia: string | null;
  modalidad: string;
  instalacion: {
    name: string;
    address: string | null;
    commune: string | null;
    city: string | null;
  };
}

interface Props {
  alerta: AlertaData;
  token: string;
  yaAceptada: boolean;
  esMiAceptacion: boolean;
  expirada: boolean;
}

export function AlertaExternaClient({
  alerta,
  token,
  yaAceptada,
  esMiAceptacion,
  expirada,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<"exito" | "tarde" | "error" | null>(null);

  const montoFormateado = new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(alerta.montoOfrecido);

  const inicio = new Date(alerta.fechaInicio);
  const fin = new Date(alerta.fechaFin);
  const dia = format(inicio, "EEEE d 'de' MMMM", { locale: es });
  const horaInicio = format(inicio, "HH:mm");
  const horaFin = format(fin, "HH:mm");

  const handleAceptar = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ops/alertas-cobertura/${alerta.id}/aceptar`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Alerta-Token": token,
        },
      });
      const json = await res.json();
      if (json.success) {
        setResultado("exito");
      } else if (res.status === 409) {
        setResultado("tarde");
      } else {
        setResultado("error");
      }
    } catch {
      setResultado("error");
    } finally {
      setLoading(false);
    }
  };

  // Success state
  if (resultado === "exito" || (yaAceptada && esMiAceptacion)) {
    return (
      <Layout>
        <div className="text-center space-y-4">
          <div className="text-5xl">✅</div>
          <h1 className="text-2xl font-bold text-emerald-400">¡Turno Aceptado!</h1>
          <p className="text-zinc-300">
            El supervisor ha sido notificado. Te contactará para confirmar los detalles.
          </p>
          <InfoCard alerta={alerta} dia={dia} horaInicio={horaInicio} horaFin={horaFin} monto={montoFormateado} />
        </div>
      </Layout>
    );
  }

  // Already taken by another guard
  if (resultado === "tarde" || (yaAceptada && !esMiAceptacion)) {
    return (
      <Layout>
        <div className="text-center space-y-4">
          <div className="text-5xl">🤝</div>
          <h1 className="text-xl font-bold text-amber-400">Este puesto ya fue aceptado</h1>
          <p className="text-zinc-300">
            Otro guardia se adelantó. ¡Gracias por tu amable disposición!
          </p>
        </div>
      </Layout>
    );
  }

  // Expired/cancelled
  if (expirada) {
    return (
      <Layout>
        <div className="text-center space-y-4">
          <div className="text-5xl">⏰</div>
          <h1 className="text-xl font-bold text-zinc-400">Alerta Expirada</h1>
          <p className="text-zinc-400">
            Esta alerta de cobertura ya no está disponible.
          </p>
        </div>
      </Layout>
    );
  }

  // Error
  if (resultado === "error") {
    return (
      <Layout>
        <div className="text-center space-y-4">
          <div className="text-5xl">❌</div>
          <h1 className="text-xl font-bold text-red-400">Error al procesar</h1>
          <p className="text-zinc-300">
            Hubo un error al aceptar el turno. Intenta nuevamente.
          </p>
          <button
            onClick={() => setResultado(null)}
            className="px-6 py-2 rounded-lg bg-zinc-800 text-zinc-200 text-sm hover:bg-zinc-700 transition"
          >
            Reintentar
          </button>
        </div>
      </Layout>
    );
  }

  // Default: show alert details with accept button
  return (
    <Layout>
      <div className="space-y-6">
        {alerta.urgencia === "URGENTE" && (
          <div className="text-center">
            <span className="inline-block px-3 py-1 rounded-full bg-red-500/20 text-red-400 text-xs font-semibold animate-pulse border border-red-500/30">
              🚨 URGENTE
            </span>
          </div>
        )}

        <div className="text-center space-y-1">
          <h1 className="text-xl font-bold text-zinc-100">Turno Extra Disponible</h1>
          <p className="text-sm text-zinc-400">{alerta.modalidad}</p>
        </div>

        <InfoCard alerta={alerta} dia={dia} horaInicio={horaInicio} horaFin={horaFin} monto={montoFormateado} />

        <div className="rounded-xl bg-zinc-800/60 p-4 space-y-2">
          <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Funciones</h3>
          <p className="text-sm text-zinc-200 whitespace-pre-wrap">{alerta.funciones}</p>
        </div>

        <button
          onClick={handleAceptar}
          disabled={loading}
          className="w-full py-4 rounded-xl bg-emerald-600 text-white font-semibold text-lg hover:bg-emerald-500 active:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Procesando...
            </span>
          ) : (
            "ACEPTAR TURNO"
          )}
        </button>

        <p className="text-center text-xs text-zinc-500">
          Al aceptar, te comprometes a presentarte en el horario indicado.
        </p>
      </div>
    </Layout>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full">{children}</div>
    </div>
  );
}

function InfoCard({
  alerta,
  dia,
  horaInicio,
  horaFin,
  monto,
}: {
  alerta: { instalacion: { name: string; address: string | null; commune: string | null } };
  dia: string;
  horaInicio: string;
  horaFin: string;
  monto: string;
}) {
  return (
    <div className="rounded-xl bg-zinc-800/60 border border-zinc-700/50 p-5 space-y-4">
      <div className="space-y-1">
        <p className="text-xs text-zinc-500 uppercase tracking-wider">Instalación</p>
        <p className="text-lg font-semibold text-zinc-100">{alerta.instalacion.name}</p>
        {alerta.instalacion.address && (
          <p className="text-sm text-zinc-400">
            {alerta.instalacion.address}
            {alerta.instalacion.commune ? `, ${alerta.instalacion.commune}` : ""}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wider">Fecha</p>
          <p className="text-sm font-medium text-zinc-200 capitalize">{dia}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wider">Horario</p>
          <p className="text-sm font-medium text-zinc-200">{horaInicio} — {horaFin}</p>
        </div>
      </div>

      <div>
        <p className="text-xs text-zinc-500 uppercase tracking-wider">Pago</p>
        <p className="text-2xl font-bold text-emerald-400">{monto}</p>
      </div>
    </div>
  );
}
