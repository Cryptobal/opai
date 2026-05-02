"use client";

import { cn } from "@/lib/utils";

const EVENT_TYPE_LABEL: Record<string, string> = {
  lifecycle_changed: "Cambio de estado",
  status_changed: "Cambio de estado",
  document_uploaded: "Documento subido",
  document_updated: "Documento actualizado",
  document_deleted: "Documento eliminado",
  document_linked: "Documento vinculado",
  document_unlinked: "Documento desvinculado",
  bank_account_created: "Cuenta bancaria creada",
  bank_account_updated: "Cuenta bancaria actualizada",
  bank_account_deleted: "Cuenta bancaria eliminada",
  assigned: "Asignado a puesto",
  unassigned: "Desasignado de puesto",
  public_postulation_submitted: "Postulación recibida",
  postulation_submitted: "Postulación recibida",
  contract_generated: "Contrato generado",
  contract_signed: "Contrato firmado",
  salary_updated: "Sueldo actualizado",
  pin_generated: "PIN de marcación generado",
  pin_updated: "PIN de marcación actualizado",
  communication_sent: "Comunicación enviada",
  note_added: "Nota agregada",
  personal_data_updated: "Datos personales actualizados",
  rehired: "Recontratado",
  labor_event_created: "Evento laboral registrado",
  labor_event_deleted: "Evento laboral eliminado",
};

const EVENT_NODE_COLOR: Record<string, string> = {
  lifecycle_changed: "bg-status-ok",
  status_changed: "bg-status-ok",
  public_postulation_submitted: "bg-violet-500",
  postulation_submitted: "bg-violet-500",
  document_uploaded: "bg-status-info",
  document_updated: "bg-status-info",
  document_deleted: "bg-status-danger",
  document_linked: "bg-status-info",
  document_unlinked: "bg-status-warn",
  assigned: "bg-status-info",
  unassigned: "bg-status-warn",
  contract_generated: "bg-status-info",
  contract_signed: "bg-status-ok",
  rehired: "bg-status-ok",
  labor_event_created: "bg-status-warn",
  labor_event_deleted: "bg-status-danger",
  bank_account_created: "bg-status-info",
  bank_account_updated: "bg-status-info",
  bank_account_deleted: "bg-status-danger",
  salary_updated: "bg-status-warn",
  pin_generated: "bg-status-info",
  pin_updated: "bg-status-info",
  communication_sent: "bg-tint-violet",
  note_added: "bg-gray-400",
  personal_data_updated: "bg-status-warn",
};

const LIFECYCLE_STATUS_LABEL: Record<string, string> = {
  postulante: "Postulante",
  seleccionado: "Seleccionado",
  contratado: "Contratado",
  te: "Turno Extra",
  inactivo: "Inactivo",
};

const BANK_NAMES: Record<string, string> = {
  banco_estado: "Banco Estado",
  banco_chile: "Banco Chile",
  banco_santander: "Banco Santander",
  banco_bci: "BCI",
  banco_itau: "Banco Itaú",
  banco_scotiabank: "Scotiabank",
  banco_falabella: "Banco Falabella",
  banco_ripley: "Banco Ripley",
  banco_security: "Banco Security",
  banco_bice: "BICE",
  banco_internacional: "Banco Internacional",
  banco_consorcio: "Banco Consorcio",
  banco_de_credito: "Banco de Crédito",
};

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  cuenta_corriente: "Cuenta Corriente",
  cuenta_vista: "Cuenta Vista / RUT",
  cuenta_ahorro: "Cuenta de Ahorro",
};

type HistoryEvent = {
  id: string;
  eventType: string;
  newValue?: Record<string, unknown> | null;
  reason?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
  createdAt: string;
};

interface HistorialSectionProps {
  historyEvents: HistoryEvent[];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${day}-${month}-${year}, ${hours}:${minutes}`;
}

function formatSimpleDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${String(d.getUTCDate()).padStart(2, "0")}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${d.getUTCFullYear()}`;
}

/** Returns an array of description lines for the event. */
function getEventDescriptionLines(event: HistoryEvent): string[] {
  const { eventType, newValue } = event;
  const lines: string[] = [];

  // ── Lifecycle / status changes ──
  if ((eventType === "lifecycle_changed" || eventType === "status_changed") && newValue) {
    const from = (newValue.from ?? newValue.lifecycleStatus) as string | undefined;
    const to = (newValue.to ?? newValue.lifecycleStatus) as string | undefined;
    const prevLC = (event as unknown as { previousValue?: Record<string, unknown> })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      || {} as any;
    const prevStatus = (newValue as Record<string, unknown>).from as string | undefined
      ?? (typeof (event as Record<string, unknown>).previousValue === "object" && (event as Record<string, unknown>).previousValue
        ? ((event as Record<string, unknown>).previousValue as Record<string, unknown>).lifecycleStatus as string | undefined
        : undefined);

    if (prevStatus && to && prevStatus !== to) {
      lines.push(`${LIFECYCLE_STATUS_LABEL[prevStatus] || prevStatus} → ${LIFECYCLE_STATUS_LABEL[to] || to}`);
    } else if (from && to && from !== to) {
      lines.push(`${LIFECYCLE_STATUS_LABEL[from] || from} → ${LIFECYCLE_STATUS_LABEL[to] || to}`);
    } else if (to) {
      lines.push(`→ ${LIFECYCLE_STATUS_LABEL[to] || to}`);
    }
    if (event.reason) lines.push(event.reason);
    return lines;
  }

  // ── Rehired ──
  if (eventType === "rehired") {
    if (newValue) {
      const date = newValue.effectiveAt as string | undefined;
      if (date) lines.push(`Fecha de recontratación: ${formatSimpleDate(date)}`);
    }
    if (event.reason) lines.push(event.reason);
    return lines.length > 0 ? lines : ["Guardia recontratado"];
  }

  // ── Postulation ──
  if (eventType === "public_postulation_submitted" || eventType === "postulation_submitted") {
    lines.push("Ingreso vía formulario público");
    return lines;
  }

  // ── Assignment ──
  if (eventType === "assigned" && newValue) {
    const installation = newValue.installationName as string | undefined;
    const puesto = newValue.puestoName as string | undefined;
    const slot = newValue.slotNumber as number | undefined;
    const account = newValue.accountName as string | undefined;
    if (puesto && installation) lines.push(`${puesto} en ${installation}`);
    else if (installation) lines.push(installation);
    if (account) lines.push(`Cliente: ${account}`);
    if (slot) lines.push(`Slot: S${slot}`);
    const startDate = newValue.startDate as string | undefined;
    if (startDate) lines.push(`Desde: ${formatSimpleDate(startDate)}`);
    if (event.reason) lines.push(event.reason);
    return lines;
  }

  if (eventType === "unassigned" && newValue) {
    const installation = newValue.installationName as string | undefined;
    const puesto = newValue.puestoName as string | undefined;
    if (puesto && installation) lines.push(`${puesto} en ${installation}`);
    else if (installation) lines.push(installation);
    const endDate = newValue.endDate as string | undefined;
    if (endDate) lines.push(`Hasta: ${formatSimpleDate(endDate)}`);
    if (event.reason) lines.push(event.reason);
    return lines;
  }

  // ── Documents ──
  if ((eventType === "document_uploaded" || eventType === "document_updated" || eventType === "document_deleted") && newValue) {
    const docType = newValue.documentType as string | undefined;
    const fileName = newValue.fileName as string | undefined;
    const status = newValue.status as string | undefined;
    if (docType) lines.push(`Tipo: ${docType}`);
    if (fileName) lines.push(`Archivo: ${fileName}`);
    if (status) lines.push(`Estado: ${status}`);
    if (event.reason) lines.push(event.reason);
    return lines.length > 0 ? lines : event.reason ? [event.reason] : [];
  }

  if (eventType === "document_linked" && newValue) {
    const title = newValue.title as string | undefined;
    const role = newValue.role as string | undefined;
    const roleLabels: Record<string, string> = { primary: "Principal", related: "Relacionado", copy: "Copia" };
    if (title) lines.push(`"${title}"`);
    if (role) lines.push(`Rol: ${roleLabels[role] || role}`);
    return lines;
  }

  if (eventType === "document_unlinked" && newValue) {
    const documentId = newValue.documentId as string | undefined;
    if (documentId) lines.push(`Doc ID: ${documentId.slice(0, 8)}…`);
    return lines;
  }

  // ── Bank accounts ──
  if (eventType === "bank_account_created" && newValue) {
    const bankCode = newValue.bankCode as string | undefined;
    const accountType = newValue.accountType as string | undefined;
    const bankName = newValue.bankName as string | undefined;
    lines.push(bankName || (bankCode ? BANK_NAMES[bankCode] || bankCode : "Banco"));
    if (accountType) lines.push(ACCOUNT_TYPE_LABELS[accountType] || accountType);
    return lines;
  }

  if (eventType === "bank_account_updated" && newValue) {
    const bankCode = newValue.bankCode as string | undefined;
    const accountType = newValue.accountType as string | undefined;
    const bankName = newValue.bankName as string | undefined;
    lines.push(bankName || (bankCode ? BANK_NAMES[bankCode] || bankCode : "Banco"));
    if (accountType) lines.push(ACCOUNT_TYPE_LABELS[accountType] || accountType);
    return lines;
  }

  if (eventType === "bank_account_deleted") {
    if (newValue) {
      const bankCode = (newValue as Record<string, unknown>).bankCode as string | undefined;
      if (bankCode) lines.push(BANK_NAMES[bankCode] || bankCode);
    }
    return lines.length > 0 ? lines : ["Cuenta eliminada"];
  }

  // ── Labor events ──
  if (eventType === "labor_event_created" && newValue) {
    const cat = newValue.category as string | undefined;
    const subtypeLabel = newValue.subtypeLabel as string | undefined;
    const date = newValue.date as string | undefined;
    const categoryLabels: Record<string, string> = {
      finiquito: "Finiquito",
      amonestacion: "Amonestación",
      ausencia: "Ausencia",
      licencia_medica: "Licencia médica",
      vacaciones: "Vacaciones",
      accidente_laboral: "Accidente laboral",
      permiso: "Permiso",
    };
    if (cat) lines.push(categoryLabels[cat] || cat);
    if (subtypeLabel && subtypeLabel !== cat) lines.push(subtypeLabel);
    if (date) lines.push(`Fecha: ${formatSimpleDate(date)}`);
    const endDate = newValue.endDate as string | undefined;
    if (endDate) lines.push(`Hasta: ${formatSimpleDate(endDate)}`);
    if (event.reason) lines.push(event.reason);
    return lines.length > 0 ? lines : [event.reason ?? "Evento laboral registrado"];
  }

  if (eventType === "labor_event_deleted") {
    if (event.reason) lines.push(event.reason);
    return lines.length > 0 ? lines : ["Evento laboral eliminado"];
  }

  // ── Salary ──
  if (eventType === "salary_updated" && newValue) {
    const sueldoBase = newValue.sueldoBase as number | undefined;
    const bonoAsistencia = newValue.bonoAsistencia as number | undefined;
    if (sueldoBase != null) lines.push(`Sueldo base: $${sueldoBase.toLocaleString("es-CL")}`);
    if (bonoAsistencia != null) lines.push(`Bono asistencia: $${bonoAsistencia.toLocaleString("es-CL")}`);
    if (event.reason) lines.push(event.reason);
    return lines;
  }

  // ── PIN ──
  if (eventType === "pin_generated" || eventType === "pin_updated") {
    lines.push("PIN de marcación configurado");
    return lines;
  }

  // ── Communication ──
  if (eventType === "communication_sent" && newValue) {
    const channel = newValue.channel as string | undefined;
    const subject = newValue.subject as string | undefined;
    const channelLabels: Record<string, string> = { email: "Email", whatsapp: "WhatsApp", sms: "SMS", phone: "Llamada" };
    if (channel) lines.push(`Vía: ${channelLabels[channel] || channel}`);
    if (subject) lines.push(subject);
    if (event.reason) lines.push(event.reason);
    return lines;
  }

  // ── Personal data updated ──
  if (eventType === "personal_data_updated" && newValue) {
    const fields = newValue.fields as string[] | undefined;
    const changedFields = newValue.changedFields as string[] | undefined;
    const fieldList = fields || changedFields;
    if (fieldList && fieldList.length > 0) {
      const fieldLabels: Record<string, string> = {
        firstName: "Nombre", lastName: "Apellido", rut: "RUT", email: "Email",
        phoneMobile: "Celular", sex: "Sexo", nacionalidad: "Nacionalidad",
        birthDate: "Fecha nacimiento", afp: "AFP", healthSystem: "Sistema salud",
        addressFormatted: "Dirección", commune: "Comuna", city: "Ciudad", region: "Región",
        hasMobilization: "Movilización", availableExtraShifts: "Turnos extra",
        shoeSize: "Calzado", pantsSize: "Pantalón", tshirtSize: "Polera", shirtSize: "Camisa",
        geologoSize: "Geólogo", polarSize: "Polar", jacketSize: "Chaqueta", heightCm: "Estatura", weightKg: "Peso",
        regimenPrevisional: "Régimen previsional", tipoPension: "Tipo pensión",
        isJubilado: "Jubilado", cotizaAFP: "Cotiza AFP", cotizaAFC: "Cotiza AFC", cotizaSalud: "Cotiza salud",
      };
      const labels = fieldList.map((f: string) => fieldLabels[f] || f);
      lines.push(`Campos: ${labels.join(", ")}`);
    }
    if (event.reason) lines.push(event.reason);
    return lines;
  }

  // ── Notes ──
  if (eventType === "note_added") {
    if (event.reason) lines.push(event.reason);
    return lines;
  }

  // ── Contract ──
  if (eventType === "contract_generated" && newValue) {
    const contractType = newValue.contractType as string | undefined;
    const title = newValue.title as string | undefined;
    if (title) lines.push(title);
    else if (contractType) lines.push(contractType === "plazo_fijo" ? "Plazo fijo" : contractType === "indefinido" ? "Indefinido" : contractType);
    if (event.reason) lines.push(event.reason);
    return lines;
  }

  if (eventType === "contract_signed") {
    const title = newValue?.title as string | undefined;
    if (title) lines.push(title);
    if (event.reason) lines.push(event.reason);
    return lines;
  }

  // ── Fallback ──
  if (event.reason) lines.push(event.reason);
  return lines;
}

export default function HistorialSection({ historyEvents }: HistorialSectionProps) {
  if (historyEvents.length === 0) {
    return (
      <div className="rounded-xl border border-border/60 bg-card/40 p-4 text-sm text-muted-foreground">
        Sin eventos registrados.
      </div>
    );
  }

  return (
    <div className="relative pl-6">
      {/* Vertical line */}
      <div className="absolute left-[7px] top-1 bottom-1 w-px bg-border/60" />

      {historyEvents.map((event, idx) => {
        const label = EVENT_TYPE_LABEL[event.eventType] || event.eventType.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        const nodeColor = EVENT_NODE_COLOR[event.eventType] || "bg-muted-foreground/40";
        const descriptionLines = getEventDescriptionLines(event);

        return (
          <div key={event.id} className={cn("relative pb-4", idx === historyEvents.length - 1 && "pb-0")}>
            {/* Node circle */}
            <div className={cn("absolute -left-6 top-1 h-3.5 w-3.5 rounded-full border-2 border-background", nodeColor)} />

            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{label}</p>
              {descriptionLines.length > 0 && (
                <div className="mt-0.5 space-y-0.5">
                  {descriptionLines.map((line, i) => (
                    <p key={i} className="text-xs text-muted-foreground">{line}</p>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                {formatDate(event.createdAt)}
                {event.createdByName ? ` · por ${event.createdByName}` : event.createdBy === "system" ? " · por Sistema" : ""}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
