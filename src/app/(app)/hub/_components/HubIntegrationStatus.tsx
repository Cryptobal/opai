import Link from "next/link";
import { Tag } from "@/components/opai-ds";
import type { HubIntegrationStatus as Status } from "../_lib/hub-context";

interface HubIntegrationStatusProps {
  status: Status;
}

export function HubIntegrationStatus({ status }: HubIntegrationStatusProps) {
  const items = [
    {
      key: "gmail",
      label: "Gmail",
      href: "/opai/configuracion/integraciones",
      connected: status.gmail.connected,
      email: status.gmail.email,
    },
    {
      key: "calendar",
      label: "Calendar",
      href: "/opai/configuracion/integraciones/google-calendar",
      connected: status.calendar.connected,
      email: status.calendar.email,
    },
    {
      key: "drive",
      label: "Drive",
      href: "/opai/configuracion/integraciones/google-drive",
      connected: status.drive.connected,
      email: status.drive.email,
    },
  ];

  return (
    <div
      className="flex max-w-full flex-wrap items-center gap-2"
      aria-label="Estado de integraciones"
    >
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          title={item.email ?? `${item.label} no conectado`}
          className="inline-flex min-h-11 items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Tag
            variant={item.connected ? "ok" : "neutral"}
            size="md"
            dot
          >
            {item.label}
          </Tag>
        </Link>
      ))}
    </div>
  );
}
