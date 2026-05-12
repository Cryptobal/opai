"use client";

import { useEffect, useState } from "react";
import { Ticket, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/opai/EmptyState";
import { SupervisorInstallation } from "@/lib/portal-supervisor";

interface TicketItem {
  id: string;
  code: string;
  title: string;
  status: string;
  priority: string;
  installationId: string | null;
  createdAt: string;
}

interface Props {
  installations: SupervisorInstallation[];
}

const PRIORITY_COLOR: Record<string, string> = {
  p1: "text-red-400",
  p2: "text-amber-400",
  p3: "text-blue-400",
  p4: "text-zinc-500",
};

const STATUS_LABEL: Record<string, string> = {
  open: "Abierto",
  in_progress: "En progreso",
  resolved: "Resuelto",
  closed: "Cerrado",
};

export function SupervisorTickets({ installations }: Props) {
  const [items, setItems] = useState<TicketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedInstallationId, setSelectedInstallationId] = useState(
    installations[0]?.id ?? ""
  );

  // Form
  const [formInstallId, setFormInstallId] = useState(installations[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("p3");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    load();
  }, [selectedInstallationId]);

  async function load() {
    setLoading(true);
    try {
      const params = selectedInstallationId
        ? `installationId=${selectedInstallationId}`
        : installations.map((i) => `installationId=${i.id}`).join("&");
      const res = await fetch(`/api/ops/tickets?${params}&status=open`);
      if (res.ok) {
        const json = await res.json();
        setItems(Array.isArray(json.data) ? json.data : []);
      }
    } catch {
      // noop
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!title.trim()) {
      toast.error("El título es requerido.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/ops/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          installationId: formInstallId || undefined,
          title: title.trim(),
          description: description.trim() || undefined,
          priority,
          assignedTeam: "operaciones",
          source: "portal_supervisor",
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Ticket creado");
        setShowCreate(false);
        setTitle("");
        setDescription("");
        await load();
      } else {
        toast.error(json.error ?? "Error");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-4 pb-24">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Tickets</h2>
        <button
          onClick={() => setShowCreate((s) => !s)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-700 text-white text-sm font-medium hover:bg-zinc-600 transition-colors"
        >
          <Plus size={14} />
          Nuevo
        </button>
      </div>

      {/* Installation filter */}
      {installations.length > 1 && (
        <select
          value={selectedInstallationId}
          onChange={(e) => setSelectedInstallationId(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-zinc-600"
        >
          <option value="">Todas las instalaciones</option>
          {installations.map((i) => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </select>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4 flex flex-col gap-3">
          <p className="text-sm font-medium text-zinc-200">Nuevo ticket</p>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] text-zinc-500">Instalación</label>
            <select
              value={formInstallId}
              onChange={(e) => setFormInstallId(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-zinc-600"
            >
              <option value="">Sin instalación</option>
              {installations.map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] text-zinc-500">Título *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Describe el problema..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] text-zinc-500">Descripción</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Detalle adicional..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600 resize-none"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] text-zinc-500">Prioridad</label>
            <div className="flex gap-2">
              {(["p1", "p2", "p3", "p4"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPriority(p)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    priority === p
                      ? "bg-zinc-700 text-white"
                      : "bg-zinc-950 border border-zinc-800 text-zinc-500"
                  }`}
                >
                  {p.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleCreate}
            disabled={submitting || !title.trim()}
            className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-zinc-700 text-white text-sm font-medium hover:bg-zinc-600 disabled:opacity-50 transition-colors"
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            Crear ticket
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="animate-spin text-zinc-600" size={24} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={<Ticket size={24} />} title="Sin tickets abiertos" compact />
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((t) => (
            <div
              key={t.id}
              className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 flex flex-col gap-1.5"
            >
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-mono font-medium ${PRIORITY_COLOR[t.priority] ?? "text-zinc-400"}`}>
                  {t.priority?.toUpperCase()}
                </span>
                <span className="text-[10px] text-zinc-500 font-mono">{t.code}</span>
                <span className="ml-auto text-[10px] text-zinc-500">
                  {STATUS_LABEL[t.status] ?? t.status}
                </span>
              </div>
              <p className="text-sm text-zinc-200">{t.title}</p>
              <p className="text-[10px] text-zinc-600">
                {new Date(t.createdAt).toLocaleDateString("es-CL")}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
