"use client";

/**
 * Importador inteligente de listas (whitelist/blacklist) compartido
 * entre el panel admin y el portal cliente.
 *
 * - Soporta XLSX, XLS, CSV, TSV, TXT.
 * - Detecta columnas con tildes/mayúsculas/espacios.
 * - Combina Nombre + Apellido Paterno + Apellido Materno cuando vienen separados.
 * - Filas válidas con RUT y/o patente (mín. 4 caracteres normalizado).
 * - Admin: opción de asignar todas las filas importadas a un grupo existente.
 */

import React, { useState } from "react";
import { toast } from "sonner";
import { Upload, X, Loader2, Check, Download, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { ListType } from "@/lib/access-control/types";
import {
  parseSpreadsheetFile,
  findColumn,
  normalizeDateString,
  rowsHeaders,
  type SheetRow,
} from "@/lib/spreadsheet-import";

type ImportMode = "admin" | "client";

interface Props {
  installationId: string;
  listType: ListType;
  mode?: ImportMode;
  /** Solo admin: grupos ya cargados para asignación opcional post-import */
  groups?: Array<{ id: string; name: string }>;
  /**
   * Admin: si hay al menos un grupo, exige elegir uno antes de importar.
   * Sin grupos, la importación va solo a la lista (sin membresía de grupo).
   */
  requireGroupWhenAvailable?: boolean;
  onClose: () => void;
  onImported: () => void;
}

interface MappedRow {
  rut: string;
  vehiclePlate: string;
  fullName: string;
  company: string;
  blockReason: string;
  validFrom: string;
  validUntil: string;
}

const COLUMN_SYNONYMS = {
  rut: ["rut", "run", "rolunico", "rolunicotributario", "cedula", "ci"],
  vehiclePlate: [
    "patente",
    "placapatente",
    "placa",
    "plate",
    "vehicleplate",
    "npatente",
    "patentevehiculo",
    "patentevehículo",
  ],
  fullName: ["nombrecompleto", "nombreyapellido", "fullname", "nombres y apellidos"],
  firstName: ["nombres", "nombre", "primernombre"],
  lastName1: ["apellidopaterno", "primerapellido", "apellido1", "apellidopa"],
  lastName2: ["apellidomaterno", "segundoapellido", "apellido2", "apellidoma"],
  company: ["empresa", "razonsocial", "compania", "company", "organizacion"],
  blockReason: ["motivo", "razon", "razonbloqueo", "motivobloqueo", "blockreason"],
  validFrom: ["vigenciadesde", "validfrom", "fechadesde", "desde", "fechainicio"],
  validUntil: ["vigenciahasta", "validuntil", "fechahasta", "hasta", "vencimiento", "fechafin"],
} as const;

function buildFullName(row: SheetRow, headers: string[]): string {
  const fullCol = findColumn(headers, [...COLUMN_SYNONYMS.fullName]);
  if (fullCol && String(row[fullCol] ?? "").trim()) {
    return String(row[fullCol]).trim();
  }
  const firstCol = findColumn(headers, [...COLUMN_SYNONYMS.firstName]);
  const last1Col = findColumn(headers, [...COLUMN_SYNONYMS.lastName1]);
  const last2Col = findColumn(headers, [...COLUMN_SYNONYMS.lastName2]);
  const parts = [
    firstCol ? String(row[firstCol] ?? "").trim() : "",
    last1Col ? String(row[last1Col] ?? "").trim() : "",
    last2Col ? String(row[last2Col] ?? "").trim() : "",
  ].filter(Boolean);
  return parts.join(" ");
}

function mapRow(
  row: SheetRow,
  headers: string[],
  rutColOverride: string | null,
  plateColOverride: string | null,
): MappedRow {
  const rutCol = rutColOverride ?? findColumn(headers, [...COLUMN_SYNONYMS.rut]);
  const plateCol =
    plateColOverride ?? findColumn(headers, [...COLUMN_SYNONYMS.vehiclePlate]);
  const compCol = findColumn(headers, [...COLUMN_SYNONYMS.company]);
  const blockCol = findColumn(headers, [...COLUMN_SYNONYMS.blockReason]);
  const fromCol = findColumn(headers, [...COLUMN_SYNONYMS.validFrom]);
  const untilCol = findColumn(headers, [...COLUMN_SYNONYMS.validUntil]);

  return {
    rut: rutCol ? String(row[rutCol] ?? "").trim() : "",
    vehiclePlate: plateCol ? String(row[plateCol] ?? "").trim() : "",
    fullName: buildFullName(row, headers),
    company: compCol ? String(row[compCol] ?? "").trim() : "",
    blockReason: blockCol ? String(row[blockCol] ?? "").trim() : "",
    validFrom: fromCol ? normalizeDateString(String(row[fromCol] ?? "")) : "",
    validUntil: untilCol ? normalizeDateString(String(row[untilCol] ?? "")) : "",
  };
}

function endpointFor(mode: ImportMode, installationId: string): string {
  if (mode === "client") {
    return `/api/portal/cliente/access-control/${installationId}/import-whitelist`;
  }
  return `/api/access-control/lists/${installationId}/import`;
}

function templateUrl(mode: ImportMode, installationId: string, listType: ListType): string {
  if (mode === "client") {
    return `/api/portal/cliente/access-control/${installationId}/template?type=${listType}`;
  }
  return `/api/access-control/lists/${installationId}/template?type=${listType}`;
}

export function ListImport({
  installationId,
  listType,
  mode = "admin",
  groups = [],
  requireGroupWhenAvailable = true,
  onClose,
  onImported,
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [rawRows, setRawRows] = useState<SheetRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rutColOverride, setRutColOverride] = useState<string | null>(null);
  const [plateColOverride, setPlateColOverride] = useState<string | null>(null);
  const [importGroupId, setImportGroupId] = useState<string>("");
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    imported: number;
    errors: Array<{ row: number; rut: string; error: string }>;
  } | null>(null);

  const detectedRutCol =
    rutColOverride ?? findColumn(headers, [...COLUMN_SYNONYMS.rut]);
  const detectedPlateCol =
    plateColOverride ?? findColumn(headers, [...COLUMN_SYNONYMS.vehiclePlate]);

  const detectedFullNameCol =
    findColumn(headers, [...COLUMN_SYNONYMS.fullName]);
  const detectedFirstNameCol =
    findColumn(headers, [...COLUMN_SYNONYMS.firstName]);
  const detectedLast1Col = findColumn(headers, [...COLUMN_SYNONYMS.lastName1]);
  const detectedLast2Col = findColumn(headers, [...COLUMN_SYNONYMS.lastName2]);
  const detectedCompanyCol = findColumn(headers, [...COLUMN_SYNONYMS.company]);

  const hasIdentityMapping = !!(detectedRutCol || detectedPlateCol);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setResult(null);
    setRutColOverride(null);
    setPlateColOverride(null);
    setParsing(true);
    try {
      const rows = await parseSpreadsheetFile(f);
      setRawRows(rows);
      setHeaders(rowsHeaders(rows));
      if (rows.length === 0) {
        toast.error("El archivo está vacío o no se pudo leer");
      }
    } catch (err) {
      console.error("[ListImport] parse error:", err);
      toast.error("Error al leer el archivo. Verifica el formato.");
      setRawRows([]);
      setHeaders([]);
    } finally {
      setParsing(false);
    }
  };

  const mapped = rawRows.map((r) => mapRow(r, headers, rutColOverride, plateColOverride));
  const preview = mapped.slice(0, 10);

  const handleImport = async () => {
    if (rawRows.length === 0) return;
    if (!hasIdentityMapping) {
      toast.error("Selecciona al menos una columna RUT o Patente");
      return;
    }

    if (
      mode === "admin" &&
      requireGroupWhenAvailable &&
      groups.length > 0 &&
      !importGroupId.trim()
    ) {
      toast.error("Selecciona el grupo destino de la importación");
      return;
    }

    setImporting(true);
    try {
      const payload: Record<string, unknown> = {
        rows: mapped.map((row) => ({
          rut: row.rut,
          vehiclePlate: row.vehiclePlate || undefined,
          fullName: row.fullName,
          company: row.company,
          blockReason: row.blockReason,
          validFrom: row.validFrom,
          validUntil: row.validUntil,
        })),
        listType,
      };
      if (mode === "admin" && importGroupId.trim()) {
        payload.groupId = importGroupId.trim();
      }

      const res = await fetch(endpointFor(mode, installationId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        setResult(json.data);
        toast.success(`${json.data.imported} entradas importadas`);
        onImported();
      } else {
        toast.error(json.error || "Error al importar");
      }
    } catch (err) {
      console.error("[ListImport] import error:", err);
      toast.error("Error al importar");
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadErrors = () => {
    if (!result || result.errors.length === 0) return;
    const csv =
      "Fila,Identificador,Error\n" +
      result.errors
        .map((e) => `${e.row},"${e.rut}","${e.error.replace(/"/g, '""')}"`)
        .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `errores_importacion_${listType}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-lg border border-zinc-600 bg-zinc-800 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-zinc-200">
          Importar {listType === "whitelist" ? "Lista Blanca" : "Lista Negra"}
        </h4>
        <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-300">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="rounded-md border border-status-info-border bg-status-info-soft px-3 py-2">
        <p className="text-xs text-status-info-fg">
          Acepta archivos <strong>.xlsx</strong>, <strong>.csv</strong>, <strong>.tsv</strong>.
          Cada fila debe tener <strong>RUT y/o patente</strong> (mín. 4 caracteres). Si falta nombre y hay patente,
          se usará el texto &quot;Vehículo PATENTE&quot;.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <a
          href={templateUrl(mode, installationId, listType)}
          download
          className="inline-flex items-center gap-1 rounded-md border border-zinc-600 bg-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-600"
        >
          <Download className="h-3.5 w-3.5" />
          Descargar plantilla XLSX
        </a>
        <input
          type="file"
          accept=".xlsx,.xls,.csv,.tsv,.txt"
          onChange={handleFileChange}
          className="text-sm text-zinc-400"
        />
      </div>

      {mode === "admin" && (
        <div>
          <Label className="text-xs text-zinc-400">
            Grupo destino
            {groups.length > 0 && requireGroupWhenAvailable ? (
              <span className="text-status-danger-fg"> *</span>
            ) : null}
          </Label>
          {groups.length === 0 ? (
            <p className="mt-1 rounded-md border border-status-warn-border bg-status-warn-soft px-3 py-2 text-xs text-status-warn-fg">
              No hay grupos en esta instalación para este tipo de lista. La importación quedará solo en la lista (sin
              grupo). Si necesitas agrupar, crea un grupo antes de importar.
            </p>
          ) : (
            <>
              <select
                value={importGroupId}
                onChange={(e) => setImportGroupId(e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-600 bg-zinc-700 px-3 py-2 text-sm text-zinc-200"
              >
                {!requireGroupWhenAvailable ? (
                  <option value="">Sin grupo (solo la lista)</option>
                ) : (
                  <option value="">— Elige un grupo —</option>
                )}
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-zinc-500">
                Las filas válidas quedarán en la lista y asociadas al grupo seleccionado.
              </p>
            </>
          )}
        </div>
      )}

      {parsing && (
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Analizando archivo...
        </div>
      )}

      {file && headers.length > 0 && (
        <div className="space-y-2 rounded-md border border-zinc-700 bg-zinc-900/50 p-3">
          <p className="text-xs font-medium text-zinc-300">
            Mapeo detectado ({rawRows.length} filas)
          </p>
          <div className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
            <MappingRow label="RUT" value={detectedRutCol} required={false} />
            <MappingRow label="Patente" value={detectedPlateCol} required={false} />
            <MappingRow
              label="Nombre"
              value={
                detectedFullNameCol ||
                [detectedFirstNameCol, detectedLast1Col, detectedLast2Col]
                  .filter(Boolean)
                  .join(" + ") ||
                null
              }
            />
            <MappingRow label="Empresa" value={detectedCompanyCol} />
          </div>

          {!hasIdentityMapping && (
            <div className="space-y-2 pt-2">
              <Label className="text-xs text-status-warn-fg">
                <AlertTriangle className="mr-1 inline h-3 w-3" />
                Define al menos una columna RUT o Patente
              </Label>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <span className="text-xs text-zinc-500">Columna RUT</span>
                  <select
                    value={rutColOverride || ""}
                    onChange={(e) => setRutColOverride(e.target.value || null)}
                    className="mt-0.5 w-full rounded-md border border-zinc-600 bg-zinc-700 px-2 py-1 text-xs text-zinc-200"
                  >
                    <option value="">— Ninguna —</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <span className="text-xs text-zinc-500">Columna patente</span>
                  <select
                    value={plateColOverride || ""}
                    onChange={(e) => setPlateColOverride(e.target.value || null)}
                    className="mt-0.5 w-full rounded-md border border-zinc-600 bg-zinc-700 px-2 py-1 text-xs text-zinc-200"
                  >
                    <option value="">— Ninguna —</option>
                    {headers.map((h) => (
                      <option key={`p-${h}`} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {hasIdentityMapping && !detectedRutCol && (
            <div className="space-y-1 pt-2">
              <Label className="text-xs text-zinc-400">Corregir columna RUT (opcional)</Label>
              <select
                value={rutColOverride || ""}
                onChange={(e) => setRutColOverride(e.target.value || null)}
                className="w-full rounded-md border border-zinc-600 bg-zinc-700 px-2 py-1 text-xs text-zinc-200"
              >
                <option value="">— Sin columna RUT —</option>
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
          )}

          {hasIdentityMapping && !detectedPlateCol && (
            <div className="space-y-1 pt-2">
              <Label className="text-xs text-zinc-400">Corregir columna patente (opcional)</Label>
              <select
                value={plateColOverride || ""}
                onChange={(e) => setPlateColOverride(e.target.value || null)}
                className="w-full rounded-md border border-zinc-600 bg-zinc-700 px-2 py-1 text-xs text-zinc-200"
              >
                <option value="">— Sin columna patente —</option>
                {headers.map((h) => (
                  <option key={`fix-${h}`} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {preview.length > 0 && (
        <div className="max-h-48 overflow-auto rounded border border-zinc-700 text-xs">
          <table className="w-full">
            <thead>
              <tr className="bg-zinc-700 sticky top-0">
                <th className="px-2 py-1 text-left text-zinc-300">RUT</th>
                <th className="px-2 py-1 text-left text-zinc-300">Patente</th>
                <th className="px-2 py-1 text-left text-zinc-300">Nombre</th>
                <th className="px-2 py-1 text-left text-zinc-300">Empresa</th>
                {listType === "blacklist" ? (
                  <th className="px-2 py-1 text-left text-zinc-300">Motivo</th>
                ) : (
                  <>
                    <th className="px-2 py-1 text-left text-zinc-300">Desde</th>
                    <th className="px-2 py-1 text-left text-zinc-300">Hasta</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {preview.map((row, i) => (
                <tr key={i} className="border-t border-zinc-700">
                  <td className="px-2 py-1 font-mono text-zinc-400">{row.rut || "—"}</td>
                  <td className="px-2 py-1 font-mono text-zinc-400">{row.vehiclePlate || "—"}</td>
                  <td className="px-2 py-1 text-zinc-400">{row.fullName || "—"}</td>
                  <td className="px-2 py-1 text-zinc-400">{row.company || "—"}</td>
                  {listType === "blacklist" ? (
                    <td className="px-2 py-1 text-zinc-400">{row.blockReason || "—"}</td>
                  ) : (
                    <>
                      <td className="px-2 py-1 text-zinc-400">{row.validFrom || "—"}</td>
                      <td className="px-2 py-1 text-zinc-400">{row.validUntil || "—"}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {rawRows.length > preview.length && (
            <p className="bg-zinc-900 px-2 py-1 text-zinc-500">
              ...y {rawRows.length - preview.length} filas más
            </p>
          )}
        </div>
      )}

      {result && (
        <div className="space-y-1 rounded-md border border-zinc-700 bg-zinc-900/50 p-3">
          <p className="text-sm text-status-ok-fg">
            <Check className="mr-1 inline h-4 w-4" />
            {result.imported} entradas importadas
          </p>
          {result.errors.length > 0 && (
            <>
              <p className="text-xs text-status-danger-fg">
                {result.errors.length} filas con error
              </p>
              <button
                type="button"
                onClick={handleDownloadErrors}
                className="text-xs text-status-info-fg hover:underline"
              >
                <Download className="mr-1 inline h-3 w-3" />
                Descargar errores CSV
              </button>
              <div className="mt-2 max-h-24 overflow-auto text-xs text-status-danger-fg">
                {result.errors.slice(0, 5).map((e, i) => (
                  <p key={i}>
                    Fila {e.row}: {e.rut} — {e.error}
                  </p>
                ))}
                {result.errors.length > 5 && (
                  <p className="text-zinc-500">...y {result.errors.length - 5} más</p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onClose}>
          Cerrar
        </Button>
        <Button
          size="sm"
          onClick={() => void handleImport()}
          disabled={
            !file ||
            rawRows.length === 0 ||
            importing ||
            !hasIdentityMapping ||
            (mode === "admin" &&
              requireGroupWhenAvailable &&
              groups.length > 0 &&
              !importGroupId.trim())
          }
        >
          {importing ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Upload className="mr-1 h-4 w-4" />
          )}
          Importar {rawRows.length > 0 && `(${rawRows.length} filas)`}
        </Button>
      </div>
    </div>
  );
}

function MappingRow({
  label,
  value,
  required = false,
}: {
  label: string;
  value: string | null;
  required?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-zinc-500">{label}:</span>
      {value ? (
        <span className="font-mono text-status-ok-fg truncate">{value}</span>
      ) : required ? (
        <span className="font-mono text-status-warn-fg">no detectado</span>
      ) : (
        <span className="font-mono text-zinc-600">—</span>
      )}
    </div>
  );
}
