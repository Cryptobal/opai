"use client";

export function ProductividadDayHeader({
  eventCount,
  unreadCount,
  openTaskCount,
}: {
  eventCount: number;
  unreadCount: number;
  openTaskCount: number;
}) {
  const dateLabel = new Date().toLocaleDateString("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Santiago",
  });

  const counters = [
    `${eventCount} evento${eventCount === 1 ? "" : "s"}`,
    `${unreadCount} correo${unreadCount === 1 ? "" : "s"} sin leer`,
    `${openTaskCount} tarea${openTaskCount === 1 ? "" : "s"} abierta${openTaskCount === 1 ? "" : "s"}`,
  ].join(" · ");

  return (
    <header className="flex min-w-0 flex-col gap-1">
      <h1
        id="prod-my-day"
        className="font-display text-lg font-semibold tracking-tight text-ds-text-1 sm:text-xl"
      >
        Mi día
      </h1>
      <p className="truncate text-ds-body capitalize text-ds-text-3">
        {dateLabel}
        <span className="text-ds-text-4"> · {counters}</span>
      </p>
    </header>
  );
}
