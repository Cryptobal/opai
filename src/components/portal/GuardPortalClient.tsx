"use client";

import React, { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Shield,
  Home,
  Ticket,
  CalendarDays,
  User,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  Fingerprint,
  FileText,
  Loader2,
  Send,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type GuardSession,
  type GuardScheduleDay,
  type GuardTicket,
  type PortalSection,
  PORTAL_BOTTOM_NAV,
  PORTAL_NAV_ITEMS,
  SHIFT_CODE_LABELS,
  formatRut,
  isValidRut,
  getGreeting,
} from "@/lib/guard-portal";
import {
  TICKET_TYPE_SEEDS,
  TICKET_STATUS_CONFIG,
  type TicketStatus,
} from "@/lib/tickets";

// ═══════════════════════════════════════════════════════════════
//  ICON MAP for bottom nav
// ═══════════════════════════════════════════════════════════════

const NAV_ICONS: Record<string, React.ReactNode> = {
  Home: <Home className="h-5 w-5" />,
  Ticket: <Ticket className="h-5 w-5" />,
  CalendarDays: <CalendarDays className="h-5 w-5" />,
  User: <User className="h-5 w-5" />,
};

// ═══════════════════════════════════════════════════════════════
//  GUARD PORTAL CLIENT
// ═══════════════════════════════════════════════════════════════

const SESSION_KEY = "guard_portal_session";

export function GuardPortalClient() {
  const [session, setSession] = useState<GuardSession | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = sessionStorage.getItem(SESSION_KEY);
      if (stored) return JSON.parse(stored) as GuardSession;
    } catch { /* ignore */ }
    return null;
  });
  const [activeSection, setActiveSection] = useState<PortalSection>("inicio");

  function handleLogin(s: GuardSession) {
    setSession(s);
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch { /* ignore */ }
  }

  function handleLogout() {
    setSession(null);
    setActiveSection("inicio");
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
    toast.success("Sesión cerrada correctamente");
  }

  if (!session) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-md mx-auto">
      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b px-4 py-3 flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">
            {session.firstName} {session.lastName}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {session.currentInstallationName ?? "Sin instalación"}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleLogout}
          aria-label="Cerrar sesión"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </header>

      {/* Active section content */}
      <main className="flex-1 overflow-y-auto pb-20">
        {activeSection === "inicio" && (
          <InicioSection session={session} onNavigate={setActiveSection} />
        )}
        {activeSection === "solicitudes" && (
          <SolicitudesSection session={session} />
        )}
        {activeSection === "pauta" && <PautaSection session={session} />}
        {activeSection === "perfil" && (
          <PerfilSection session={session} onLogout={handleLogout} />
        )}
      </main>

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-background/95 backdrop-blur border-t max-w-md mx-auto">
        <div className="flex items-center justify-around py-2">
          {PORTAL_BOTTOM_NAV.map((sectionKey) => {
            const navItem = PORTAL_NAV_ITEMS.find((n) => n.key === sectionKey);
            if (!navItem) return null;
            const isActive = activeSection === sectionKey;
            return (
              <button
                key={sectionKey}
                onClick={() => setActiveSection(sectionKey)}
                className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-colors ${
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {NAV_ICONS[navItem.icon] ?? <Home className="h-5 w-5" />}
                <span className="text-[10px] font-medium">{navItem.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  LOGIN SCREEN
// ═══════════════════════════════════════════════════════════════

function LoginScreen({ onLogin }: { onLogin: (s: GuardSession) => void }) {
  const [rut, setRut] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleRutChange(e: React.ChangeEvent<HTMLInputElement>) {
    const formatted = formatRut(e.target.value);
    if (formatted.replace(/-/g, "").length <= 9) {
      setRut(formatted);
    }
  }

  function handlePinChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value.replace(/\D/g, "").slice(0, 6);
    setPin(val);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isValidRut(rut)) {
      setError("RUT inválido. Ingresa un RUT válido.");
      return;
    }
    if (pin.length < 4) {
      setError("El PIN debe tener al menos 4 dígitos.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/portal/guardia/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rut: rut.replace(/\./g, ""), pin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Error al iniciar sesión.");
        return;
      }
      const sessionData = (data.data ?? data.session) as GuardSession | undefined;
      if (!sessionData || !sessionData.guardiaId) {
        console.error("[Portal] Respuesta inesperada del servidor:", data);
        setError("Error al procesar la respuesta. Intenta nuevamente.");
        return;
      }
      toast.success("Sesión iniciada correctamente");
      onLogin(sessionData);
    } catch (err) {
      console.error("[Portal] Error de conexión:", err);
      setError("Error de conexión. Intenta nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center px-6 max-w-md mx-auto">
      <div className="w-full space-y-8">
        {/* Logo / Icon */}
        <div className="flex flex-col items-center gap-3">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold text-white">Portal del Guardia</h1>
            <p className="text-sm text-slate-400 mt-1">
              Ingresa tus credenciales para acceder
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="rut" className="text-slate-300">
              RUT
            </Label>
            <Input
              id="rut"
              placeholder="12345678-9"
              value={rut}
              onChange={handleRutChange}
              className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 h-12 text-base"
              autoComplete="username"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pin" className="text-slate-300">
              PIN
            </Label>
            <Input
              id="pin"
              type="password"
              inputMode="numeric"
              placeholder="****"
              value={pin}
              onChange={handlePinChange}
              maxLength={6}
              className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 h-12 text-base tracking-widest"
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5">
              <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <Button
            type="submit"
            disabled={loading || !rut || pin.length < 4}
            className="w-full h-12 text-base font-semibold"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Ingresando...
              </>
            ) : (
              "Ingresar"
            )}
          </Button>
        </form>

        {/* Footer */}
        <p className="text-center text-xs text-slate-500">
          Gard Security &mdash; Portal de autoservicio
        </p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  INICIO SECTION
// ═══════════════════════════════════════════════════════════════

function InicioSection({
  session,
  onNavigate,
}: {
  session: GuardSession;
  onNavigate: (s: PortalSection) => void;
}) {
  const greeting = getGreeting();
  const [ticketCount, setTicketCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(
          `/api/portal/guardia/tickets?guardiaId=${session.guardiaId}`
        );
        if (res.ok && !cancelled) {
          const data = await res.json();
          const tickets = data.data ?? data.tickets ?? [];
          setTicketCount(tickets.length);
        }
      } catch { /* ignore */ }
    }
    load();
    return () => { cancelled = true; };
  }, [session.guardiaId]);

  return (
    <div className="px-4 py-5 space-y-5">
      {/* Greeting */}
      <div>
        <h2 className="text-lg font-semibold">
          {greeting}, {session.firstName}
        </h2>
        <p className="text-sm text-muted-foreground">
          Bienvenido a tu portal de autoservicio
        </p>
      </div>

      {/* Próximo turno */}
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Próximo turno</h3>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-2xl font-bold tabular-nums">07:00</p>
            <p className="text-xs text-muted-foreground">Mañana</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium">
              {session.currentInstallationName ?? "Sin asignar"}
            </p>
            <p className="text-xs text-muted-foreground">07:00 - 19:00</p>
          </div>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border bg-card p-3 shadow-sm text-center">
          <p className="text-2xl font-bold text-emerald-500">92%</p>
          <p className="text-[11px] text-muted-foreground leading-tight mt-1">
            Asistencia mes
          </p>
        </div>
        <div className="rounded-xl border bg-card p-3 shadow-sm text-center">
          <p className="text-2xl font-bold text-blue-500">3</p>
          <p className="text-[11px] text-muted-foreground leading-tight mt-1">
            Turnos extra
          </p>
        </div>
        <div className="rounded-xl border bg-card p-3 shadow-sm text-center">
          <p className="text-2xl font-bold text-amber-500">{ticketCount ?? "—"}</p>
          <p className="text-[11px] text-muted-foreground leading-tight mt-1">
            Solicitudes
          </p>
        </div>
      </div>

      {/* Acciones rápidas */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Acciones rápidas</h3>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => onNavigate("solicitudes")}
            className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm hover:bg-accent transition-colors text-left"
          >
            <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
              <Ticket className="h-5 w-5 text-amber-500" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">Solicitudes</p>
              <p className="text-[11px] text-muted-foreground">Crear o ver</p>
            </div>
          </button>

          <button
            onClick={() => onNavigate("pauta")}
            className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm hover:bg-accent transition-colors text-left"
          >
            <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
              <CalendarDays className="h-5 w-5 text-blue-500" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">Mi Pauta</p>
              <p className="text-[11px] text-muted-foreground">Calendario</p>
            </div>
          </button>

          <button
            onClick={() => onNavigate("perfil")}
            className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm hover:bg-accent transition-colors text-left"
          >
            <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
              <User className="h-5 w-5 text-purple-500" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">Perfil</p>
              <p className="text-[11px] text-muted-foreground">Mis datos</p>
            </div>
          </button>

          <button
            onClick={() => onNavigate("inicio")}
            className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm hover:bg-accent transition-colors text-left"
          >
            <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
              <Fingerprint className="h-5 w-5 text-emerald-500" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">Marcaciones</p>
              <p className="text-[11px] text-muted-foreground">Historial</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  SOLICITUDES SECTION
// ═══════════════════════════════════════════════════════════════

const GUARD_TICKET_TYPES = TICKET_TYPE_SEEDS.filter(
  (t) => t.origin === "guard" || t.origin === "both"
);

function SolicitudesSection({ session }: { session: GuardSession }) {
  const [tickets, setTickets] = useState<GuardTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [selectedType, setSelectedType] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedTicket, setSelectedTicket] = useState<GuardTicket | null>(null);
  const [appealComment, setAppealComment] = useState("");
  const [appealLoading, setAppealLoading] = useState(false);

  const fetchTickets = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/portal/guardia/tickets?guardiaId=${session.guardiaId}`
      );
      if (res.ok) {
        const data = await res.json();
        setTickets(data.data ?? data.tickets ?? []);
      }
    } catch {
      toast.error("Error al cargar solicitudes");
    } finally {
      setLoading(false);
    }
  }, [session.guardiaId]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  async function handleCreateTicket(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedType || !title.trim()) return;

    setFormLoading(true);
    try {
      const res = await fetch("/api/portal/guardia/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guardiaId: session.guardiaId,
          tenantId: session.tenantId,
          typeSlug: selectedType,
          title: title.trim(),
          description: description.trim() || null,
        }),
      });
      if (res.ok) {
        toast.success("Solicitud creada correctamente");
        setShowForm(false);
        setSelectedType("");
        setTitle("");
        setDescription("");
        setLoading(true);
        fetchTickets();
      } else {
        const data = await res.json();
        toast.error(data.error ?? "Error al crear solicitud");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setFormLoading(false);
    }
  }

  function getStatusBadge(status: string) {
    const config = TICKET_STATUS_CONFIG[status as TicketStatus];
    if (!config) {
      return <Badge variant="secondary">{status}</Badge>;
    }
    return <Badge variant={config.variant}>{config.label}</Badge>;
  }

  async function handleAppeal() {
    if (!selectedTicket || !appealComment.trim()) return;
    setAppealLoading(true);
    try {
      const res = await fetch(`/api/portal/guardia/tickets/${selectedTicket.id}/appeal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guardiaId: session.guardiaId, comment: appealComment.trim() }),
      });
      if (res.ok) {
        toast.success("Apelacion enviada");
        setSelectedTicket(null);
        setAppealComment("");
        setLoading(true);
        fetchTickets();
      } else {
        const data = await res.json();
        toast.error(data.error ?? "Error al apelar");
      }
    } catch {
      toast.error("Error de conexion");
    } finally {
      setAppealLoading(false);
    }
  }

  async function handleAcceptRejection() {
    if (!selectedTicket) return;
    setAppealLoading(true);
    try {
      const res = await fetch(`/api/portal/guardia/tickets/${selectedTicket.id}/accept-rejection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guardiaId: session.guardiaId }),
      });
      if (res.ok) {
        toast.success("Rechazo aceptado, ticket cerrado");
        setSelectedTicket(null);
        setLoading(true);
        fetchTickets();
      } else {
        const data = await res.json();
        toast.error(data.error ?? "Error");
      }
    } catch {
      toast.error("Error de conexion");
    } finally {
      setAppealLoading(false);
    }
  }

  return (
    <div className="px-4 py-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Mis Solicitudes</h2>
        <Button
          size="sm"
          onClick={() => setShowForm(!showForm)}
          variant={showForm ? "outline" : "default"}
        >
          {showForm ? (
            "Cancelar"
          ) : (
            <>
              <Plus className="h-4 w-4" />
              Nueva
            </>
          )}
        </Button>
      </div>

      {/* Create form */}
      {showForm && (
        <form
          onSubmit={handleCreateTicket}
          className="rounded-xl border bg-card p-4 shadow-sm space-y-4"
        >
          <h3 className="text-sm font-semibold">Nueva solicitud</h3>

          <div className="space-y-2">
            <Label htmlFor="ticket-type">Tipo de solicitud</Label>
            <select
              id="ticket-type"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">Selecciona un tipo...</option>
              {GUARD_TICKET_TYPES.map((t) => (
                <option key={t.slug} value={t.slug}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ticket-title">Título</Label>
            <Input
              id="ticket-title"
              placeholder="Describe brevemente tu solicitud"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ticket-desc">Descripción (opcional)</Label>
            <textarea
              id="ticket-desc"
              rows={3}
              placeholder="Detalla tu solicitud..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
          </div>

          <Button
            type="submit"
            disabled={formLoading || !selectedType || !title.trim()}
            className="w-full"
          >
            {formLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Enviar solicitud
              </>
            )}
          </Button>
        </form>
      )}

      {/* Ticket detail view or ticket list */}
      {selectedTicket ? (
        <div className="space-y-4">
          <Button variant="ghost" size="sm" onClick={() => { setSelectedTicket(null); setAppealComment(""); }}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            Volver
          </Button>
          <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">{selectedTicket.title}</p>
                <p className="text-xs text-muted-foreground">{selectedTicket.code} &middot; {selectedTicket.typeName}</p>
              </div>
              {getStatusBadge(selectedTicket.status)}
            </div>
            <p className="text-xs text-muted-foreground">
              Creado: {new Date(selectedTicket.createdAt).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" })}
            </p>
          </div>

          {selectedTicket.status === "rejected" && (
            <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
              <p className="text-sm font-medium text-red-400">Este ticket fue rechazado</p>
              <p className="text-xs text-muted-foreground">Puedes apelar el rechazo o aceptarlo y cerrar el ticket.</p>

              <div className="space-y-2">
                <Label htmlFor="appeal-comment">Comentario de apelacion</Label>
                <textarea
                  id="appeal-comment"
                  rows={3}
                  placeholder="Explica por que deseas apelar..."
                  value={appealComment}
                  onChange={(e) => setAppealComment(e.target.value)}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleAppeal}
                  disabled={appealLoading || !appealComment.trim()}
                  className="flex-1"
                >
                  {appealLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
                  Apelar rechazo
                </Button>
                <Button
                  variant="outline"
                  onClick={handleAcceptRejection}
                  disabled={appealLoading}
                  className="flex-1"
                >
                  Aceptar rechazo
                </Button>
              </div>
            </div>
          )}

          {selectedTicket.status === "pending_approval" && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 shadow-sm">
              <p className="text-sm text-amber-400">Tu solicitud esta pendiente de aprobacion</p>
            </div>
          )}
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : tickets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
            <FileText className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">
            No tienes solicitudes
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Crea una nueva solicitud con el boton de arriba
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket) => (
            <div
              key={ticket.id}
              onClick={() => setSelectedTicket(ticket)}
              className="rounded-xl border bg-card p-4 shadow-sm space-y-2 cursor-pointer hover:bg-accent transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">
                    {ticket.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {ticket.code} &middot; {ticket.typeName}
                  </p>
                </div>
                {getStatusBadge(ticket.status)}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {new Date(ticket.createdAt).toLocaleDateString("es-CL", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  PAUTA SECTION (Calendar)
// ═══════════════════════════════════════════════════════════════

function PautaSection({ session }: { session: GuardSession }) {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [schedule, setSchedule] = useState<GuardScheduleDay[]>([]);
  const [loading, setLoading] = useState(true);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-indexed
  const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;

  const monthLabel = currentDate.toLocaleDateString("es-CL", {
    month: "long",
    year: "numeric",
  });

  // Fetch schedule when month changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    async function load() {
      try {
        const res = await fetch(
          `/api/portal/guardia/schedule?guardiaId=${session.guardiaId}&month=${monthStr}`
        );
        if (res.ok && !cancelled) {
          const data = await res.json();
          setSchedule(data.schedule ?? []);
        }
      } catch {
        if (!cancelled) toast.error("Error al cargar pauta");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [session.guardiaId, monthStr]);

  function prevMonth() {
    setCurrentDate((d) => {
      const next = new Date(d);
      next.setMonth(next.getMonth() - 1);
      return next;
    });
  }

  function nextMonth() {
    setCurrentDate((d) => {
      const next = new Date(d);
      next.setMonth(next.getMonth() + 1);
      return next;
    });
  }

  // Build calendar grid
  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const startDayOfWeek = firstDayOfMonth.getDay(); // 0=Sun
  const daysInMonth = lastDayOfMonth.getDate();

  // Map schedule by date for quick lookup
  const scheduleMap = new Map<string, GuardScheduleDay>();
  schedule.forEach((s) => {
    // Normalize date to YYYY-MM-DD
    const dateKey = s.date.slice(0, 10);
    scheduleMap.set(dateKey, s);
  });

  const DAY_NAMES = ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sa"];

  const calendarCells: Array<{ day: number | null; scheduleDay: GuardScheduleDay | null }> = [];

  // Leading empty cells
  for (let i = 0; i < startDayOfWeek; i++) {
    calendarCells.push({ day: null, scheduleDay: null });
  }

  // Day cells
  for (let d = 1; d <= daysInMonth; d++) {
    const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    calendarCells.push({
      day: d,
      scheduleDay: scheduleMap.get(dateKey) ?? null,
    });
  }

  return (
    <div className="px-4 py-5 space-y-4">
      {/* Month selector */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={prevMonth}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-base font-semibold capitalize">{monthLabel}</h2>
        <Button variant="ghost" size="icon" onClick={nextMonth}>
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Calendar grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden overflow-x-auto">
          <div className="min-w-[320px]">
          {/* Day header */}
          <div className="grid grid-cols-7 border-b">
            {DAY_NAMES.map((name) => (
              <div
                key={name}
                className="text-center text-[10px] sm:text-[11px] font-medium text-muted-foreground py-2"
              >
                {name}
              </div>
            ))}
          </div>

          {/* Calendar body */}
          <div className="grid grid-cols-7">
            {calendarCells.map((cell, idx) => {
              const isToday =
                cell.day !== null &&
                new Date().getDate() === cell.day &&
                new Date().getMonth() === month &&
                new Date().getFullYear() === year;

              const shiftCode = cell.scheduleDay?.shiftCode;
              const shiftConfig = shiftCode
                ? SHIFT_CODE_LABELS[shiftCode]
                : null;

              return (
                <div
                  key={idx}
                  className={`relative flex flex-col items-center justify-center py-2.5 border-b border-r ${
                    cell.day === null ? "bg-muted/30" : ""
                  } ${isToday ? "bg-primary/5" : ""}`}
                >
                  {cell.day !== null && (
                    <>
                      <span
                        className={`text-xs font-medium ${
                          isToday
                            ? "text-primary font-bold"
                            : "text-foreground"
                        }`}
                      >
                        {cell.day}
                      </span>
                      {shiftConfig && (
                        <span
                          className={`mt-0.5 h-2 w-2 rounded-full ${shiftConfig.color}`}
                          title={shiftConfig.label}
                        />
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <h3 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
          Leyenda
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(SHIFT_CODE_LABELS).map(([code, config]) => (
            <div key={code} className="flex items-center gap-2">
              <span className={`h-3 w-3 rounded-full shrink-0 ${config.color}`} />
              <span className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{code}</span>{" "}
                &mdash; {config.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  PERFIL SECTION
// ═══════════════════════════════════════════════════════════════

interface GuardProfile {
  firstName: string;
  lastName: string;
  rut: string;
  email: string | null;
  phone: string | null;
  code: string | null;
  status: string;
  installationName: string | null;
  hireDate: string | null;
}

function PerfilSection({
  session,
  onLogout,
}: {
  session: GuardSession;
  onLogout: () => void;
}) {
  const [profile, setProfile] = useState<GuardProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(
          `/api/portal/guardia/profile?guardiaId=${session.guardiaId}`
        );
        if (res.ok && !cancelled) {
          const data = await res.json();
          setProfile(data.data ?? data.profile ?? null);
        }
      } catch {
        if (!cancelled) toast.error("Error al cargar perfil");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [session.guardiaId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const fields: { label: string; value: string | null }[] = profile
    ? [
        { label: "Nombre", value: `${profile.firstName} ${profile.lastName}` },
        { label: "RUT", value: profile.rut },
        { label: "Email", value: profile.email },
        { label: "Teléfono", value: profile.phone },
        { label: "Código", value: profile.code },
        { label: "Estado", value: profile.status },
        { label: "Instalación", value: profile.installationName },
        {
          label: "Fecha contratación",
          value: profile.hireDate
            ? new Date(profile.hireDate).toLocaleDateString("es-CL", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })
            : null,
        },
      ]
    : [];

  return (
    <div className="px-4 py-5 space-y-5">
      {/* Avatar / Header */}
      <div className="flex flex-col items-center gap-3">
        <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
          <User className="h-10 w-10 text-primary" />
        </div>
        {profile && (
          <>
            <h2 className="text-lg font-semibold text-center">
              {profile.firstName} {profile.lastName}
            </h2>
            <p className="text-sm text-muted-foreground">
              {profile.installationName ?? "Sin instalación asignada"}
            </p>
          </>
        )}
      </div>

      {/* Profile fields */}
      {profile && (
        <div className="rounded-xl border bg-card shadow-sm divide-y">
          {fields.map((field) => (
            <div
              key={field.label}
              className="flex items-center justify-between px-4 py-3"
            >
              <span className="text-sm text-muted-foreground">
                {field.label}
              </span>
              <span className="text-sm font-medium text-foreground text-right max-w-[60%] truncate">
                {field.value ?? "—"}
              </span>
            </div>
          ))}
        </div>
      )}

      {!profile && !loading && (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <AlertTriangle className="h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            No se pudo cargar tu perfil.
          </p>
        </div>
      )}

      {/* Logout */}
      <Button
        variant="outline"
        onClick={onLogout}
        className="w-full text-destructive border-destructive/30 hover:bg-destructive/10"
      >
        <LogOut className="h-4 w-4" />
        Cerrar sesión
      </Button>
    </div>
  );
}
