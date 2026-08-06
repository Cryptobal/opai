/**
 * Email Template: Cobranza (recordatorio de pago)
 *
 * HTML branded para envíos de cobranza multicanal. El cuerpo principal puede
 * venir de DocTemplate resuelto o de un mensaje editado por el operador.
 */

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Section,
  Text,
  Hr,
} from "@react-email/components";
import * as React from "react";

export interface CobranzaEmailProps {
  recipientName: string;
  /** Texto plano o párrafos del recordatorio (ya resuelto). */
  bodyText: string;
  folio: string;
  receiverCompanyName: string;
  totalFormatted: string;
  dueDate: string;
  daysOverdue: number;
  slugLabel: string;
  brandName: string;
  logoUrl?: string;
  brandPrimaryColor?: string;
  senderName?: string;
  senderEmail?: string;
  website?: string;
}

export function CobranzaEmail({
  recipientName = "Cliente",
  bodyText = "",
  folio = "—",
  receiverCompanyName = "",
  totalFormatted = "$0",
  dueDate = "",
  daysOverdue = 0,
  slugLabel = "Recordatorio",
  brandName = "OPAI",
  logoUrl = "",
  brandPrimaryColor = "#0066FF",
  senderName = "",
  senderEmail = "",
  website = "",
}: CobranzaEmailProps) {
  const preview =
    daysOverdue > 0
      ? `Pago pendiente · F°${folio} · ${daysOverdue}d de mora`
      : `Recordatorio de pago · F°${folio}`;

  const paragraphs = bodyText
    .split(/\n{2,}|\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          {logoUrl ? (
            <Img src={logoUrl} alt={brandName} height={40} style={logo} />
          ) : (
            <Text style={{ ...brandTitle, color: brandPrimaryColor }}>{brandName}</Text>
          )}

          <Section style={hero}>
            <Text style={badge}>{slugLabel}</Text>
            <Heading style={h1}>Factura F°{folio}</Heading>
            <Text style={subtitle}>{receiverCompanyName || "Estimado cliente"}</Text>
          </Section>

          <Text style={greeting}>Hola {recipientName},</Text>

          {paragraphs.length > 0 ? (
            paragraphs.map((p, i) => (
              <Text key={i} style={paragraph}>
                {p}
              </Text>
            ))
          ) : (
            <Text style={paragraph}>
              Le recordamos que tiene un pago pendiente correspondiente a la factura F°{folio}.
            </Text>
          )}

          <Section style={summaryBox}>
            <Text style={summaryRow}>
              <strong>Monto:</strong> {totalFormatted}
            </Text>
            {dueDate && (
              <Text style={summaryRow}>
                <strong>Vencimiento:</strong> {dueDate}
              </Text>
            )}
            {daysOverdue > 0 && (
              <Text style={{ ...summaryRow, color: "#B45309" }}>
                <strong>Mora:</strong> {daysOverdue} día{daysOverdue === 1 ? "" : "s"}
              </Text>
            )}
          </Section>

          <Hr style={hr} />

          <Text style={footer}>
            {senderName ? `${senderName}` : brandName}
            {senderEmail ? ` · ${senderEmail}` : ""}
            {website ? ` · ${website}` : ""}
          </Text>
          <Text style={footerMuted}>
            Este mensaje es un recordatorio de cobranza. Si ya realizó el pago, por favor
            ignore este correo o contáctenos para regularizar.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "24px 28px",
  maxWidth: "560px",
  borderRadius: "8px",
};

const logo = { margin: "0 0 16px" };

const brandTitle = {
  fontSize: "18px",
  fontWeight: "700" as const,
  margin: "0 0 16px",
};

const hero = { marginBottom: "16px" };

const badge = {
  display: "inline-block",
  fontSize: "11px",
  fontWeight: "600" as const,
  letterSpacing: "0.04em",
  textTransform: "uppercase" as const,
  color: "#64748b",
  margin: "0 0 8px",
};

const h1 = {
  color: "#0f172a",
  fontSize: "22px",
  fontWeight: "700" as const,
  margin: "0 0 4px",
};

const subtitle = {
  color: "#64748b",
  fontSize: "14px",
  margin: "0",
};

const greeting = {
  color: "#334155",
  fontSize: "15px",
  lineHeight: "24px",
  margin: "0 0 12px",
};

const paragraph = {
  color: "#334155",
  fontSize: "15px",
  lineHeight: "24px",
  margin: "0 0 12px",
};

const summaryBox = {
  backgroundColor: "#f8fafc",
  borderRadius: "8px",
  padding: "12px 16px",
  margin: "16px 0",
  border: "1px solid #e2e8f0",
};

const summaryRow = {
  color: "#334155",
  fontSize: "14px",
  lineHeight: "22px",
  margin: "0 0 4px",
};

const hr = { borderColor: "#e2e8f0", margin: "20px 0" };

const footer = {
  color: "#64748b",
  fontSize: "13px",
  margin: "0 0 8px",
};

const footerMuted = {
  color: "#94a3b8",
  fontSize: "12px",
  lineHeight: "18px",
  margin: "0",
};

export default CobranzaEmail;
