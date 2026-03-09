"use client";

import { useState } from "react";
import type { CellModalData } from "./MonitoreoGrid";

interface CellUpdate {
  status: string;
  horaMarcada: string | null;
  notes: string | null;
}

export function MonitoreoGridCellModal({
  data,
  onClose,
  onSave,
  isReadOnly,
}: {
  data: CellModalData;
  onClose: () => void;
  onSave: (rondaId: string, update: CellUpdate) => Promise<void>;
  isReadOnly?: boolean;
}) {
  const { ronda } = data;
  const [status, setStatus] = useState(ronda.status);
  const [hora, setHora] = useState(ronda.horaMarcada ?? "");
  const [note, setNote] = useState(ronda.notes ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(ronda.id, {
        status,
        horaMarcada: hora || null,
        notes: note || null,
      });
    } finally {
      setSaving(false);
    }
  };

  const statusOptions = ronda.rondaExpected
    ? [
        { value: "completada", label: "Completada", color: "emerald" },
        { value: "omitida", label: "Omitida", color: "red" },
        { value: "pendiente", label: "Pendiente", color: "slate" },
        { value: "no_aplica", label: "No aplica", color: "slate" },
      ]
    : [
        { value: "completada", label: "Llam\u00E9, todo OK", color: "emerald" },
        { value: "omitida", label: "Llam\u00E9, novedad", color: "amber" },
        { value: "pendiente", label: "No contact\u00E9", color: "slate" },
        { value: "no_aplica", label: "No aplica", color: "slate" },
      ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 border border-slate-600 rounded-xl p-5 w-96 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-sm text-slate-400">{data.installationName}</div>
            <div className="text-lg font-semibold text-white">
              Slot {ronda.horaEsperada}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-white text-xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* Context indicator */}
        {ronda.rondaExpected && ronda.autoPopulated && (
          <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-teal-500/10 border border-teal-500/20">
            <span className="text-xs">\u26A1</span>
            <span className="text-xs text-teal-400">
              Auto-poblada desde ronda &middot; Trust: {ronda.trustScore ?? "\u2014"}
            </span>
          </div>
        )}

        {ronda.rondaExpected && !ronda.autoPopulated && ronda.status === "pendiente" && (
          <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <span className="text-xs">\u26A0\uFE0F</span>
            <span className="text-xs text-amber-400">
              Ronda esperada &mdash; a&uacute;n no ejecutada
            </span>
          </div>
        )}

        {!ronda.rondaExpected && (
          <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-slate-700/50 border border-slate-600">
            <span className="text-xs">\uD83D\uDCDE</span>
            <span className="text-xs text-slate-400">
              Check-in manual (sin ronda programada)
            </span>
          </div>
        )}

        {/* Options */}
        <div className="space-y-3">
          {/* Status */}
          <div>
            <label className="text-xs text-slate-400 block mb-1.5">Estado</label>
            {isReadOnly ? (
              <span className="text-sm text-slate-200">
                {statusOptions.find((o) => o.value === status)?.label ?? status}
              </span>
            ) : (
              <div className="flex flex-wrap gap-2">
                {statusOptions.map((opt) => {
                  const isActive = status === opt.value;
                  const colorMap: Record<string, string> = {
                    emerald: isActive
                      ? "bg-emerald-500/30 text-emerald-300 ring-1 ring-emerald-500/50"
                      : "bg-slate-800 text-slate-500 hover:bg-slate-700",
                    red: isActive
                      ? "bg-red-500/30 text-red-300 ring-1 ring-red-500/50"
                      : "bg-slate-800 text-slate-500 hover:bg-slate-700",
                    amber: isActive
                      ? "bg-amber-500/30 text-amber-300 ring-1 ring-amber-500/50"
                      : "bg-slate-800 text-slate-500 hover:bg-slate-700",
                    slate: isActive
                      ? "bg-slate-600/50 text-slate-200 ring-1 ring-slate-500/50"
                      : "bg-slate-800 text-slate-500 hover:bg-slate-700",
                  };
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setStatus(opt.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${colorMap[opt.color]}`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Hora */}
          <div>
            <label className="text-xs text-slate-400 block mb-1">Hora</label>
            {isReadOnly ? (
              <span className="text-sm font-mono text-slate-200">{hora || "\u2014"}</span>
            ) : (
              <input
                type="time"
                value={hora}
                onChange={(e) => setHora(e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:border-teal-500 focus:outline-none"
              />
            )}
          </div>

          {/* Note */}
          <div>
            <label className="text-xs text-slate-400 block mb-1">Nota</label>
            {isReadOnly ? (
              <p className="text-sm text-slate-300 whitespace-pre-wrap">{note || "\u2014"}</p>
            ) : (
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:border-teal-500 focus:outline-none resize-none"
                placeholder={
                  ronda.rondaExpected
                    ? "Observaciones, motivo de omisi\u00F3n..."
                    : "Resultado del llamado, novedades..."
                }
              />
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-4">
          <button
            onClick={onClose}
            className={`${isReadOnly ? "w-full" : "flex-1"} px-4 py-2 rounded-lg bg-slate-700 text-slate-300 text-sm hover:bg-slate-600`}
          >
            {isReadOnly ? "Cerrar" : "Cancelar"}
          </button>
          {!isReadOnly && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-500 disabled:opacity-50"
            >
              {saving
                ? "Guardando..."
                : ronda.autoPopulated
                  ? "Override manual"
                  : "Guardar"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
