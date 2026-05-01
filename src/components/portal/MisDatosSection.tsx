"use client";

import React, { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Shield, Download, FileEdit, Trash2, Loader2, Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/opai/LoadingState";
import type { GuardSession } from "@/lib/guard-portal";

interface DatosPersonales {
  nombre: string;
  rut: string | null;
  fechaNacimiento: string | null;
  sexo: string | null;
  nacionalidad: string | null;
  email: string | null;
  emailPersonal: string | null;
  telefono: string | null;
  telefonoMovil: string | null;
  direccion: string | null;
  comuna: string | null;
  ciudad: string | null;
  region: string | null;
  codigoGuardia: string | null;
  estado: string | null;
  estadoCicloVida: string | null;
  fechaContratacion: string | null;
  tipoContrato: string | null;
  instalacionActual: string | null;
  afp: string | null;
  sistemaSalud: string | null;
  isapre: string | null;
  faceIdRegistrado: boolean;
  faceIdConsentimiento: string | null;
  faceIdConsentimientoRevocado: boolean;
  tallaCamisa: string | null;
  tallaPantalon: string | null;
  tallaPolera: string | null;
  tallaZapato: string | null;
  fechaCreacion: string | null;
  ultimaActualizacion: string | null;
}

interface InfoTratamiento {
  responsable: string;
  encargado: string;
  finalidad: string;
  baseLegal: string;
  plazoConservacion: string;
  contactoDerechos: string;
}

type SolicitudTipo = "rectificacion" | "supresion";

interface Props {
  session: GuardSession;
}

const fmt = (v: string | null | undefined) => v ?? "—";
const fmtDate = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString("es-CL") : "—";
const fmtBool = (v: boolean) => (v ? "Sí" : "No");

interface Field {
  label: string;
  value: string;
}

function DataCard({ title, fields }: { title: string; fields: Field[] }) {
  return (
    <Card>
      <CardContent className="p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">{title}</h3>
        <dl className="space-y-2">
          {fields.map((f) => (
            <div key={f.label} className="flex justify-between text-sm gap-4">
              <dt className="text-muted-foreground">{f.label}</dt>
              <dd className="text-foreground text-right break-words">{f.value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

export function MisDatosSection({ session }: Props) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DatosPersonales | null>(null);
  const [info, setInfo] = useState<InfoTratamiento | null>(null);
  const [exporting, setExporting] = useState(false);
  const [openSolicitud, setOpenSolicitud] = useState<SolicitudTipo | null>(null);
  const [campo, setCampo] = useState("");
  const [valorCorrecto, setValorCorrecto] = useState("");
  const [motivo, setMotivo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/portal/guardia/mis-datos?guardiaId=${session.guardiaId}`
      );
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Error");
      setData(json.data);
      setInfo(json.infoTratamiento);
    } catch (e) {
      toast.error("No se pudieron cargar tus datos");
    } finally {
      setLoading(false);
    }
  }, [session.guardiaId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch(
        `/api/portal/guardia/mis-datos/exportar?guardiaId=${session.guardiaId}`
      );
      if (!res.ok) throw new Error("Error");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mis-datos-opai-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Descarga iniciada");
    } catch {
      toast.error("Error al exportar");
    } finally {
      setExporting(false);
    }
  };

  const handleSubmitSolicitud = async () => {
    if (!openSolicitud) return;
    if (!motivo.trim()) {
      toast.error("Debes indicar un motivo");
      return;
    }
    if (openSolicitud === "rectificacion" && (!campo.trim() || !valorCorrecto.trim())) {
      toast.error("Indica el campo y el valor correcto");
      return;
    }
    setSubmitting(true);
    try {
      const detalle =
        openSolicitud === "rectificacion"
          ? `Rectificar campo "${campo}" → "${valorCorrecto}". Motivo: ${motivo}`
          : `Solicitud de eliminación. Motivo: ${motivo}`;

      const res = await fetch(`/api/portal/guardia/mis-datos/solicitud`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guardiaId: session.guardiaId,
          tipo: openSolicitud,
          detalle,
          campos: openSolicitud === "rectificacion" ? [campo] : [],
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success(json.data.mensaje);
      setOpenSolicitud(null);
      setCampo("");
      setValorCorrecto("");
      setMotivo("");
    } catch (e) {
      toast.error("No se pudo enviar la solicitud");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingState />;
  if (!data) return null;

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <Shield className="h-5 w-5 text-status-info-fg" />
        <h2 className="text-lg font-semibold">Mis Datos Personales</h2>
      </div>

      <p className="text-sm text-muted-foreground">
        Bajo la Ley 21.719 de Protección de Datos Personales, tienes derecho a acceder,
        rectificar, eliminar y portar tus datos.
      </p>

      <DataCard
        title="Identificación"
        fields={[
          { label: "Nombre", value: data.nombre },
          { label: "RUT", value: fmt(data.rut) },
          { label: "Fecha de nacimiento", value: fmtDate(data.fechaNacimiento) },
          { label: "Sexo", value: fmt(data.sexo) },
          { label: "Nacionalidad", value: fmt(data.nacionalidad) },
        ]}
      />

      <DataCard
        title="Contacto"
        fields={[
          { label: "Email", value: fmt(data.email) },
          { label: "Email personal", value: fmt(data.emailPersonal) },
          { label: "Teléfono", value: fmt(data.telefono) },
          { label: "Teléfono móvil", value: fmt(data.telefonoMovil) },
        ]}
      />

      <DataCard
        title="Dirección"
        fields={[
          { label: "Dirección", value: fmt(data.direccion) },
          { label: "Comuna", value: fmt(data.comuna) },
          { label: "Ciudad", value: fmt(data.ciudad) },
          { label: "Región", value: fmt(data.region) },
        ]}
      />

      <DataCard
        title="Datos Laborales"
        fields={[
          { label: "Código guardia", value: fmt(data.codigoGuardia) },
          { label: "Estado", value: fmt(data.estado) },
          { label: "Ciclo de vida", value: fmt(data.estadoCicloVida) },
          { label: "Fecha contratación", value: fmtDate(data.fechaContratacion) },
          { label: "Tipo de contrato", value: fmt(data.tipoContrato) },
          { label: "Instalación actual", value: fmt(data.instalacionActual) },
        ]}
      />

      <DataCard
        title="Datos Previsionales"
        fields={[
          { label: "AFP", value: fmt(data.afp) },
          { label: "Sistema de salud", value: fmt(data.sistemaSalud) },
          { label: "Isapre", value: fmt(data.isapre) },
        ]}
      />

      <DataCard
        title="Datos Biométricos (Face ID)"
        fields={[
          { label: "Registrado", value: fmtBool(data.faceIdRegistrado) },
          { label: "Consentimiento otorgado", value: fmtDate(data.faceIdConsentimiento) },
          { label: "Consentimiento revocado", value: fmtBool(data.faceIdConsentimientoRevocado) },
        ]}
      />

      <DataCard
        title="Equipamiento (Tallas)"
        fields={[
          { label: "Camisa", value: fmt(data.tallaCamisa) },
          { label: "Pantalón", value: fmt(data.tallaPantalon) },
          { label: "Polera", value: fmt(data.tallaPolera) },
          { label: "Zapato", value: fmt(data.tallaZapato) },
        ]}
      />

      {/* Acciones ARCO */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-semibold">Ejerce tus derechos</h3>
          <div className="flex flex-col gap-2">
            <Button onClick={handleExport} disabled={exporting} variant="outline">
              {exporting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Descargar mis datos (JSON)
            </Button>
            <Button onClick={() => setOpenSolicitud("rectificacion")} variant="outline">
              <FileEdit className="h-4 w-4 mr-2" />
              Solicitar rectificación
            </Button>
            <Button
              onClick={() => setOpenSolicitud("supresion")}
              variant="outline"
              className="text-status-danger-fg border-status-danger-border hover:bg-status-danger-soft"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Solicitar eliminación
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Formulario solicitud */}
      {openSolicitud && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="text-sm font-semibold">
              {openSolicitud === "rectificacion"
                ? "Solicitud de rectificación"
                : "Solicitud de eliminación"}
            </h3>
            {openSolicitud === "rectificacion" && (
              <>
                <div>
                  <label className="text-xs text-muted-foreground">Campo a corregir</label>
                  <Input
                    value={campo}
                    onChange={(e) => setCampo(e.target.value)}
                    placeholder="Ej: telefono, direccion"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Valor correcto</label>
                  <Input
                    value={valorCorrecto}
                    onChange={(e) => setValorCorrecto(e.target.value)}
                  />
                </div>
              </>
            )}
            <div>
              <label className="text-xs text-muted-foreground">Motivo</label>
              <Textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Describe brevemente el motivo de tu solicitud"
                rows={3}
              />
            </div>
            {openSolicitud === "supresion" && (
              <p className="text-xs text-status-warn-fg">
                ⚠ La eliminación puede no ser inmediata si existen obligaciones legales
                (ej: contrato laboral vigente). Recibirás respuesta en máximo 30 días.
              </p>
            )}
            <div className="flex gap-2">
              <Button
                onClick={handleSubmitSolicitud}
                disabled={submitting}
                className="flex-1"
              >
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Enviar solicitud
              </Button>
              <Button
                variant="ghost"
                onClick={() => setOpenSolicitud(null)}
                disabled={submitting}
              >
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info de tratamiento */}
      {info && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-status-info-fg" />
              <h3 className="text-sm font-semibold">Información sobre el tratamiento</h3>
            </div>
            <dl className="space-y-2 text-xs">
              <div>
                <dt className="text-muted-foreground">Responsable</dt>
                <dd>{info.responsable}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Encargado</dt>
                <dd>{info.encargado}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Finalidad</dt>
                <dd>{info.finalidad}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Base legal</dt>
                <dd>{info.baseLegal}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Plazo de conservación</dt>
                <dd>{info.plazoConservacion}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Contacto de derechos</dt>
                <dd>
                  <a
                    href={`mailto:${info.contactoDerechos}`}
                    className="text-status-info-fg underline"
                  >
                    {info.contactoDerechos}
                  </a>
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
