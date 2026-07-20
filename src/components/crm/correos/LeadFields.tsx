"use client";

import type { LeadExtraction } from "@/modules/crm/email/email-to-lead.types";

const INPUT =
  "h-9 w-full rounded-lg border border-ds-border-default bg-ds-surface-1 px-2.5 text-[13px]";

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

export function LeadFields({
  p,
  onChange,
}: {
  p: LeadExtraction;
  onChange: (next: LeadExtraction) => void;
}) {
  const set = (patch: Partial<LeadExtraction>) => onChange({ ...p, ...patch });
  const setC = (patch: Partial<LeadExtraction["contacto"]>) =>
    onChange({ ...p, contacto: { ...p.contacto, ...patch } });

  return (
    <div className="grid grid-cols-2 gap-2">
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
      <div>
        <Label>Teléfono</Label>
        <input className={INPUT} value={p.contacto.telefono ?? ""} onChange={(e) => setC({ telefono: e.target.value || null })} />
      </div>
      <div>
        <Label>Comuna instalación</Label>
        <input className={INPUT} value={p.instalacionComuna ?? ""} onChange={(e) => set({ instalacionComuna: e.target.value || null })} />
      </div>
      <div className="col-span-2">
        <Label conf={p.confianza.requerimiento}>Requerimiento</Label>
        <textarea className={`${INPUT} h-16 py-1.5`} value={p.requerimiento ?? ""} onChange={(e) => set({ requerimiento: e.target.value || null })} />
      </div>
      <div>
        <Label>Dotación estimada</Label>
        <input type="number" className={INPUT} value={p.dotacionEstimada ?? ""} onChange={(e) => set({ dotacionEstimada: e.target.value ? Number(e.target.value) : null })} />
      </div>
      <div>
        <Label conf={p.confianza.fechaLimite}>Fecha límite</Label>
        <input type="date" className={INPUT} value={p.fechaLimite ?? ""} onChange={(e) => set({ fechaLimite: e.target.value || null })} />
      </div>
      <label className="col-span-2 flex items-center gap-2 text-[13px] text-ds-text-2">
        <input type="checkbox" checked={p.esLicitacion} onChange={(e) => set({ esLicitacion: e.target.checked })} />
        Es una licitación
      </label>
    </div>
  );
}
