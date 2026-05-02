"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Plus, Clock } from "lucide-react";
import { GuardiaSearchInput } from "@/components/ops/GuardiaSearchInput";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GuardData {
  id: string;
  guardiaNombre: string;
  status: string;
  horaLlegada: string | null;
  isExtra: boolean;
  turno: string;
  notes?: string | null;
  reemplazaDe?: string | null;
  guardiaId?: string | null;
}

export interface GuardPanelProps {
  instalacion: {
    id: string;
    installationName: string;
    guardiasRequeridos: number;
    coberturaStatus: string;
    guardias: GuardData[];
  };
  turno: "nocturno" | "diurno";
  onClose: () => void;
  onGuardiaUpdate: (
    guardiaId: string,
    data: {
      status?: string;
      horaLlegada?: string | null;
      notes?: string | null;
      reemplazaDe?: string | null;
      guardiaNombre?: string;
      guardiaId?: string | null;
    },
  ) => void;
  onGuardiaAdd: (data: {
    guardiaNombre: string;
    guardiaId?: string | null;
    isExtra: boolean;
    turno: string;
  }) => void;
  onGuardiaDelete: (guardiaId: string) => void;
  isReadOnly?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const STATUS_BUTTONS = [
  { value: "pendiente", label: "Pendiente", activeBg: "bg-slate-500" },
  { value: "en_camino", label: "En camino", activeBg: "bg-status-info" },
  { value: "presente", label: "Presente", activeBg: "bg-status-ok" },
  { value: "no_viene", label: "Sin cobertura", activeBg: "bg-status-danger" },
] as const;

// ---------------------------------------------------------------------------
// GuardCard
// ---------------------------------------------------------------------------

function GuardCard({
  guard,
  onUpdate,
  onDelete,
}: {
  guard: GuardData;
  onUpdate: (data: {
    status?: string;
    horaLlegada?: string | null;
    notes?: string | null;
    reemplazaDe?: string | null;
    guardiaNombre?: string;
    guardiaId?: string | null;
  }) => void;
  onDelete: () => void;
}) {
  const [localHora, setLocalHora] = useState(guard.horaLlegada ?? "");
  const [localNotes, setLocalNotes] = useState(guard.notes ?? "");
  const notesSaveRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // PPC detection
  const isPPC = guard.guardiaNombre === "PPC";
  const isPPCUnassigned = isPPC && !guard.guardiaId;
  const [ppcSearchName, setPpcSearchName] = useState("");
  const [ppcSearchId, setPpcSearchId] = useState<string | null>(null);

  // "No viene" sub-flow: null → choosing → sin_cobertura | con_cobertura
  const [noVieneStep, setNoVieneStep] = useState<
    null | "choosing" | "sin_cobertura" | "con_cobertura"
  >(guard.status === "no_viene" ? (guard.reemplazaDe ? "con_cobertura" : "sin_cobertura") : null);
  const [replacementName, setReplacementName] = useState("");
  const [replacementId, setReplacementId] = useState<string | null>(null);

  // Sync with prop changes (optimistic updates from parent)
  useEffect(() => {
    setLocalHora(guard.horaLlegada ?? "");
  }, [guard.horaLlegada]);

  const handleStatusChange = (newStatus: string) => {
    if (newStatus === "no_viene") {
      // Show sub-options instead of immediately setting status
      setNoVieneStep("choosing");
      return;
    }
    // Switching away from no_viene: clear sub-flow
    setNoVieneStep(null);
    const patch: { status: string; horaLlegada?: string } = {
      status: newStatus,
    };
    if (newStatus === "presente" && !guard.horaLlegada) {
      patch.horaLlegada = nowHHMM();
    }
    onUpdate(patch);
  };

  const handleSinCobertura = () => {
    setNoVieneStep("sin_cobertura");
    onUpdate({ status: "no_viene", reemplazaDe: null, notes: "Sin cobertura — puesto descubierto" });
  };

  const handleConCobertura = () => {
    setNoVieneStep("con_cobertura");
    onUpdate({ status: "no_viene" });
  };

  const handleReplacementConfirm = () => {
    if (!replacementName.trim()) return;
    onUpdate({ status: "no_viene", reemplazaDe: replacementName.trim() });
    // Keep in con_cobertura step to show the confirmed replacement
  };

  const handleHoraBlur = () => {
    if (localHora !== (guard.horaLlegada ?? "")) {
      onUpdate({ horaLlegada: localHora || null });
    }
  };

  const handleNotesChange = (value: string) => {
    setLocalNotes(value);
    if (notesSaveRef.current) clearTimeout(notesSaveRef.current);
    notesSaveRef.current = setTimeout(() => {
      onUpdate({ notes: value || null });
    }, 1500);
  };

  const cardBorder =
    guard.status === "no_viene"
      ? "bg-status-danger-soft/30 border-status-danger-border"
      : guard.status === "presente" || guard.status === "reemplazo"
        ? "bg-status-ok-soft/30 border-status-ok-border"
        : "bg-slate-800/40 border-slate-700/50";

  const isNoViene = guard.status === "no_viene" || noVieneStep === "choosing";

  const handlePPCAssign = () => {
    if (!ppcSearchName.trim()) return;
    onUpdate({
      guardiaNombre: ppcSearchName.trim(),
      guardiaId: ppcSearchId,
      status: "presente",
      horaLlegada: nowHHMM(),
    });
  };

  // PPC unassigned — show guard selector instead of status buttons
  if (isPPCUnassigned) {
    return (
      <div className="rounded-lg border p-3 space-y-3 bg-status-warn-soft/30 border-status-warn-border">
        <div className="flex items-center gap-2">
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-status-warn-soft text-status-warn-fg font-semibold">
            PPC
          </span>
          <span className="text-sm text-status-warn-fg font-medium">Por cubrir</span>
        </div>
        <div className="space-y-2">
          <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold">Asignar guardia</p>
          <GuardiaSearchInput
            value={ppcSearchName}
            onChange={(patch) => {
              setPpcSearchName(patch.guardiaNombre);
              if (patch.guardiaId) setPpcSearchId(patch.guardiaId);
            }}
            placeholder="Buscar guardia..."
            className="h-8 text-xs bg-slate-900 border-slate-600"
            dropdownDirection="down"
          />
          <button
            onClick={handlePPCAssign}
            disabled={!ppcSearchName.trim()}
            className={`w-full py-1.5 rounded-md text-xs font-medium transition-colors ${
              ppcSearchName.trim()
                ? "bg-status-warn hover:brightness-110 text-white"
                : "bg-slate-800 text-slate-600 cursor-not-allowed"
            }`}
          >
            Asignar guardia
          </button>
        </div>
        {/* Sin cobertura shortcut */}
        <button
          onClick={() => onUpdate({ status: "no_viene", notes: "Sin cobertura — puesto descubierto" })}
          className="w-full py-1.5 rounded-md text-[11px] font-medium border border-status-danger-border text-status-danger-fg hover:bg-status-danger-soft transition-colors"
        >
          Marcar sin cobertura
        </button>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border p-3 space-y-3 ${cardBorder}`}>
      {/* Name + badges */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-200 font-medium">
            {guard.guardiaNombre}
          </span>
          {guard.isExtra && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-tint-violet text-tint-violet-fg">
              EXTRA
            </span>
          )}
        </div>
        {guard.isExtra && (
          <button
            onClick={onDelete}
            className="text-slate-600 hover:text-status-danger-fg transition-colors p-1"
            title="Eliminar guardia"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Status buttons */}
      <div className="flex gap-1.5">
        {STATUS_BUTTONS.map((btn) => {
          // When in any noViene step, only "No viene" should be highlighted
          const isActive = noVieneStep != null
            ? btn.value === "no_viene"
            : guard.status === btn.value;
          return (
            <button
              key={btn.value}
              onClick={() => handleStatusChange(btn.value)}
              className={`flex-1 py-1.5 rounded-md text-[11px] font-medium transition-all ${
                isActive
                  ? `${btn.activeBg} text-white shadow-sm`
                  : "bg-slate-800 text-slate-500 hover:text-slate-300 hover:bg-slate-700"
              }`}
            >
              {btn.label}
            </button>
          );
        })}
      </div>

      {/* Arrival time — visible unless no_viene */}
      {!isNoViene && (
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-slate-500 uppercase tracking-wide w-16 flex-shrink-0">
            Llegada
          </label>
          <input
            type="time"
            value={localHora}
            onChange={(e) => setLocalHora(e.target.value)}
            onBlur={handleHoraBlur}
            className="flex-1 h-8 text-xs bg-slate-900 border border-slate-700 rounded-md px-2 text-slate-300 focus:border-status-info-border focus:outline-none font-mono"
          />
          {!guard.horaLlegada && (
            <button
              onClick={() =>
                onUpdate({
                  horaLlegada: nowHHMM(),
                  status:
                    guard.status === "pendiente" ? "presente" : guard.status,
                })
              }
              className="h-8 px-2.5 text-[10px] rounded-md bg-status-info-soft text-status-info-fg hover:brightness-110 transition-colors flex items-center gap-1 flex-shrink-0"
              title="Usar hora actual"
            >
              <Clock className="w-3 h-3" />
              Ahora
            </button>
          )}
        </div>
      )}

      {/* No viene — sub-options */}
      {noVieneStep === "choosing" && (
        <div className="space-y-2 pt-1 border-t border-status-danger-border/40">
          <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold">¿Tiene cobertura?</p>
          <div className="flex gap-2">
            <button
              onClick={handleSinCobertura}
              className="flex-1 py-2 rounded-lg border-2 border-status-danger-border bg-status-danger-soft text-status-danger-fg text-xs font-semibold hover:bg-status-danger-soft transition-colors"
            >
              Sin cobertura
              <span className="block text-[9px] font-normal text-status-danger-fg/70 mt-0.5">Alerta máxima</span>
            </button>
            <button
              onClick={handleConCobertura}
              className="flex-1 py-2 rounded-lg border-2 border-status-ok-border bg-status-ok-soft text-status-ok-fg text-xs font-semibold hover:bg-status-ok-soft transition-colors"
            >
              Con cobertura
              <span className="block text-[9px] font-normal text-status-ok-fg/70 mt-0.5">Buscar reemplazo</span>
            </button>
          </div>
        </div>
      )}

      {/* Sin cobertura — confirmed state */}
      {noVieneStep === "sin_cobertura" && guard.status === "no_viene" && (
        <div className="space-y-2 pt-1 border-t border-status-danger-border/40">
          <div className="flex items-center gap-2 rounded-lg bg-status-danger-soft border border-status-danger-border px-3 py-2">
            <span className="w-2 h-2 rounded-full bg-status-danger animate-pulse" />
            <span className="text-[11px] font-semibold text-status-danger-fg">Puesto descubierto — Alerta máxima</span>
          </div>
          <div>
            <label className="text-[9px] text-slate-500 uppercase">Nota</label>
            <textarea
              value={localNotes}
              onChange={(e) => handleNotesChange(e.target.value)}
              placeholder="Motivo de ausencia..."
              rows={2}
              className="mt-0.5 w-full text-xs bg-slate-900 border border-slate-600 rounded-md px-2 py-1.5 text-slate-300 focus:border-status-info-border focus:outline-none resize-none"
            />
          </div>
        </div>
      )}

      {/* Con cobertura — replacement guard search */}
      {noVieneStep === "con_cobertura" && (
        <div className="space-y-2 pt-1 border-t border-status-ok-border/40">
          {guard.reemplazaDe ? (
            <div className="flex items-center gap-2 rounded-lg bg-status-ok-soft border border-status-ok-border px-3 py-2">
              <span className="w-2 h-2 rounded-full bg-status-ok" />
              <span className="text-[11px] text-status-ok-fg">
                Reemplazado por: <span className="font-semibold">{guard.reemplazaDe}</span>
              </span>
            </div>
          ) : (
            <>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold">Buscar reemplazo</p>
              <GuardiaSearchInput
                value={replacementName}
                onChange={(patch) => {
                  setReplacementName(patch.guardiaNombre);
                  if (patch.guardiaId) setReplacementId(patch.guardiaId);
                }}
                placeholder="Buscar guardia reemplazo..."
                className="h-8 text-xs bg-slate-900 border-slate-600"
                dropdownDirection="down"
              />
              <button
                onClick={handleReplacementConfirm}
                disabled={!replacementName.trim()}
                className={`w-full py-1.5 rounded-md text-xs font-medium transition-colors ${
                  replacementName.trim()
                    ? "bg-status-ok hover:bg-status-ok text-white"
                    : "bg-slate-800 text-slate-600 cursor-not-allowed"
                }`}
              >
                Confirmar reemplazo
              </button>
            </>
          )}
          <div>
            <label className="text-[9px] text-slate-500 uppercase">Nota</label>
            <textarea
              value={localNotes}
              onChange={(e) => handleNotesChange(e.target.value)}
              placeholder="Motivo de ausencia..."
              rows={2}
              className="mt-0.5 w-full text-xs bg-slate-900 border border-slate-600 rounded-md px-2 py-1.5 text-slate-300 focus:border-status-info-border focus:outline-none resize-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// GuardCardReadOnly — view-only version for observers
// ---------------------------------------------------------------------------

function GuardCardReadOnly({ guard }: { guard: GuardData }) {
  const statusLabel =
    STATUS_BUTTONS.find((b) => b.value === guard.status)?.label ??
    (guard.status === "reemplazo" ? "Reemplazo" : guard.status);

  const statusColor =
    guard.status === "presente" || guard.status === "reemplazo"
      ? "text-status-ok-fg"
      : guard.status === "no_viene"
        ? "text-status-danger-fg"
        : guard.status === "en_camino"
          ? "text-status-info-fg"
          : "text-slate-500";

  const cardBorder =
    guard.status === "no_viene"
      ? "bg-status-danger-soft/30 border-status-danger-border"
      : guard.status === "presente" || guard.status === "reemplazo"
        ? "bg-status-ok-soft/30 border-status-ok-border"
        : "bg-slate-800/40 border-slate-700/50";

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${cardBorder}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-200 font-medium">{guard.guardiaNombre}</span>
          {guard.isExtra && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-tint-violet text-tint-violet-fg">EXTRA</span>
          )}
        </div>
        <span className={`text-xs font-medium ${statusColor}`}>{statusLabel}</span>
      </div>
      {guard.horaLlegada && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500">Llegada:</span>
          <span className="font-mono text-slate-300">{guard.horaLlegada}</span>
        </div>
      )}
      {guard.notes && (
        <div className="text-xs text-slate-400 whitespace-pre-wrap">{guard.notes}</div>
      )}
      {guard.reemplazaDe && (
        <div className="text-xs text-slate-500">Reemplaza a: {guard.reemplazaDe}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// GuardPanel (main export)
// ---------------------------------------------------------------------------

export function GuardPanel({
  instalacion,
  turno,
  onClose,
  onGuardiaUpdate,
  onGuardiaAdd,
  onGuardiaDelete,
  isReadOnly,
}: GuardPanelProps) {
  const [visible, setVisible] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newGuardName, setNewGuardName] = useState("");
  const [newGuardId, setNewGuardId] = useState<string | null>(null);
  const [newIsExtra, setNewIsExtra] = useState(false);

  // Filter by turno — guards without turno default to "nocturno"
  const guardias = instalacion.guardias.filter((g) =>
    turno === "nocturno" ? g.turno === "nocturno" || !g.turno : g.turno === turno,
  );
  const presentes = guardias.filter(
    (g) => g.status === "presente" || g.status === "reemplazo",
  ).length;
  const requeridos =
    turno === "nocturno"
      ? instalacion.guardiasRequeridos
      : guardias.length || 1;

  // Animate in
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleClose = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 200);
  }, [onClose]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) handleClose();
    },
    [handleClose],
  );

  // Escape key closes panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleClose]);

  const handleAddGuard = useCallback(() => {
    if (!newGuardName.trim()) return;
    onGuardiaAdd({
      guardiaNombre: newGuardName.trim(),
      guardiaId: newGuardId,
      isExtra: newIsExtra,
      turno,
    });
    setNewGuardName("");
    setNewGuardId(null);
    setNewIsExtra(false);
    setShowAddForm(false);
  }, [newGuardName, newGuardId, newIsExtra, turno, onGuardiaAdd]);

  const turnoLabel =
    turno === "nocturno" ? "Guardias Nocturnos" : "Guardias de Día";
  const accentColor = turno === "nocturno" ? "teal" : "blue";

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${visible ? "opacity-100" : "opacity-0"}`}
        onClick={handleBackdropClick}
      />

      {/* Panel */}
      <div
        className={`relative w-[380px] h-full bg-slate-900 border-l border-slate-700 shadow-2xl flex flex-col transition-transform duration-200 ease-out ${
          visible ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 px-4 py-3 border-b border-slate-800 bg-slate-900 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-200">
                {instalacion.installationName}
              </h3>
              <div className="flex items-center gap-2 mt-0.5">
                <span
                  className={`text-xs font-medium ${accentColor === "teal" ? "text-status-info-fg" : "text-status-info-fg"}`}
                >
                  {turnoLabel}
                </span>
                <span
                  className={`text-xs font-mono ${
                    presentes >= requeridos
                      ? "text-status-ok-fg"
                      : presentes > 0
                        ? "text-status-warn-fg"
                        : "text-slate-500"
                  }`}
                >
                  {presentes}/{requeridos}
                </span>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-1.5 rounded-md text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Guard list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scrollbar-thin">
          {guardias.length === 0 && !showAddForm && (
            <div className="text-center py-8">
              <p className="text-xs text-slate-600">
                No hay guardias asignados
              </p>
            </div>
          )}

          {guardias.map((g) =>
            isReadOnly ? (
              <GuardCardReadOnly key={g.id} guard={g} />
            ) : (
              <GuardCard
                key={g.id}
                guard={g}
                onUpdate={(data) => onGuardiaUpdate(g.id, data)}
                onDelete={() => onGuardiaDelete(g.id)}
              />
            ),
          )}

        </div>

        {/* Footer — Add form or add button (outside overflow-y-auto so dropdown isn't clipped) */}
        {!isReadOnly && (
        <div className="sticky bottom-0 px-4 py-3 border-t border-slate-800 bg-slate-900 flex-shrink-0">
          {showAddForm ? (
            <div className="space-y-2">
              <GuardiaSearchInput
                value={newGuardName}
                onChange={(patch) => {
                  setNewGuardName(patch.guardiaNombre);
                  if (patch.guardiaId) setNewGuardId(patch.guardiaId);
                }}
                placeholder="Buscar guardia por nombre..."
                className="h-9 text-sm bg-slate-800 border-slate-600"
                dropdownDirection="up"
              />
              {/* Tipo: Planificado / Extra */}
              <div className="flex rounded-md overflow-hidden border border-slate-700">
                <button
                  type="button"
                  onClick={() => setNewIsExtra(false)}
                  className={`flex-1 py-1.5 text-[11px] font-medium transition-colors ${
                    !newIsExtra
                      ? `${accentColor === "teal" ? "bg-status-info" : "bg-status-info"} text-white`
                      : "bg-slate-800 text-slate-500 hover:text-slate-300"
                  }`}
                >
                  Planificado
                </button>
                <button
                  type="button"
                  onClick={() => setNewIsExtra(true)}
                  className={`flex-1 py-1.5 text-[11px] font-medium transition-colors ${
                    newIsExtra
                      ? "bg-tint-violet-fg text-white"
                      : "bg-slate-800 text-slate-500 hover:text-slate-300"
                  }`}
                >
                  Extra
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleAddGuard}
                  disabled={!newGuardName.trim()}
                  className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    newGuardName.trim()
                      ? `${accentColor === "teal" ? "bg-status-info hover:bg-status-info" : "bg-status-info hover:bg-status-info"} text-white`
                      : "bg-slate-800 text-slate-600 cursor-not-allowed"
                  }`}
                >
                  Agregar
                </button>
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setNewGuardName("");
                    setNewGuardId(null);
                    setNewIsExtra(false);
                  }}
                  className="px-3 py-1.5 rounded-md text-xs text-slate-500 hover:text-slate-300 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddForm(true)}
              className={`w-full flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium transition-colors ${
                accentColor === "teal"
                  ? "text-status-info-fg hover:bg-status-info-soft border border-status-info-border"
                  : "text-status-info-fg hover:bg-status-info-soft border border-status-info-border"
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              Agregar guardia {turno === "nocturno" ? "nocturno" : "de día"}
            </button>
          )}
        </div>
        )}
      </div>
    </div>
  );
}
