"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Search,
  Shield,
  FileCheck,
  AlertTriangle,
  Building2,
  Clock,
  Activity,
  Hash,
  ChevronRight,
  Loader2,
} from "lucide-react";

interface Props {
  userRole: string;
  userName: string;
  tenantId: string;
}

interface Guardia {
  id: string;
  rut: string;
  firstName: string;
  lastName: string;
  status: string;
  currentInstallation: string | null;
  hiredAt: string | null;
  terminatedAt: string | null;
}

interface Marcacion {
  id: string;
  tipo: string;
  timestamp: string;
  guardiaRut: string;
  guardiaName: string;
  installationName: string;
  metodoId: string;
  integrityHash: string;
  gpsStatus: string;
}

interface VerifyResult {
  marcacionId: string;
  guardiaName: string;
  timestamp: string;
  storedHash: string;
  expectedHash: string;
  isValid: boolean;
}

interface EmpleadorInfo {
  empresa: {
    rut: string;
    razonSocial: string;
    direccionPrincipal: string;
    representanteLegal: string;
    giroComercial: string;
  } | null;
  sistema: {
    nombre: string;
    version: string;
    tenantName: string;
  };
  jornadaVigente: {
    maxHorasSemanales: number;
    maxHorasDiarias: number;
    leyReferencia: string;
    vigenciaDesde: string;
  } | null;
  incidentesAbiertos: number;
}

type Tab = "buscar" | "marcaciones" | "verificar" | "auditlog" | "empleador" | "incidentes";

export function FiscalizacionDashboard({ userRole, userName }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("buscar");
  const [searchRut, setSearchRut] = useState("");
  const [searchNombre, setSearchNombre] = useState("");
  const [guardias, setGuardias] = useState<Guardia[]>([]);
  const [selectedGuardia, setSelectedGuardia] = useState<Guardia | null>(null);
  const [marcaciones, setMarcaciones] = useState<Marcacion[]>([]);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [verifyId, setVerifyId] = useState("");
  const [empleadorInfo, setEmpleadorInfo] = useState<EmpleadorInfo | null>(null);
  const [auditLogs, setAuditLogs] = useState<unknown[]>([]);
  const [incidents, setIncidents] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(false);

  const searchGuardias = useCallback(async () => {
    if (!searchRut && !searchNombre) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchRut) params.set("rut", searchRut);
      if (searchNombre) params.set("nombre", searchNombre);
      const res = await fetch(`/api/fiscalizacion/guardias?${params}`);
      const data = await res.json();
      setGuardias(data.guardias || []);
    } finally {
      setLoading(false);
    }
  }, [searchRut, searchNombre]);

  const loadMarcaciones = useCallback(async (guardiaRut: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/fiscalizacion/marcaciones?rut=${guardiaRut}&limit=100`);
      const data = await res.json();
      setMarcaciones(data.marcaciones || []);
    } finally {
      setLoading(false);
    }
  }, []);

  const verifyHash = useCallback(async () => {
    if (!verifyId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/fiscalizacion/verify-hash?id=${verifyId}`);
      const data = await res.json();
      setVerifyResult(data);
    } finally {
      setLoading(false);
    }
  }, [verifyId]);

  useEffect(() => {
    if (activeTab === "empleador" && !empleadorInfo) {
      fetch("/api/fiscalizacion/info-empleador")
        .then((r) => r.json())
        .then(setEmpleadorInfo);
    }
    if (activeTab === "auditlog" && auditLogs.length === 0) {
      fetch("/api/fiscalizacion/auditlog?limit=50")
        .then((r) => r.json())
        .then((d) => setAuditLogs(d.logs || []));
    }
    if (activeTab === "incidentes" && incidents.length === 0) {
      fetch("/api/admin/dt/incidents")
        .then((r) => r.json())
        .then((d) => setIncidents(d.incidents || []));
    }
  }, [activeTab, empleadorInfo, auditLogs.length, incidents.length]);

  const tabs: { key: Tab; label: string; icon: typeof Search }[] = [
    { key: "buscar", label: "Buscar Trabajador", icon: Search },
    { key: "marcaciones", label: "Marcaciones", icon: Clock },
    { key: "verificar", label: "Verificar Hash", icon: Hash },
    { key: "auditlog", label: "Auditoría", icon: FileCheck },
    { key: "empleador", label: "Empleador", icon: Building2 },
    { key: "incidentes", label: "Incidentes", icon: AlertTriangle },
  ];

  return (
    <div className="min-h-[100dvh]">
      {/* Header */}
      <div className="border-b bg-red-600/5 px-6 py-4">
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-red-600" />
          <div>
            <h1 className="text-xl font-bold">Dashboard de Fiscalización — Dirección del Trabajo</h1>
            <p className="text-sm text-muted-foreground">
              Inspector: {userName} | Rol: {userRole} | Acceso de solo lectura (Res. N°38)
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b px-6">
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.key
                    ? "border-red-600 text-red-600"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {loading && (
          <div className="flex items-center gap-2 text-muted-foreground mb-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando...
          </div>
        )}

        {/* TAB: Buscar Trabajador */}
        {activeTab === "buscar" && (
          <div className="space-y-6">
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <label className="text-sm font-medium">RUT</label>
                <input
                  type="text"
                  value={searchRut}
                  onChange={(e) => setSearchRut(e.target.value)}
                  placeholder="12.345.678-9"
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm bg-background"
                />
              </div>
              <div className="flex-1">
                <label className="text-sm font-medium">Nombre</label>
                <input
                  type="text"
                  value={searchNombre}
                  onChange={(e) => setSearchNombre(e.target.value)}
                  placeholder="Nombre o apellido"
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm bg-background"
                />
              </div>
              <button
                onClick={searchGuardias}
                className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                <Search className="h-4 w-4" /> Buscar
              </button>
            </div>

            {guardias.length > 0 && (
              <div className="rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/50">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">RUT</th>
                      <th className="text-left px-4 py-2 font-medium">Nombre</th>
                      <th className="text-left px-4 py-2 font-medium">Estado</th>
                      <th className="text-left px-4 py-2 font-medium">Instalación</th>
                      <th className="text-left px-4 py-2 font-medium">Ingreso</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {guardias.map((g) => (
                      <tr key={g.id} className="border-b hover:bg-muted/30">
                        <td className="px-4 py-2 font-mono">{g.rut}</td>
                        <td className="px-4 py-2">{g.firstName} {g.lastName}</td>
                        <td className="px-4 py-2">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            g.status === "active" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                          }`}>
                            {g.status}
                          </span>
                        </td>
                        <td className="px-4 py-2">{g.currentInstallation || "—"}</td>
                        <td className="px-4 py-2">{g.hiredAt ? new Date(g.hiredAt).toLocaleDateString("es-CL") : "—"}</td>
                        <td className="px-4 py-2">
                          <button
                            onClick={() => {
                              setSelectedGuardia(g);
                              if (g.rut) loadMarcaciones(g.rut);
                              setActiveTab("marcaciones");
                            }}
                            className="text-red-600 hover:text-red-700"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB: Marcaciones */}
        {activeTab === "marcaciones" && (
          <div className="space-y-4">
            {selectedGuardia && (
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="font-medium">{selectedGuardia.firstName} {selectedGuardia.lastName}</p>
                <p className="text-sm text-muted-foreground">RUT: {selectedGuardia.rut} | Instalación: {selectedGuardia.currentInstallation || "N/A"}</p>
              </div>
            )}
            {marcaciones.length === 0 ? (
              <p className="text-muted-foreground">No hay marcaciones. Seleccione un trabajador primero.</p>
            ) : (
              <div className="rounded-lg border overflow-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/50">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">Fecha/Hora</th>
                      <th className="text-left px-4 py-2 font-medium">Tipo</th>
                      <th className="text-left px-4 py-2 font-medium">Método</th>
                      <th className="text-left px-4 py-2 font-medium">Instalación</th>
                      <th className="text-left px-4 py-2 font-medium">GPS</th>
                      <th className="text-left px-4 py-2 font-medium">Hash</th>
                    </tr>
                  </thead>
                  <tbody>
                    {marcaciones.map((m) => (
                      <tr key={m.id} className="border-b hover:bg-muted/30">
                        <td className="px-4 py-2 font-mono text-xs">{new Date(m.timestamp).toLocaleString("es-CL")}</td>
                        <td className="px-4 py-2">
                          <span className={`text-xs font-medium ${m.tipo === "entrada" ? "text-green-600" : "text-red-600"}`}>
                            {m.tipo.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-xs">{m.metodoId}</td>
                        <td className="px-4 py-2 text-xs">{m.installationName}</td>
                        <td className="px-4 py-2 text-xs">{m.gpsStatus || "—"}</td>
                        <td className="px-4 py-2">
                          <button
                            onClick={() => {
                              setVerifyId(m.id);
                              setActiveTab("verificar");
                              setTimeout(verifyHash, 100);
                            }}
                            className="text-xs text-blue-600 hover:underline font-mono"
                            title={m.integrityHash}
                          >
                            {m.integrityHash?.slice(0, 12)}...
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB: Verificar Hash */}
        {activeTab === "verificar" && (
          <div className="space-y-6 max-w-2xl">
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <label className="text-sm font-medium">ID de Marcación</label>
                <input
                  type="text"
                  value={verifyId}
                  onChange={(e) => setVerifyId(e.target.value)}
                  placeholder="ID de marcación a verificar"
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm bg-background font-mono"
                />
              </div>
              <button
                onClick={verifyHash}
                className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                <Hash className="h-4 w-4" /> Verificar
              </button>
            </div>

            {verifyResult && (
              <div className={`rounded-lg border p-4 ${verifyResult.isValid ? "border-green-500 bg-green-50 dark:bg-green-950/20" : "border-red-500 bg-red-50 dark:bg-red-950/20"}`}>
                <div className="flex items-center gap-2 mb-3">
                  {verifyResult.isValid ? (
                    <FileCheck className="h-5 w-5 text-green-600" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-red-600" />
                  )}
                  <span className={`font-bold ${verifyResult.isValid ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
                    {verifyResult.isValid ? "INTEGRIDAD VERIFICADA" : "INTEGRIDAD COMPROMETIDA"}
                  </span>
                </div>
                <dl className="space-y-2 text-sm">
                  <div><dt className="font-medium inline">Trabajador:</dt> <dd className="inline">{verifyResult.guardiaName}</dd></div>
                  <div><dt className="font-medium inline">Fecha:</dt> <dd className="inline">{new Date(verifyResult.timestamp).toLocaleString("es-CL")}</dd></div>
                  <div><dt className="font-medium inline">Hash almacenado:</dt> <dd className="inline font-mono text-xs break-all">{verifyResult.storedHash || "N/A"}</dd></div>
                  <div><dt className="font-medium inline">Hash calculado:</dt> <dd className="inline font-mono text-xs break-all">{verifyResult.expectedHash}</dd></div>
                </dl>
              </div>
            )}
          </div>
        )}

        {/* TAB: Auditoría */}
        {activeTab === "auditlog" && (
          <div className="rounded-lg border overflow-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Fecha</th>
                  <th className="text-left px-4 py-2 font-medium">Acción</th>
                  <th className="text-left px-4 py-2 font-medium">Entidad</th>
                  <th className="text-left px-4 py-2 font-medium">Usuario</th>
                  <th className="text-left px-4 py-2 font-medium">Detalles</th>
                </tr>
              </thead>
              <tbody>
                {(auditLogs as Array<{ id: string; createdAt: string; action: string; entity: string; userEmail: string; details: unknown }>).map((log) => (
                  <tr key={log.id} className="border-b hover:bg-muted/30">
                    <td className="px-4 py-2 font-mono text-xs">{new Date(log.createdAt).toLocaleString("es-CL")}</td>
                    <td className="px-4 py-2 text-xs">{log.action}</td>
                    <td className="px-4 py-2 text-xs">{log.entity}</td>
                    <td className="px-4 py-2 text-xs">{log.userEmail}</td>
                    <td className="px-4 py-2 text-xs font-mono max-w-xs truncate">{JSON.stringify(log.details)}</td>
                  </tr>
                ))}
                {auditLogs.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Sin registros de auditoría</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB: Empleador */}
        {activeTab === "empleador" && empleadorInfo && (
          <div className="grid gap-6 md:grid-cols-2 max-w-4xl">
            <div className="rounded-lg border p-4 space-y-3">
              <h3 className="font-semibold flex items-center gap-2"><Building2 className="h-4 w-4" /> Información del Empleador</h3>
              {empleadorInfo.empresa ? (
                <dl className="space-y-2 text-sm">
                  <div><dt className="font-medium">RUT:</dt><dd>{empleadorInfo.empresa.rut}</dd></div>
                  <div><dt className="font-medium">Razón Social:</dt><dd>{empleadorInfo.empresa.razonSocial}</dd></div>
                  <div><dt className="font-medium">Dirección:</dt><dd>{empleadorInfo.empresa.direccionPrincipal}</dd></div>
                  <div><dt className="font-medium">Representante Legal:</dt><dd>{empleadorInfo.empresa.representanteLegal}</dd></div>
                  <div><dt className="font-medium">Giro:</dt><dd>{empleadorInfo.empresa.giroComercial}</dd></div>
                </dl>
              ) : (
                <p className="text-muted-foreground text-sm">No configurado</p>
              )}
            </div>
            <div className="rounded-lg border p-4 space-y-3">
              <h3 className="font-semibold flex items-center gap-2"><Activity className="h-4 w-4" /> Estado del Sistema</h3>
              <dl className="space-y-2 text-sm">
                <div><dt className="font-medium">Software:</dt><dd>{empleadorInfo.sistema.nombre} v{empleadorInfo.sistema.version}</dd></div>
                <div><dt className="font-medium">Empresa:</dt><dd>{empleadorInfo.sistema.tenantName}</dd></div>
                <div><dt className="font-medium">Incidentes abiertos:</dt><dd>{empleadorInfo.incidentesAbiertos}</dd></div>
              </dl>
            </div>
            {empleadorInfo.jornadaVigente && (
              <div className="rounded-lg border p-4 space-y-3 md:col-span-2">
                <h3 className="font-semibold flex items-center gap-2"><Clock className="h-4 w-4" /> Jornada Laboral Vigente</h3>
                <dl className="space-y-2 text-sm">
                  <div><dt className="font-medium">Max horas semanales:</dt><dd>{empleadorInfo.jornadaVigente.maxHorasSemanales}h</dd></div>
                  <div><dt className="font-medium">Max horas diarias:</dt><dd>{empleadorInfo.jornadaVigente.maxHorasDiarias}h</dd></div>
                  <div><dt className="font-medium">Ley:</dt><dd>{empleadorInfo.jornadaVigente.leyReferencia}</dd></div>
                  <div><dt className="font-medium">Vigente desde:</dt><dd>{new Date(empleadorInfo.jornadaVigente.vigenciaDesde).toLocaleDateString("es-CL")}</dd></div>
                </dl>
              </div>
            )}
          </div>
        )}

        {/* TAB: Incidentes */}
        {activeTab === "incidentes" && (
          <div className="rounded-lg border overflow-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Inicio</th>
                  <th className="text-left px-4 py-2 font-medium">Tipo</th>
                  <th className="text-left px-4 py-2 font-medium">Módulo</th>
                  <th className="text-left px-4 py-2 font-medium">Descripción</th>
                  <th className="text-left px-4 py-2 font-medium">Duración</th>
                  <th className="text-left px-4 py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {(incidents as Array<{ id: string; startedAt: string; type: string; affectedModule: string; description: string; duration: number | null; resolvedAt: string | null }>).map((inc) => (
                  <tr key={inc.id} className="border-b hover:bg-muted/30">
                    <td className="px-4 py-2 font-mono text-xs">{new Date(inc.startedAt).toLocaleString("es-CL")}</td>
                    <td className="px-4 py-2 text-xs">{inc.type}</td>
                    <td className="px-4 py-2 text-xs">{inc.affectedModule}</td>
                    <td className="px-4 py-2 text-xs max-w-xs truncate">{inc.description}</td>
                    <td className="px-4 py-2 text-xs">{inc.duration ? `${inc.duration} min` : "—"}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        inc.resolvedAt ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                      }`}>
                        {inc.resolvedAt ? "Resuelto" : "Abierto"}
                      </span>
                    </td>
                  </tr>
                ))}
                {incidents.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Sin incidentes registrados</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
