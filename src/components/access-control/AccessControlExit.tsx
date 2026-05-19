"use client";

import React, { useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import {
  ArrowLeft, Search, LogOut, Loader2, Clock, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DynamicFormRenderer } from "./DynamicFormRenderer";
import {
  RECORD_TYPE_CONFIG,
  DEFAULT_FORM_FIELDS,
  isDefaultRecordType,
  getFieldsForPhase,
} from "@/lib/access-control/types";
import { formatRut, formatDuration, elapsedMinutes } from "@/lib/access-control/utils";
import type {
  AccessRecordType,
  AccessControlConfigData,
  FormFieldConfig,
} from "@/lib/access-control/types";

interface InSiteRecord {
  id: string;
  recordType: AccessRecordType;
  rut: string | null;
  fullName: string | null;
  company: string | null;
  entryAt: string;
  vehiclePlate: string | null;
  customFields?: Record<string, unknown> | null;
}

interface Props {
  installationId: string;
  guardId: string;
  config: AccessControlConfigData;
  onClose: () => void;
}

type ExitStep = "list" | "form";

export function AccessControlExit({ installationId, guardId, config, onClose }: Props) {
  const [search, setSearch] = useState("");
  const [records, setRecords] = useState<InSiteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [exitingId, setExitingId] = useState<string | null>(null);
  const [step, setStep] = useState<ExitStep>("list");
  const [selectedRecord, setSelectedRecord] = useState<InSiteRecord | null>(null);
  const [exitFields, setExitFields] = useState<FormFieldConfig[]>([]);
  // Observaciones del empty-state (cuando no hay fields exit configurados).
  // Se reinicia cada vez que se abre el form para un record distinto.
  const [emptyStateObservations, setEmptyStateObservations] = useState("");

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/access-control/records/${installationId}/in-site${search ? `?search=${encodeURIComponent(search)}` : ""}`
      );
      const json = await res.json();
      if (json.success) {
        setRecords(json.data.records);
      }
    } catch {
      toast.error("Error al cargar registros");
    } finally {
      setLoading(false);
    }
  }, [installationId, search]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  /** Resuelve los fields configurados para el recordType del record en sitio,
   *  filtrados a fase "exit" (incluye "both"). Mismo árbol de resolución que
   *  AccessControlEntry.getFields(). */
  const resolveExitFields = useCallback(
    (recordType: AccessRecordType): FormFieldConfig[] => {
      const formConfig = config.formConfig as Record<string, FormFieldConfig[] | undefined>;
      let all: FormFieldConfig[];
      if (formConfig[recordType]) {
        all = formConfig[recordType] ?? [];
      } else if (isDefaultRecordType(recordType)) {
        all = DEFAULT_FORM_FIELDS[recordType] ?? [];
      } else {
        const custom = config.customRecordTypes?.find((c) => c.key === recordType);
        all = custom?.defaultFields ?? [];
      }
      return getFieldsForPhase(all, "exit");
    },
    [config],
  );

  /** Cuando el guardia tap "Salida" en un record SIEMPRE abre el step
   *  "form", aunque no haya fields exit/both configurados. En ese caso
   *  el form renderiza un empty-state con observaciones opcionales y un
   *  botón "Confirmar Salida", evitando salidas silenciosas accidentales.
   *  El admin puede agregar fields appliesTo: "exit"/"both" desde el
   *  ConfigTab para enriquecer la captura. */
  const handleStartExit = (record: InSiteRecord) => {
    const fields = resolveExitFields(record.recordType);
    setSelectedRecord(record);
    setExitFields(fields);
    setEmptyStateObservations("");
    setStep("form");
  };

  const doExit = async (record: InSiteRecord, exitCustomFields: Record<string, unknown>) => {
    setExitingId(record.id);
    try {
      const gps = await new Promise<{ lat: number; lng: number } | null>((resolve) => {
        navigator.geolocation?.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          () => resolve(null),
          { timeout: 5000 }
        );
      });

      // exitObservations: si el form tenía un field "observations" lo
      // extraemos al campo dedicado (mantiene back-compat con queries que
      // leen exitObservations). El resto va a exitCustomFields.
      const observations =
        typeof exitCustomFields.observations === "string"
          ? exitCustomFields.observations
          : null;

      const res = await fetch(`/api/access-control/records/item/${record.id}/exit`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exitGuardId: guardId,
          gpsLat: gps?.lat,
          gpsLng: gps?.lng,
          exitObservations: observations,
          exitCustomFields,
        }),
      });

      const json = await res.json();
      if (json.success) {
        toast.success("Salida registrada");
        setStep("list");
        setSelectedRecord(null);
        setExitFields([]);
        fetchRecords();
      } else {
        toast.error(json.error || "Error al registrar salida");
      }
    } catch {
      toast.error("Error al registrar salida");
    } finally {
      setExitingId(null);
    }
  };

  /** Pre-rellena el form de salida con los valores capturados a la entrada
   *  para los fields tipo "both", de modo que el guardia solo confirma o edita
   *  en lugar de re-escribir desde cero. */
  const buildInitialFormData = (record: InSiteRecord, fields: FormFieldConfig[]): Record<string, unknown> => {
    const entry = (record.customFields ?? {}) as Record<string, unknown>;
    const initial: Record<string, unknown> = {};
    for (const f of fields) {
      // Solo prellenar fields "both"; los "exit" puros nacen vacíos.
      if (f.appliesTo === "both" && entry[f.field] !== undefined) {
        initial[f.field] = entry[f.field];
      }
    }
    return initial;
  };

  // ── Step: form de salida ──
  if (step === "form" && selectedRecord) {
    const tc = RECORD_TYPE_CONFIG[selectedRecord.recordType] ?? {
      label: selectedRecord.recordType,
      icon: "UserPlus",
      color: "blue",
    };
    return (
      <div className="flex flex-col h-full bg-zinc-950">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 shrink-0">
          <button
            onClick={() => {
              setStep("list");
              setSelectedRecord(null);
              setExitFields([]);
              setEmptyStateObservations("");
            }}
            className="text-zinc-400 hover:text-zinc-200"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h3 className="text-base font-semibold text-zinc-100">Datos de Salida</h3>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-xs border-zinc-600">
                {tc.label}
              </Badge>
              <span className="text-sm font-medium text-zinc-200 break-words">
                {selectedRecord.fullName || selectedRecord.vehiclePlate || "Sin identificar"}
              </span>
            </div>
            <div className="text-xs text-zinc-500 space-x-3">
              {selectedRecord.rut && <span>{formatRut(selectedRecord.rut)}</span>}
              {selectedRecord.vehiclePlate && <span>{selectedRecord.vehiclePlate}</span>}
              {selectedRecord.company && <span>{selectedRecord.company}</span>}
            </div>
          </div>

          <DynamicFormRenderer
            fields={exitFields}
            initialData={buildInitialFormData(selectedRecord, exitFields)}
            onSubmit={(data) => void doExit(selectedRecord, data)}
          />

          {exitingId === selectedRecord.id && (
            <div className="flex items-center justify-center gap-2 py-2 text-sm text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Registrando salida...
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Step: lista en sitio ──
  return (
    <div className="flex flex-col h-full bg-zinc-950">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 shrink-0">
        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-200">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h3 className="text-base font-semibold text-zinc-100">Registrar Salida</h3>
      </div>

      <div className="px-4 pt-4 pb-2 shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por RUT, nombre o patente..."
            className="pl-9 bg-zinc-800 border-zinc-600"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
          </div>
        ) : records.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">
            No hay personas en sitio
          </p>
        ) : (
          <div className="space-y-2">
            {records.map((record) => {
              const elapsed = elapsedMinutes(record.entryAt);
              const tc = RECORD_TYPE_CONFIG[record.recordType] ?? { label: record.recordType, icon: "UserPlus", color: "blue" };
              return (
                <div
                  key={record.id}
                  className="rounded-lg border border-zinc-700 bg-zinc-900 p-3"
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="text-xs border-zinc-600">
                          {tc.label}
                        </Badge>
                        <span className="text-sm font-medium text-zinc-200 break-words">
                          {record.fullName || record.vehiclePlate || "Sin identificar"}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-zinc-500">
                        {record.rut && <span>{formatRut(record.rut)}</span>}
                        {record.vehiclePlate && <span>{record.vehiclePlate}</span>}
                        {record.company && <span>{record.company}</span>}
                      </div>
                      <div className="mt-1 flex items-center gap-1 text-xs">
                        <Clock className="h-3 w-3 text-zinc-500" />
                        <span className="text-zinc-400">{formatDuration(elapsed)}</span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-2 border-zinc-600 text-zinc-300 hover:bg-status-danger-soft hover:text-status-danger-fg hover:border-status-danger-border"
                      onClick={() => handleStartExit(record)}
                      disabled={exitingId === record.id}
                    >
                      {exitingId === record.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <LogOut className="mr-1 h-4 w-4" />
                          Salida
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
