import { prisma } from "@/lib/prisma";
import { verificarTokenExterno } from "@/lib/alertas-cobertura/token.service";
import { redirect } from "next/navigation";
import { AlertaExternaClient } from "./AlertaExternaClient";

interface Props {
  params: Promise<{ alertaId: string }>;
  searchParams: Promise<{ token?: string }>;
}

export default async function AlertaExternaPage({ params, searchParams }: Props) {
  const { alertaId } = await params;
  const { token } = await searchParams;

  if (!token) {
    return <ErrorView message="Enlace inválido — falta token de acceso." />;
  }

  const decoded = await verificarTokenExterno(token);
  if (!decoded || decoded.alertaId !== alertaId) {
    return <ErrorView message="Este enlace ha expirado o no es válido." />;
  }

  const alerta = await prisma.opsAlertaCobertura.findUnique({
    where: { id: alertaId },
    select: {
      id: true,
      estado: true,
      fechaInicio: true,
      fechaFin: true,
      montoOfrecido: true,
      funciones: true,
      urgencia: true,
      modalidad: true,
      aceptadaPorGuardiaId: true,
      expiraAt: true,
      installation: {
        select: { name: true, address: true, commune: true, city: true },
      },
    },
  });

  if (!alerta) {
    return <ErrorView message="Alerta no encontrada." />;
  }

  const yaAceptada = alerta.aceptadaPorGuardiaId != null;
  const expirada = alerta.estado === "EXPIRADA" || alerta.estado === "CANCELADA" || new Date() > alerta.expiraAt;
  const esMiAceptacion = alerta.aceptadaPorGuardiaId === decoded.guardiaId;

  return (
    <AlertaExternaClient
      alerta={{
        id: alerta.id,
        estado: alerta.estado,
        fechaInicio: alerta.fechaInicio.toISOString(),
        fechaFin: alerta.fechaFin.toISOString(),
        montoOfrecido: alerta.montoOfrecido,
        funciones: alerta.funciones,
        urgencia: alerta.urgencia,
        modalidad: alerta.modalidad,
        instalacion: {
          name: alerta.installation.name,
          address: alerta.installation.address,
          commune: alerta.installation.commune,
          city: alerta.installation.city,
        },
      }}
      token={token}
      yaAceptada={yaAceptada}
      esMiAceptacion={esMiAceptacion}
      expirada={expirada}
    />
  );
}

function ErrorView({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="text-4xl">⚠️</div>
        <h1 className="text-xl font-semibold text-zinc-100">{message}</h1>
        <p className="text-sm text-zinc-400">
          Si crees que esto es un error, contacta al supervisor que te envió este enlace.
        </p>
      </div>
    </div>
  );
}
