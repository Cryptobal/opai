import { describe, expect, it } from "vitest";
import {
  isGoogleConnectReason,
  sanitizeSyncReason,
} from "../agenda-sync-reason";
import { syncStatusMeta } from "@/components/agenda/agenda-sync-status";
import { GOOGLE_CALENDAR_DISCONNECT_ERROR } from "@/lib/google-workspace/calendar-disconnect";

describe("sanitizeSyncReason", () => {
  it("mapea desconexión de Google a mensaje controlado", () => {
    expect(sanitizeSyncReason(GOOGLE_CALENDAR_DISCONNECT_ERROR)).toBe(
      "Sin cuenta de Google Calendar conectada",
    );
    expect(isGoogleConnectReason(sanitizeSyncReason(GOOGLE_CALENDAR_DISCONNECT_ERROR))).toBe(
      true,
    );
  });

  it("no filtra lastError crudo con emails", () => {
    expect(sanitizeSyncReason("Google API 403 for user@example.com")).toBe(
      "Hay que volver a conectar Google Calendar",
    );
  });

  it("mapea Invalid start time a acción de reenvío", () => {
    expect(sanitizeSyncReason("Invalid start time.")).toBe(
      "Conflicto al actualizar la fecha en Google; usá Reenviar a Google",
    );
  });
});

describe("syncStatusMeta", () => {
  it("null → no aplica", () => {
    const meta = syncStatusMeta(null);
    expect(meta.status).toBe("NONE");
    expect(meta.icon).toBeNull();
  });

  it("PENDING con motivo de Google → needsGoogleConnect", () => {
    const meta = syncStatusMeta(
      "PENDING",
      "Sin cuenta de Google Calendar conectada",
    );
    expect(meta.status).toBe("PENDING");
    expect(meta.needsGoogleConnect).toBe(true);
    expect(meta.tone).toBe("warn");
  });

  it("ERROR con motivo → danger", () => {
    const meta = syncStatusMeta("ERROR", "Error de red al sincronizar; se reintentará");
    expect(meta.status).toBe("ERROR");
    expect(meta.tone).toBe("danger");
  });

  it("SYNCED → ok", () => {
    expect(syncStatusMeta("SYNCED").tone).toBe("ok");
  });
});
