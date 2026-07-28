"use client";

/**
 * Mockup interactivo — RSVP de invitaciones de calendario en Correo OPAI.
 * Solo UI de producto; no llama APIs ni persiste estado.
 * Ruta: /opai-ds-playground/correo-rsvp
 */

import { useState } from "react";
import Link from "next/link";
import {
  Archive,
  CalendarDays,
  Check,
  Clock,
  ExternalLink,
  HelpCircle,
  Mail,
  MapPin,
  Moon,
  Star,
  Sun,
  Tag as TagIcon,
  Trash2,
  Users,
  Video,
  X,
} from "lucide-react";
import { IconBubble, Surface, Tag } from "@/components/opai-ds";

type Rsvp = "needs_action" | "accepted" | "tentative" | "declined";

const INVITE = {
  title: "Revisión Proceso de Acreditación - Gard Security",
  when: "mié 30 jul · 11:00–11:30",
  timezone: "America/Santiago",
  organizer: "Rojas Veliz, Rodrigo Ignacio",
  organizerEmail: "rodrigo.rojas@cliente.cl",
  location: "Microsoft Teams",
  joinUrl: "https://teams.microsoft.com/l/meetup-join/…",
  attendees: 4,
  source: "Outlook / Teams",
} as const;

function RsvpButton({
  label,
  icon: Icon,
  active,
  variant,
  onClick,
}: {
  label: string;
  icon: typeof Check;
  active: boolean;
  variant: "ok" | "warn" | "danger";
  onClick: () => void;
}) {
  const activeCls =
    variant === "ok"
      ? "border-status-ok-border bg-status-ok-soft text-status-ok-fg"
      : variant === "warn"
        ? "border-status-warn-border bg-status-warn-soft text-status-warn-fg"
        : "border-status-danger-border bg-status-danger-soft text-status-danger-fg";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-10 min-w-[96px] flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 text-[13px] font-medium ds-tap transition-colors sm:flex-none ${
        active
          ? activeCls
          : "border-ds-border-default bg-ds-surface-1 text-ds-text-2 hover:bg-ds-surface-2"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </button>
  );
}

function InviteRsvpCard({
  status,
  onRespond,
}: {
  status: Rsvp;
  onRespond: (next: Rsvp) => void;
}) {
  const statusLabel =
    status === "accepted"
      ? "Vas a asistir"
      : status === "tentative"
        ? "Marcado como quizás"
        : status === "declined"
          ? "No vas a asistir"
          : "¿Asistirás?";

  const statusVariant =
    status === "accepted" ? "ok" : status === "tentative" ? "warn" : status === "declined" ? "danger" : "neutral";

  return (
    <Surface elevation={1} padding="md" className="space-y-3">
      <div className="flex items-start gap-3">
        <IconBubble icon={CalendarDays} variant="brand" size="md" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display text-[15px] font-semibold leading-snug text-ds-text-1">
              {INVITE.title}
            </p>
            <Tag variant={statusVariant as "ok" | "warn" | "danger" | "neutral"} size="sm">
              {statusLabel}
            </Tag>
          </div>
          <p className="text-[13px] text-ds-text-2">{INVITE.when}</p>
          <p className="text-[12px] text-ds-text-4">{INVITE.timezone}</p>
        </div>
      </div>

      <div className="space-y-1.5 rounded-xl border border-ds-border-subtle bg-ds-surface-2 px-3 py-2.5 text-[13px]">
        <div className="flex items-center gap-2 text-ds-text-2">
          <Users className="h-3.5 w-3.5 shrink-0 text-ds-text-4" />
          <span className="truncate">
            Organiza <span className="font-medium text-ds-text-1">{INVITE.organizer}</span>
          </span>
        </div>
        <div className="flex items-center gap-2 text-ds-text-2">
          <Video className="h-3.5 w-3.5 shrink-0 text-ds-text-4" />
          <span className="truncate">{INVITE.location}</span>
          <a
            href={INVITE.joinUrl}
            onClick={(e) => e.preventDefault()}
            className="ml-auto inline-flex items-center gap-1 text-[12px] font-medium text-primary ds-tap"
          >
            Unirse <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <div className="flex items-center gap-2 text-ds-text-3">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-ds-text-4" />
          <span>
            {INVITE.attendees} invitados · vía {INVITE.source}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <RsvpButton
          label="Sí"
          icon={Check}
          active={status === "accepted"}
          variant="ok"
          onClick={() => onRespond("accepted")}
        />
        <RsvpButton
          label="Quizás"
          icon={HelpCircle}
          active={status === "tentative"}
          variant="warn"
          onClick={() => onRespond("tentative")}
        />
        <RsvpButton
          label="No"
          icon={X}
          active={status === "declined"}
          variant="danger"
          onClick={() => onRespond("declined")}
        />
      </div>

      {status !== "needs_action" ? (
        <p className="text-[12px] text-ds-text-3">
          {status === "accepted"
            ? "Respuesta enviada al organizador. El evento se sincroniza con tu Agenda OPAI y Google Calendar."
            : status === "tentative"
              ? "Respuesta enviada. Podés cambiarla cuando quieras."
              : "Avisamos al organizador. El evento no ocupará tu agenda."}
        </p>
      ) : (
        <p className="text-[12px] text-ds-text-4">
          Al aceptar, OPAI responde la invitación (como Gmail) y deja el evento en tu Agenda.
        </p>
      )}
    </Surface>
  );
}

const INBOX = [
  {
    id: "1",
    from: "Rojas Veliz, Rodrigo Ignacio",
    subject: "Revisión Proceso de Acreditación - Gard Security",
    preview: "Estimados, Junto con saludar, les envío la invitación…",
    time: "10:42",
    tag: "Invitación",
    active: true,
  },
  {
    id: "2",
    from: "María Contreras",
    subject: "Cotización puesto nocturno — Mall Plaza",
    preview: "Adjunto la propuesta actualizada con 2 turnos…",
    time: "Ayer",
    tag: "Crear lead",
    active: false,
  },
  {
    id: "3",
    from: "Operaciones Gard",
    subject: "PPC cubierta — Instalación Los Dominicos",
    preview: "Confirmamos cobertura del turno 20:00–08:00…",
    time: "Ayer",
    tag: null,
    active: false,
  },
] as const;

export default function CorreoRsvpMockupPage() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [rsvp, setRsvp] = useState<Rsvp>("needs_action");
  const [variant, setVariant] = useState<"gmail" | "compact">("gmail");

  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }

  return (
    <div className="ds-page-enter min-h-dvh bg-ds-surface-0 text-ds-text-1">
      <header className="sticky top-0 z-10 border-b border-ds-border-subtle bg-ds-surface-1/90 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
          <Link
            href="/opai-ds-playground"
            className="text-[13px] font-medium text-ds-text-3 hover:text-ds-text-1"
          >
            ← Playground
          </Link>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[15px] font-semibold">Mockup · RSVP en Correo</p>
            <p className="truncate text-[12px] text-ds-text-4">
              Invitaciones de calendario con Sí / Quizás / No, estilo Gmail, dentro del lector OPAI
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-ds-border-default p-0.5">
              <button
                type="button"
                onClick={() => setVariant("gmail")}
                className={`h-9 rounded-lg px-3 text-[12px] font-medium ds-tap ${
                  variant === "gmail" ? "bg-ds-surface-3 text-ds-text-1" : "text-ds-text-3"
                }`}
              >
                Card completa
              </button>
              <button
                type="button"
                onClick={() => setVariant("compact")}
                className={`h-9 rounded-lg px-3 text-[12px] font-medium ds-tap ${
                  variant === "compact" ? "bg-ds-surface-3 text-ds-text-1" : "text-ds-text-3"
                }`}
              >
                Barra compacta
              </button>
            </div>
            <button
              type="button"
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-ds-border-default bg-ds-surface-1 text-ds-text-2 ds-tap"
              aria-label="Cambiar tema"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => setRsvp("needs_action")}
              className="h-10 rounded-xl border border-ds-border-default px-3 text-[12px] font-medium text-ds-text-2 ds-tap"
            >
              Reset
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-0 lg:grid-cols-[280px_1fr]">
        {/* Lista inbox falsa */}
        <aside className="hidden border-r border-ds-border-subtle lg:block">
          <div className="flex items-center gap-2 border-b border-ds-border-subtle px-3 py-3">
            <Mail className="h-4 w-4 text-primary" />
            <span className="text-[13px] font-semibold">Bandeja</span>
          </div>
          <ul className="divide-y divide-ds-border-subtle">
            {INBOX.map((row) => (
              <li
                key={row.id}
                className={`px-3 py-3 ${row.active ? "bg-ds-surface-2" : "bg-ds-surface-0"}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-[13px] font-medium text-ds-text-1">{row.from}</p>
                  <span className="shrink-0 text-[12px] text-ds-text-4">{row.time}</span>
                </div>
                <p className="truncate text-[13px] text-ds-text-2">{row.subject}</p>
                <div className="mt-1 flex items-center gap-2">
                  {row.tag ? (
                    <Tag variant={row.tag === "Invitación" ? "info" : "warn"} size="sm">
                      {row.tag}
                    </Tag>
                  ) : null}
                  <p className="truncate text-[12px] text-ds-text-4">{row.preview}</p>
                </div>
              </li>
            ))}
          </ul>
        </aside>

        {/* Lector */}
        <section className="min-w-0">
          <div className="flex flex-wrap items-center gap-1 border-b border-ds-border-subtle px-3 py-2 text-ds-text-3">
            {[Trash2, Archive, Mail, Star, TagIcon, Clock].map((Icon, i) => (
              <span
                key={i}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg"
              >
                <Icon className="h-4 w-4" />
              </span>
            ))}
            <Tag variant="neutral" size="sm" className="ml-2">
              Gard Security
            </Tag>
            <Tag variant="info" size="sm">
              Copiloto
            </Tag>
          </div>

          <div className="space-y-4 p-4 sm:p-5">
            <div>
              <h1 className="font-display text-lg font-semibold tracking-tight text-ds-text-1 sm:text-xl">
                {INVITE.title}
              </h1>
              <p className="mt-1 text-[13px] text-ds-text-3">
                De <span className="font-medium text-ds-text-1">{INVITE.organizer}</span>
                <span className="text-ds-text-4"> · {INVITE.organizerEmail}</span>
              </p>
            </div>

            {variant === "gmail" ? (
              <InviteRsvpCard status={rsvp} onRespond={setRsvp} />
            ) : (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-ds-border-subtle bg-ds-surface-1 px-3 py-2.5">
                <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-ds-text-1">{INVITE.title}</p>
                  <p className="truncate text-[12px] text-ds-text-3">{INVITE.when}</p>
                </div>
                <div className="flex gap-1.5">
                  <RsvpButton
                    label="Sí"
                    icon={Check}
                    active={rsvp === "accepted"}
                    variant="ok"
                    onClick={() => setRsvp("accepted")}
                  />
                  <RsvpButton
                    label="Quizás"
                    icon={HelpCircle}
                    active={rsvp === "tentative"}
                    variant="warn"
                    onClick={() => setRsvp("tentative")}
                  />
                  <RsvpButton
                    label="No"
                    icon={X}
                    active={rsvp === "declined"}
                    variant="danger"
                    onClick={() => setRsvp("declined")}
                  />
                </div>
              </div>
            )}

            <Surface elevation={1} padding="md" className="space-y-3 bg-ds-surface-1">
              <p className="text-[13px] leading-relaxed text-ds-text-2">
                Estimados,
              </p>
              <p className="text-[13px] leading-relaxed text-ds-text-2">
                Junto con saludar, les envío la invitación a la reunión para revisar el proceso
                de acreditación de personal y vehículos con Gard Security.
              </p>
              <p className="text-[13px] leading-relaxed text-ds-text-2">
                Quedo atento a su confirmación.
              </p>
              <p className="text-[13px] leading-relaxed text-ds-text-2">
                Saludos cordiales,
                <br />
                {INVITE.organizer}
              </p>

              <div className="rounded-xl border border-ds-border-subtle bg-ds-surface-2 p-3">
                <p className="text-[12px] font-semibold uppercase tracking-wide text-ds-text-4">
                  Reunión de Microsoft Teams
                </p>
                <p className="mt-2 text-[13px] text-ds-text-2">
                  Unirse:{" "}
                  <span className="font-medium text-primary">Click aquí para unirse a la reunión</span>
                </p>
                <p className="mt-1 text-[12px] text-ds-text-3">Id. de reunión: 123 456 789</p>
                <p className="text-[12px] text-ds-text-3">Código de acceso: abCDe</p>
              </div>
            </Surface>

            <Surface elevation={0} padding="md" className="space-y-2 border border-dashed border-ds-border-default">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-ds-text-4">
                Nota de implementación (no va en producto)
              </p>
              <ul className="list-inside list-disc space-y-1 text-[13px] text-ds-text-3">
                <li>
                  Detectar invite por adjunto <code className="text-ds-text-2">text/calendar</code> /
                  headers Gmail / HTML de Teams·Outlook·Google.
                </li>
                <li>
                  Responder con la API de Calendar del usuario conectado (
                  <code className="text-ds-text-2">events.patch</code> attendee responseStatus).
                </li>
                <li>
                  Espejar en Agenda OPAI (ya existe <code className="text-ds-text-2">respondRsvp</code>).
                </li>
                <li>
                  Card arriba del cuerpo del mensaje (como Gmail), no escondida en adjuntos.
                </li>
              </ul>
            </Surface>
          </div>
        </section>
      </main>
    </div>
  );
}
