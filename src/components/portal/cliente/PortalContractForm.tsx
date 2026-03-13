"use client";

import { useState } from "react";
import {
  Building2,
  Receipt,
  Users,
  CheckCircle,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { PortalSignContract } from "./PortalSignContract";

interface Props {
  quoteId: string;
  accountRut?: string;
  accountName?: string;
  onComplete?: (signatureToken: string | null) => void;
}

type Step = "empresa" | "facturacion" | "contactos" | "done";

type EmpresaData = { rut: string; legalName: string; address: string };
type FacturacionData = { email: string; contact: string; paymentMethod: string };
type ContactoData = { name: string; email: string; phone: string; role: string };

const STEPS: { key: Step; label: string; icon: React.ReactNode }[] = [
  { key: "empresa", label: "Empresa", icon: <Building2 className="w-4 h-4" /> },
  { key: "facturacion", label: "Facturación", icon: <Receipt className="w-4 h-4" /> },
  { key: "contactos", label: "Contactos", icon: <Users className="w-4 h-4" /> },
];

const STEP_ORDER: Step[] = ["empresa", "facturacion", "contactos", "done"];

function StepIndicator({ current }: { current: Step }) {
  const visibleSteps = STEPS;
  const currentIdx = STEP_ORDER.indexOf(current);

  return (
    <div className="flex items-center gap-1 mb-6">
      {visibleSteps.map((step, i) => {
        const stepIdx = STEP_ORDER.indexOf(step.key);
        const isActive = step.key === current;
        const isDone = currentIdx > stepIdx;

        return (
          <div key={step.key} className="flex items-center gap-1 flex-1 min-w-0">
            <div
              className={[
                "flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition-colors flex-1 min-w-0",
                isActive
                  ? "bg-teal-600/30 text-teal-300 border border-teal-600/50"
                  : isDone
                  ? "bg-emerald-900/20 text-emerald-400"
                  : "text-zinc-600",
              ].join(" ")}
            >
              {isDone ? <CheckCircle className="w-3.5 h-3.5 shrink-0" /> : step.icon}
              <span className="truncate hidden sm:block">{step.label}</span>
            </div>
            {i < visibleSteps.length - 1 && (
              <ChevronRight className="w-3 h-3 text-zinc-700 shrink-0" />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Input helpers ── */

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-zinc-400">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-teal-600 transition";

/* ══════════════════════════════════════════════════════════ */

export function PortalContractForm({ quoteId, accountRut, accountName, onComplete }: Props) {
  const [step, setStep] = useState<Step>("empresa");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [signatureToken, setSignatureToken] = useState<string | null>(null);

  const [empresa, setEmpresa] = useState<EmpresaData>({
    rut: accountRut ?? "",
    legalName: accountName ?? "",
    address: "",
  });

  const [facturacion, setFacturacion] = useState<FacturacionData>({
    email: "",
    contact: "",
    paymentMethod: "transferencia",
  });

  const [contactos, setContactos] = useState<ContactoData[]>([
    { name: "", email: "", phone: "", role: "Jefe de Operaciones" },
  ]);

  /* ── Navigation ── */

  function goNext() {
    const idx = STEP_ORDER.indexOf(step);
    if (idx < STEP_ORDER.length - 1) setStep(STEP_ORDER[idx + 1]);
  }

  function goBack() {
    const idx = STEP_ORDER.indexOf(step);
    if (idx > 0) setStep(STEP_ORDER[idx - 1]);
  }

  /* ── Submit ── */

  async function handleSubmit() {
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/portal/cliente/contract-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteId,
          companyRut: empresa.rut,
          legalName: empresa.legalName,
          legalAddress: empresa.address,
          billingData: {
            email: facturacion.email,
            contact: facturacion.contact,
            paymentMethod: facturacion.paymentMethod,
          },
          operativeContacts: contactos.filter((c) => c.name && c.email),
        }),
      });
      const json = await res.json();
      if (json.success) {
        setSignatureToken(json.signatureToken ?? null);
        setStep("done");
        onComplete?.(json.signatureToken ?? null);
      } else {
        setErrorMsg(json.error ?? "Error al enviar datos");
      }
    } catch {
      setErrorMsg("Error de conexion. Intenta nuevamente.");
    } finally {
      setSubmitting(false);
    }
  }

  /* ── Contactos helpers ── */

  function updateContacto(idx: number, field: keyof ContactoData, value: string) {
    setContactos((prev) => prev.map((c, i) => (i === idx ? { ...c, [field]: value } : c)));
  }

  function addContacto() {
    setContactos((prev) => [...prev, { name: "", email: "", phone: "", role: "" }]);
  }

  function removeContacto(idx: number) {
    setContactos((prev) => prev.filter((_, i) => i !== idx));
  }

  /* ── Render steps ── */

  if (step === "done") {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 mt-4 space-y-4">
        <div className="flex items-center gap-2 text-emerald-400 font-medium text-sm">
          <CheckCircle className="w-5 h-5" />
          Datos de contrato recibidos
        </div>
        {signatureToken ? (
          <PortalSignContract signatureToken={signatureToken} />
        ) : (
          <p className="text-sm text-zinc-400">
            Un ejecutivo revisará tu información y te contactará pronto para continuar el proceso de
            contratación.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 mt-4 space-y-5">
      <h3 className="text-sm font-semibold text-zinc-200">Datos para el contrato</h3>

      <StepIndicator current={step} />

      {/* ── Step 1: Empresa ── */}
      {step === "empresa" && (
        <div className="space-y-4">
          <Field label="RUT empresa" required>
            <input
              type="text"
              className={inputCls}
              placeholder="12.345.678-9"
              value={empresa.rut}
              onChange={(e) => setEmpresa((p) => ({ ...p, rut: e.target.value }))}
            />
          </Field>
          <Field label="Razon social" required>
            <input
              type="text"
              className={inputCls}
              placeholder="Empresa S.A."
              value={empresa.legalName}
              onChange={(e) => setEmpresa((p) => ({ ...p, legalName: e.target.value }))}
            />
          </Field>
          <Field label="Dirección legal" required>
            <input
              type="text"
              className={inputCls}
              placeholder="Av. Providencia 1234, Santiago"
              value={empresa.address}
              onChange={(e) => setEmpresa((p) => ({ ...p, address: e.target.value }))}
            />
          </Field>
          <div className="flex justify-end pt-1">
            <button
              onClick={goNext}
              disabled={!empresa.rut || !empresa.legalName || !empresa.address}
              className="flex items-center gap-2 px-5 h-9 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
            >
              Siguiente
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Facturación ── */}
      {step === "facturacion" && (
        <div className="space-y-4">
          <Field label="Email de facturación" required>
            <input
              type="email"
              className={inputCls}
              placeholder="facturas@empresa.cl"
              value={facturacion.email}
              onChange={(e) => setFacturacion((p) => ({ ...p, email: e.target.value }))}
            />
          </Field>
          <Field label="Contacto de facturación" required>
            <input
              type="text"
              className={inputCls}
              placeholder="Nombre del encargado"
              value={facturacion.contact}
              onChange={(e) => setFacturacion((p) => ({ ...p, contact: e.target.value }))}
            />
          </Field>
          <Field label="Condición de pago">
            <select
              className={inputCls}
              value={facturacion.paymentMethod}
              onChange={(e) => setFacturacion((p) => ({ ...p, paymentMethod: e.target.value }))}
            >
              <option value="transferencia">Transferencia bancaria</option>
              <option value="30_dias">30 días</option>
              <option value="60_dias">60 días</option>
              <option value="contado">Contado</option>
            </select>
          </Field>
          <div className="flex justify-between pt-1">
            <button
              onClick={goBack}
              className="flex items-center gap-1.5 px-4 h-9 rounded-lg border border-zinc-700 text-zinc-400 hover:text-zinc-200 text-sm transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Atras
            </button>
            <button
              onClick={goNext}
              disabled={!facturacion.email || !facturacion.contact}
              className="flex items-center gap-2 px-5 h-9 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
            >
              Siguiente
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Contactos operativos ── */}
      {step === "contactos" && (
        <div className="space-y-4">
          <p className="text-xs text-zinc-500">
            Agrega los contactos operativos que coordinaran el servicio.
          </p>
          {contactos.map((c, idx) => (
            <div
              key={idx}
              className="rounded-lg border border-zinc-800 p-3 space-y-3 relative"
            >
              {contactos.length > 1 && (
                <button
                  onClick={() => removeContacto(idx)}
                  className="absolute top-2 right-2 text-zinc-600 hover:text-red-400 transition-colors"
                  aria-label="Eliminar contacto"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nombre" required>
                  <input
                    type="text"
                    className={inputCls}
                    placeholder="Juan Perez"
                    value={c.name}
                    onChange={(e) => updateContacto(idx, "name", e.target.value)}
                  />
                </Field>
                <Field label="Email" required>
                  <input
                    type="email"
                    className={inputCls}
                    placeholder="juan@empresa.cl"
                    value={c.email}
                    onChange={(e) => updateContacto(idx, "email", e.target.value)}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Telefono">
                  <input
                    type="tel"
                    className={inputCls}
                    placeholder="+56 9 xxxx xxxx"
                    value={c.phone}
                    onChange={(e) => updateContacto(idx, "phone", e.target.value)}
                  />
                </Field>
                <Field label="Rol">
                  <input
                    type="text"
                    className={inputCls}
                    placeholder="Jefe de Operaciones"
                    value={c.role}
                    onChange={(e) => updateContacto(idx, "role", e.target.value)}
                  />
                </Field>
              </div>
            </div>
          ))}

          <button
            onClick={addContacto}
            className="flex items-center gap-1.5 text-xs text-teal-400 hover:text-teal-300 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Agregar otro contacto
          </button>

          {errorMsg && (
            <p className="text-xs text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2">
              {errorMsg}
            </p>
          )}

          {/* Summary */}
          <div className="rounded-lg bg-zinc-800/40 border border-zinc-800 p-3 space-y-1.5 text-xs text-zinc-400">
            <p className="font-semibold text-zinc-300 mb-2">Resumen</p>
            <p>
              <span className="text-zinc-500">Empresa:</span> {empresa.legalName} ({empresa.rut})
            </p>
            <p>
              <span className="text-zinc-500">Dirección:</span> {empresa.address}
            </p>
            <p>
              <span className="text-zinc-500">Facturación:</span> {facturacion.email} —{" "}
              {facturacion.paymentMethod}
            </p>
          </div>

          <div className="flex justify-between pt-1">
            <button
              onClick={goBack}
              className="flex items-center gap-1.5 px-4 h-9 rounded-lg border border-zinc-700 text-zinc-400 hover:text-zinc-200 text-sm transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Atras
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex items-center gap-2 px-5 h-9 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4" />
              )}
              {submitting ? "Enviando..." : "Enviar y generar contrato"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
