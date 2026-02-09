/* eslint-disable @typescript-eslint/no-misused-promises */
"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type QuoteOption = {
  id: string;
  code: string;
  clientName?: string | null;
  status: string;
};

type EmailTemplate = {
  id: string;
  name: string;
  subject: string;
  body: string;
  scope: string;
  stageId?: string | null;
};

type DealQuote = {
  id: string;
  quoteId: string;
};

type ContactRow = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  roleTitle?: string | null;
  isPrimary?: boolean;
};

type DealDetail = {
  id: string;
  title: string;
  amount: string;
  stage?: { name: string } | null;
  account?: { name: string } | null;
  primaryContact?: { name: string; email?: string | null } | null;
  quotes?: DealQuote[];
};

export function CrmDealDetailClient({
  deal,
  quotes,
  contacts,
  gmailConnected,
  templates,
}: {
  deal: DealDetail;
  quotes: QuoteOption[];
  contacts: ContactRow[];
  gmailConnected: boolean;
  templates: EmailTemplate[];
}) {
  const [open, setOpen] = useState(false);
  const [selectedQuoteId, setSelectedQuoteId] = useState("");
  const [linkedQuotes, setLinkedQuotes] = useState<DealQuote[]>(deal.quotes || []);
  const [loading, setLoading] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState(deal.primaryContact?.email || "");
  const [emailSubject, setEmailSubject] = useState(
    `Propuesta para ${deal.account?.name || "cliente"}`
  );
  const [emailBody, setEmailBody] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");

  const selectClassName =
    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
  const inputClassName =
    "bg-background text-foreground placeholder:text-muted-foreground border-input focus-visible:ring-ring";
  const applyPlaceholders = (value: string) => {
    const replacements: Record<string, string> = {
      "{cliente}": deal.account?.name || "",
      "{contacto}": deal.primaryContact?.name || "",
      "{negocio}": deal.title || "",
      "{etapa}": deal.stage?.name || "",
      "{monto}": deal.amount ? Number(deal.amount).toLocaleString("es-CL") : "",
      "{correo}": deal.primaryContact?.email || "",
    };
    return Object.entries(replacements).reduce(
      (acc, [key, replaceValue]) => acc.split(key).join(replaceValue),
      value
    );
  };

  const selectTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    setEmailSubject(template.subject);
    setEmailBody(template.body);
  };

  const quotesById = useMemo(() => {
    return quotes.reduce<Record<string, QuoteOption>>((acc, quote) => {
      acc[quote.id] = quote;
      return acc;
    }, {});
  }, [quotes]);

  const linkQuote = async () => {
    if (!selectedQuoteId) {
      alert("Selecciona una cotización.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`/api/crm/deals/${deal.id}/quotes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId: selectedQuoteId }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Error vinculando cotización");
      }
      setLinkedQuotes((prev) => [...prev, payload.data]);
      setSelectedQuoteId("");
      setOpen(false);
    } catch (error) {
      console.error(error);
      alert("No se pudo vincular la cotización.");
    } finally {
      setLoading(false);
    }
  };

  const sendEmail = async () => {
    if (!gmailConnected) {
      alert("Conecta Gmail antes de enviar.");
      return;
    }
    if (!emailTo || !emailSubject) {
      alert("Completa destinatario y asunto.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/crm/gmail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: emailTo,
          subject: applyPlaceholders(emailSubject),
          html: applyPlaceholders(emailBody),
          dealId: deal.id,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Error enviando email");
      }
      setEmailOpen(false);
      setEmailBody("");
    } catch (error) {
      console.error(error);
      alert("No se pudo enviar el correo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Resumen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span>Cliente</span>
            <span className="font-medium">{deal.account?.name}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Etapa</span>
            <Badge variant="outline">{deal.stage?.name}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span>Monto</span>
            <span className="font-medium">
              ${Number(deal.amount).toLocaleString("es-CL")}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Contacto</span>
            <span className="font-medium">
              {deal.primaryContact?.name || "Sin contacto"}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Cotizaciones vinculadas</CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="secondary">
                Vincular
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Vincular cotización</DialogTitle>
                <DialogDescription>
                  Selecciona una cotización desde CPQ.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label>Cotización</Label>
                <select
                  className={selectClassName}
                  value={selectedQuoteId}
                  onChange={(event) => setSelectedQuoteId(event.target.value)}
                >
                  <option value="">Selecciona cotización</option>
                  {quotes.map((quote) => (
                    <option key={quote.id} value={quote.id}>
                      {quote.code} · {quote.clientName || "Sin cliente"}
                    </option>
                  ))}
                </select>
              </div>
              <DialogFooter>
                <Button onClick={linkQuote} disabled={loading}>
                  Guardar vínculo
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {linkedQuotes.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No hay cotizaciones vinculadas.
            </p>
          )}
          {linkedQuotes.map((quote) => {
            const info = quotesById[quote.quoteId];
            return (
              <div
                key={quote.id}
                className="flex items-center justify-between rounded-md border px-3 py-2"
              >
                <div>
                  <p className="font-medium">{info?.code || "CPQ"}</p>
                  <p className="text-xs text-muted-foreground">
                    {info?.clientName || "Sin cliente"}
                  </p>
                </div>
                <Badge variant="outline">{info?.status || "draft"}</Badge>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Correos</CardTitle>
          {gmailConnected ? (
            <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="secondary">
                  Enviar
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Enviar correo</DialogTitle>
                  <DialogDescription>
                    Se enviará desde tu cuenta Gmail conectada.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
              <div className="space-y-2">
                <Label>Template</Label>
                <select
                  className={selectClassName}
                  value={selectedTemplateId}
                  onChange={(event) => selectTemplate(event.target.value)}
                >
                  <option value="">Selecciona un template</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                    <Label>Para</Label>
                    <input
                      value={emailTo}
                      onChange={(event) => setEmailTo(event.target.value)}
                      className={`h-9 w-full rounded-md border px-3 text-sm ${inputClassName}`}
                      placeholder="correo@cliente.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Asunto</Label>
                    <input
                      value={emailSubject}
                      onChange={(event) => setEmailSubject(event.target.value)}
                      className={`h-9 w-full rounded-md border px-3 text-sm ${inputClassName}`}
                      placeholder="Asunto"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Mensaje</Label>
                    <textarea
                      value={emailBody}
                      onChange={(event) => setEmailBody(event.target.value)}
                      className={`min-h-[120px] w-full rounded-md border px-3 py-2 text-sm ${inputClassName}`}
                      placeholder="Escribe tu mensaje..."
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={sendEmail} disabled={loading}>
                    Enviar correo
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : (
            <Button asChild size="sm" variant="secondary">
              <a href="/opai/configuracion/integraciones">Ir a Integraciones</a>
            </Button>
          )}
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {gmailConnected
            ? "Tu Gmail está conectado para enviar y registrar correos."
            : "Conecta Gmail en Configuración → Integraciones."}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contactos del cliente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {contacts.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Este cliente no tiene contactos aún.
            </p>
          )}
          {contacts.map((contact) => (
            <div
              key={contact.id}
              className="flex flex-col gap-1 rounded-md border px-3 py-2"
            >
              <div className="flex items-center justify-between">
                <p className="font-medium">{contact.name}</p>
                {contact.isPrimary && <Badge variant="outline">Principal</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">
                {contact.roleTitle || "Sin cargo"} · {contact.email || "Sin email"}
              </p>
              <p className="text-xs text-muted-foreground">
                {contact.phone || "Sin teléfono"}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
