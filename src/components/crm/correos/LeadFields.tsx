"use client";

import { useState } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { MapsUrlPasteInput } from "@/components/ui/MapsUrlPasteInput";
import {
  WEEKDAYS_FULL,
  type LeadExtraction,
  type LeadExtractionPuesto,
} from "@/modules/crm/email/email-to-lead.types";

const INPUT =
  "h-10 sm:h-9 w-full rounded-lg border border-ds-border-default bg-ds-surface-1 px-2.5 text-[13px]";

function Conf({ v }: { v?: number }) {
  if (v == null) return null;
  return <span className="ml-1 font-mono text-[12px] text-ds-text-4">{Math.round(v * 100)}%</span>;
}

function Label({ children, conf }: { children: React.ReactNode; conf?: number }) {
  return (
    <label className="mb-0.5 block text-[12px] font-medium text-ds-text-3">
      {children}
      <Conf v={conf} />
    </label>
  );
}

function Section({
  title,
  badge,
  open,
  onToggle,
  children,
}: {
  title: string;
  badge?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-ds-border-subtle bg-ds-surface-1/40">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left ds-tap"
      >
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-ds-text-3 transition-transform ${open ? "" : "-rotate-90"}`}
        />
        <span className="text-[13px] font-semibold text-ds-text-1">{title}</span>
        {badge ? (
          <span className="ml-auto rounded-full bg-ds-surface-3 px-2 py-0.5 text-[12px] text-ds-text-3">
            {badge}
          </span>
        ) : null}
      </button>
      {open ? <div className="grid grid-cols-2 gap-2 border-t border-ds-border-subtle px-2.5 pb-2.5 pt-2">{children}</div> : null}
    </div>
  );
}

function emptyPuesto(): LeadExtractionPuesto {
  return {
    nombre: "Guardias",
    rol: "Guardia",
    descripcion: null,
    dias: [...WEEKDAYS_FULL],
    horaInicio: "08:00",
    horaFin: "20:00",
    numGuards: 1,
    numPuestos: 1,
    sueldoBruto: null,
  };
}

const DAY_SHORT: Record<string, string> = {
  lunes: "Lu",
  martes: "Ma",
  miercoles: "Mi",
  jueves: "Ju",
  viernes: "Vi",
  sabado: "Sa",
  domingo: "Do",
};

export function LeadFields({
  p,
  onChange,
}: {
  p: LeadExtraction;
  onChange: (next: LeadExtraction) => void;
}) {
  const [open, setOpen] = useState({
    contacto: true,
    instalacion: true,
    servicio: true,
    puestos: true,
  });

  const set = (patch: Partial<LeadExtraction>) => onChange({ ...p, ...patch });
  const setC = (patch: Partial<LeadExtraction["contacto"]>) =>
    onChange({ ...p, contacto: { ...p.contacto, ...patch } });

  const updatePuesto = (idx: number, patch: Partial<LeadExtractionPuesto>) => {
    const puestos = p.puestos.map((row, i) => (i === idx ? { ...row, ...patch } : row));
    const dotacionEstimada = puestos.reduce((acc, row) => acc + (row.numGuards ?? 0), 0) || null;
    onChange({ ...p, puestos, dotacionEstimada });
  };

  const toggleDay = (idx: number, day: string) => {
    const row = p.puestos[idx];
    if (!row) return;
    const has = row.dias.includes(day);
    const dias = has ? row.dias.filter((d) => d !== day) : [...row.dias, day];
    updatePuesto(idx, { dias: dias.length ? dias : [...WEEKDAYS_FULL] });
  };

  const guardsTotal = p.puestos.reduce((acc, row) => acc + (row.numGuards ?? 0), 0);

  return (
    <div className="space-y-2">
      <Section
        title="Contacto"
        open={open.contacto}
        onToggle={() => setOpen((s) => ({ ...s, contacto: !s.contacto }))}
      >
        <div className="col-span-2">
          <Label conf={p.confianza.empresa}>Empresa</Label>
          <input className={INPUT} value={p.empresa ?? ""} onChange={(e) => set({ empresa: e.target.value || null })} />
        </div>
        <div>
          <Label>RUT</Label>
          <input className={INPUT} value={p.rut ?? ""} onChange={(e) => set({ rut: e.target.value || null })} />
        </div>
        <div>
          <Label conf={p.confianza.contacto}>Contacto</Label>
          <input className={INPUT} value={p.contacto.nombre ?? ""} onChange={(e) => setC({ nombre: e.target.value || null })} />
        </div>
        <div>
          <Label>Cargo</Label>
          <input className={INPUT} value={p.contacto.cargo ?? ""} onChange={(e) => setC({ cargo: e.target.value || null })} />
        </div>
        <div>
          <Label>Email</Label>
          <input className={INPUT} value={p.contacto.email ?? ""} onChange={(e) => setC({ email: e.target.value || null })} />
        </div>
        <div className="col-span-2">
          <Label>Teléfono</Label>
          <input className={INPUT} value={p.contacto.telefono ?? ""} onChange={(e) => setC({ telefono: e.target.value || null })} />
        </div>
      </Section>

      <Section
        title="Instalación"
        badge={p.lat != null && p.lng != null ? "Maps OK" : p.mapsUrl ? "Link Maps" : undefined}
        open={open.instalacion}
        onToggle={() => setOpen((s) => ({ ...s, instalacion: !s.instalacion }))}
      >
        <div className="col-span-2">
          <Label>Nombre instalación</Label>
          <input
            className={INPUT}
            value={p.instalacionNombre ?? ""}
            onChange={(e) => set({ instalacionNombre: e.target.value || null })}
          />
        </div>
        <div className="col-span-2">
          <Label conf={p.confianza.direccion}>Dirección</Label>
          <input className={INPUT} value={p.direccion ?? ""} onChange={(e) => set({ direccion: e.target.value || null })} />
        </div>
        <div>
          <Label>Comuna</Label>
          <input
            className={INPUT}
            value={p.instalacionComuna ?? ""}
            onChange={(e) => set({ instalacionComuna: e.target.value || null })}
          />
        </div>
        <div>
          <Label>Ciudad</Label>
          <input className={INPUT} value={p.ciudad ?? ""} onChange={(e) => set({ ciudad: e.target.value || null })} />
        </div>
        <div className="col-span-2">
          <Label conf={p.confianza.mapsUrl}>Link Google Maps</Label>
          <input
            className={INPUT}
            value={p.mapsUrl ?? ""}
            placeholder="https://maps.app.goo.gl/… o google.com/maps/…"
            onChange={(e) => set({ mapsUrl: e.target.value || null, lat: null, lng: null })}
          />
          {p.lat != null && p.lng != null ? (
            <p className="mt-1 text-[12px] text-status-ok-fg">
              Coordenadas: {p.lat.toFixed(5)}, {p.lng.toFixed(5)}
            </p>
          ) : null}
          <div className="mt-2">
            <MapsUrlPasteInput
              onResolve={(r) =>
                set({
                  direccion: r.address || p.direccion,
                  ciudad: r.city || p.ciudad,
                  instalacionComuna: r.commune || p.instalacionComuna,
                  lat: r.lat,
                  lng: r.lng,
                  mapsUrl: p.mapsUrl || `https://www.google.com/maps?q=${r.lat},${r.lng}`,
                })
              }
            />
          </div>
        </div>
      </Section>

      <Section
        title="Servicio"
        badge={p.isOngoingService ? "Continuo" : p.mesesContrato ? `${p.mesesContrato} meses` : undefined}
        open={open.servicio}
        onToggle={() => setOpen((s) => ({ ...s, servicio: !s.servicio }))}
      >
        <div className="col-span-2">
          <Label>Nombre cotización</Label>
          <input
            className={INPUT}
            value={p.nombreCotizacion ?? ""}
            onChange={(e) => set({ nombreCotizacion: e.target.value || null })}
          />
        </div>
        <div className="col-span-2">
          <Label conf={p.confianza.requerimiento}>Requerimiento</Label>
          <textarea
            className={`${INPUT} h-16 py-1.5`}
            value={p.requerimiento ?? ""}
            onChange={(e) => set({ requerimiento: e.target.value || null })}
          />
        </div>
        <div className="col-span-2 flex flex-wrap items-center gap-3 text-[13px] text-ds-text-2">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={p.isOngoingService}
              onChange={() => set({ isOngoingService: true, mesesContrato: null })}
            />
            Continuo / indefinido
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={!p.isOngoingService}
              onChange={() => set({ isOngoingService: false, mesesContrato: p.mesesContrato ?? 12 })}
            />
            Plazo fijo
          </label>
          {!p.isOngoingService ? (
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={1}
                className={`${INPUT} w-20`}
                value={p.mesesContrato ?? ""}
                onChange={(e) => set({ mesesContrato: e.target.value ? Number(e.target.value) : null })}
              />
              <span className="text-ds-text-3">meses</span>
            </div>
          ) : null}
        </div>
        <div>
          <Label>Dotación total</Label>
          <input
            type="number"
            className={INPUT}
            value={p.dotacionEstimada ?? ""}
            onChange={(e) => set({ dotacionEstimada: e.target.value ? Number(e.target.value) : null })}
          />
        </div>
        <div>
          <Label conf={p.confianza.fechaLimite}>Fecha límite</Label>
          <input
            type="date"
            className={INPUT}
            value={p.fechaLimite ?? ""}
            onChange={(e) => set({ fechaLimite: e.target.value || null })}
          />
        </div>
        <label className="col-span-2 flex items-center gap-2 text-[13px] text-ds-text-2">
          <input type="checkbox" checked={p.esLicitacion} onChange={(e) => set({ esLicitacion: e.target.checked })} />
          Es una licitación
        </label>
      </Section>

      <Section
        title="Puestos"
        badge={
          p.puestos.length
            ? `${p.puestos.length} · ${guardsTotal || p.dotacionEstimada || 0} guardias`
            : undefined
        }
        open={open.puestos}
        onToggle={() => setOpen((s) => ({ ...s, puestos: !s.puestos }))}
      >
        <div className="col-span-2 space-y-2">
          {p.puestos.length === 0 ? (
            <p className="text-[13px] text-ds-text-3">Sin puestos. Agregá al menos uno o dejá que la IA proponga turnos.</p>
          ) : null}
          {p.puestos.map((row, idx) => (
            <div
              key={idx}
              className="space-y-2 rounded-lg border border-ds-border-subtle bg-ds-surface-2/50 p-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="grid flex-1 grid-cols-2 gap-2">
                  <div className="col-span-2 sm:col-span-1">
                    <Label>Nombre / servicio</Label>
                    <input
                      className={INPUT}
                      value={row.nombre ?? ""}
                      onChange={(e) => updatePuesto(idx, { nombre: e.target.value || null })}
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <Label>Rol</Label>
                    <input
                      className={INPUT}
                      value={row.rol ?? ""}
                      onChange={(e) => updatePuesto(idx, { rol: e.target.value || null })}
                    />
                  </div>
                  <div>
                    <Label>Inicio</Label>
                    <input
                      type="time"
                      className={INPUT}
                      value={row.horaInicio ?? "08:00"}
                      onChange={(e) => updatePuesto(idx, { horaInicio: e.target.value || null })}
                    />
                  </div>
                  <div>
                    <Label>Fin</Label>
                    <input
                      type="time"
                      className={INPUT}
                      value={row.horaFin ?? "20:00"}
                      onChange={(e) => updatePuesto(idx, { horaFin: e.target.value || null })}
                    />
                  </div>
                  <div>
                    <Label>Guardias</Label>
                    <input
                      type="number"
                      min={1}
                      className={INPUT}
                      value={row.numGuards ?? ""}
                      onChange={(e) =>
                        updatePuesto(idx, {
                          numGuards: e.target.value ? Number(e.target.value) : null,
                          numPuestos: e.target.value ? Number(e.target.value) : row.numPuestos,
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label>Sueldo bruto</Label>
                    <input
                      type="number"
                      min={0}
                      className={INPUT}
                      value={row.sueldoBruto ?? ""}
                      onChange={(e) =>
                        updatePuesto(idx, { sueldoBruto: e.target.value ? Number(e.target.value) : null })
                      }
                    />
                  </div>
                </div>
                <button
                  type="button"
                  className="mt-5 rounded-md p-2 text-ds-text-3 hover:text-status-danger-fg ds-tap"
                  title="Eliminar puesto"
                  onClick={() => {
                    const puestos = p.puestos.filter((_, i) => i !== idx);
                    onChange({
                      ...p,
                      puestos,
                      dotacionEstimada: puestos.reduce((a, r) => a + (r.numGuards ?? 0), 0) || null,
                    });
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                {WEEKDAYS_FULL.map((day) => {
                  const on = row.dias.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDay(idx, day)}
                      className={`h-8 min-w-[36px] rounded-md px-1.5 text-[12px] font-medium ds-tap ${
                        on
                          ? "bg-primary text-primary-foreground"
                          : "bg-ds-surface-3 text-ds-text-3"
                      }`}
                    >
                      {DAY_SHORT[day]}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => onChange({ ...p, puestos: [...p.puestos, emptyPuesto()] })}
            className="inline-flex h-10 sm:h-9 items-center gap-1.5 rounded-lg border border-ds-border-default px-3 text-[13px] text-ds-text-2 ds-tap"
          >
            <Plus className="h-4 w-4" /> Agregar puesto
          </button>
        </div>
      </Section>
    </div>
  );
}
