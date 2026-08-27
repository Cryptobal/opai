"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  INCIDENTE_CATEGORIES,
  MAX_PHOTO_BYTES,
  MAX_REPORT_FILES,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SECONDS,
  MIN_DESCRIPTION_CHARS,
} from "@/lib/incidentes-instalacion/constants";
import { DEVICE_TOKEN_KEY, safeStorage } from "@/lib/device-constants";
import { CategoryGrid } from "../_components/CategoryGrid";
import { GpsPill, useGpsFix } from "../_components/GpsPill";
import { MediaTray, type MediaItem } from "../_components/MediaTray";
import { SuccessScreen } from "../_components/SuccessScreen";
import { ReporteAsignarClient } from "./ReporteAsignarClient";

type Ctx = {
  installationName: string;
  address: string | null;
  tenantName: string;
  tenantLogoUrl: string | null;
  tenantMonogram: string;
  categories: { id: string; label: string; description: string; emergency?: boolean }[];
};

export function ReportePublicoClient({ token, context }: { token: string; context: Ctx }) {
  const gps = useGpsFix();
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [items, setItems] = useState<MediaItem[]>([]);
  const [contactOpen, setContactOpen] = useState(false);
  const [reporterName, setReporterName] = useState("");
  const [reporterContact, setReporterContact] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ code: string; followUrl: string } | null>(null);
  const [staffCanReassign, setStaffCanReassign] = useState(false);
  const [reassign, setReassign] = useState(false);

  useEffect(() => {
    const headers: Record<string, string> = {};
    const device = safeStorage.getItem(DEVICE_TOKEN_KEY);
    if (device) headers.Authorization = `Bearer ${device}`;
    fetch(`/api/public/reporte/${encodeURIComponent(token)}/staff`, { headers })
      .then((r) => r.json())
      .then((j) => {
        if (j.success && j.data?.canAssign) setStaffCanReassign(true);
      })
      .catch(() => undefined);
  }, [token]);

  const addFiles = useCallback(async (list: FileList) => {
    setError(null);
    const incoming = Array.from(list);
    const next: MediaItem[] = [];
    for (const file of incoming) {
      if (items.length + next.length >= MAX_REPORT_FILES) break;
      const isVideo = file.type.startsWith("video/");
      const max = isVideo ? MAX_VIDEO_BYTES : MAX_PHOTO_BYTES;
      if (file.size > max) {
        setError(
          isVideo
            ? "El video supera 120 MB. Graba uno más corto."
            : "La foto supera 10 MB. Toma otra o reduce el tamaño.",
        );
        continue;
      }
      if (isVideo) {
        const duration = await readVideoDuration(file);
        if (duration != null && duration > MAX_VIDEO_SECONDS) {
          setError("El video supera 90 segundos. Graba uno más corto.");
          continue;
        }
      }
      next.push({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        previewUrl: URL.createObjectURL(file),
        kind: isVideo ? "video" : "image",
        progress: 0,
      });
    }
    if (next.length) setItems((prev) => [...prev, ...next].slice(0, MAX_REPORT_FILES));
  }, [items.length]);

  const removeFile = useCallback((id: string) => {
    setItems((prev) => {
      const found = prev.find((f) => f.id === id);
      if (found) URL.revokeObjectURL(found.previewUrl);
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  const gpsOk = gps.state.kind === "ok";
  const canSend = useMemo(() => {
    if (!gpsOk || sending) return false;
    if (!category) return false;
    if (description.trim().length < MIN_DESCRIPTION_CHARS && items.length === 0) return false;
    return true;
  }, [gpsOk, category, description, items.length, sending]);

  const hint = useMemo(() => {
    if (gps.state.kind === "denied") {
      return "Activa la ubicación en el navegador para reportar. Sin GPS no podemos verificar que estás en la instalación.";
    }
    if (gps.state.kind === "unavailable") {
      return "No pudimos obtener tu ubicación. Activa el GPS e intenta de nuevo.";
    }
    if (gps.state.kind === "out_of_range") return "Debes estar en la instalación para reportar.";
    if (gps.state.kind === "checking" || gps.state.kind === "idle") return "Verificando tu ubicación…";
    if (!category) return "Elige una categoría para continuar.";
    if (description.trim().length < MIN_DESCRIPTION_CHARS && items.length === 0) {
      return "Describe lo que viste o adjunta al menos una foto.";
    }
    return "Tu reporte llegará al instante al guardia y a supervisión.";
  }, [gps.state.kind, category, description, items.length]);

  async function handleSubmit() {
    if (!canSend || gps.state.kind !== "ok" || !category) return;
    setSending(true);
    setError(null);
    try {
      const uploads: { storageKey: string; contentType: string; fileName: string; fileSize: number }[] = [];
      for (const item of items) {
        const urlRes = await fetch(`/api/public/reporte/${encodeURIComponent(token)}/upload-url`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contentType: item.file.type,
            fileName: item.file.name,
            fileSize: item.file.size,
          }),
        });
        const urlJson = await urlRes.json();
        if (!urlRes.ok) {
          throw new Error(urlJson.error ?? "No se pudo preparar la subida.");
        }
        const payload = urlJson.data ?? urlJson;
        const ok = await putWithProgress(payload.uploadUrl as string, item.file, (pct) => {
          setItems((prev) => prev.map((p) => (p.id === item.id ? { ...p, progress: pct } : p)));
        });
        if (!ok) continue;
        setItems((prev) => prev.map((p) => (p.id === item.id ? { ...p, progress: 100, storageKey: payload.storageKey } : p)));
        uploads.push({
          storageKey: payload.storageKey,
          contentType: item.file.type,
          fileName: item.file.name,
          fileSize: item.file.size,
        });
      }

      const res = await fetch(`/api/public/reporte/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          description: description.trim(),
          lat: gps.state.lat,
          lng: gps.state.lng,
          accuracy: gps.state.accuracy,
          gps: { lat: gps.state.lat, lng: gps.state.lng, accuracy: gps.state.accuracy },
          reporterName: reporterName.trim() || undefined,
          reporterContact: reporterContact.trim() || undefined,
          files: uploads,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.code === "OUT_OF_RANGE") {
          gps.setOutOfRange();
          if (staffCanReassign) setReassign(true);
        }
        throw new Error(json.error ?? "No se pudo enviar el reporte.");
      }
      const data = json.data ?? json;
      setSuccess({ code: data.code, followUrl: data.followUrl });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar el reporte.");
    } finally {
      setSending(false);
    }
  }

  if (success) {
    return <SuccessScreen code={success.code} followUrl={success.followUrl} />;
  }

  if (reassign) {
    return (
      <ReporteAsignarClient
        token={token}
        fallbackTenantName={context.tenantName}
      />
    );
  }

  return (
    <main className="r-page">
      <header className="r-header">
        <div className="r-brand">
          {context.tenantLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={context.tenantLogoUrl} alt="" />
          ) : (
            <span className="r-brand-mark" aria-hidden>
              {context.tenantMonogram}
            </span>
          )}
          <div>
            <p className="r-kicker">Canal oficial de reportes</p>
            <p className="r-tenant">{context.tenantName}</p>
          </div>
        </div>
      </header>

      <section className="r-install">
        <p className="r-install-label">Estás reportando en</p>
        <h1>{context.installationName}</h1>
        {context.address ? <p className="r-address">{context.address}</p> : null}
      </section>

      <GpsPill state={gps.state} onRetry={gps.request} />

      <section className="r-step">
        <p className="r-step-n">Paso 1 de 3</p>
        <h2>¿Qué estás reportando?</h2>
        <CategoryGrid
          categories={context.categories.length ? context.categories : [...INCIDENTE_CATEGORIES]}
          value={category}
          onChange={setCategory}
        />
      </section>

      <section className="r-step">
        <p className="r-step-n">Paso 2 de 3</p>
        <h2>Cuéntanos qué viste</h2>
        <textarea
          className="r-textarea"
          rows={4}
          maxLength={2000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe el incidente con el mayor detalle posible."
        />
        <MediaTray items={items} max={MAX_REPORT_FILES} onAddFiles={addFiles} onRemove={removeFile} />
      </section>

      <section className="r-step">
        <button type="button" className="r-collapse" onClick={() => setContactOpen((v) => !v)}>
          {contactOpen ? "Ocultar datos de contacto" : "Dejar datos de contacto (opcional)"}
        </button>
        {contactOpen ? (
          <div className="r-contact">
            <label>
              Nombre
              <input
                value={reporterName}
                onChange={(e) => setReporterName(e.target.value)}
                maxLength={120}
                autoComplete="name"
              />
            </label>
            <label>
              Teléfono o correo
              <input
                value={reporterContact}
                onChange={(e) => setReporterContact(e.target.value)}
                maxLength={160}
                autoComplete="tel"
              />
            </label>
          </div>
        ) : null}
      </section>

      {error ? <p className="r-error" role="alert">{error}</p> : null}
      {staffCanReassign ? (
        <p className="r-hint" style={{ textAlign: "center" }}>
          ¿Moviste el adhesivo?{" "}
          <button type="button" className="r-collapse" onClick={() => setReassign(true)}>
            Reasignar a otra instalación
          </button>
        </p>
      ) : null}

      <div className="r-cta-wrap">
        <p className="r-hint">{hint}</p>
        <button type="button" className="r-cta" disabled={!canSend} onClick={handleSubmit}>
          {sending ? "Enviando reporte…" : "Enviar reporte"}
        </button>
        <p className="r-anon">Anónimo · Sin app · Sin registro</p>
      </div>
    </main>
  );
}

function putWithProgress(url: string, file: File, onProgress: (pct: number) => void): Promise<boolean> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) onProgress(Math.round((ev.loaded / ev.total) * 100));
    };
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => resolve(false);
    xhr.send(file);
  });
}

function readVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const d = video.duration;
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(d) ? d : null);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    video.src = url;
  });
}
