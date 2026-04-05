import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
  Hr,
} from "@react-email/components";
import * as React from "react";

interface AlertaCoberturaEmailProps {
  nombre: string;
  instalacion: string;
  direccion: string;
  horario: string;
  monto: string;
  funciones: string;
  urgencia: string | null;
  linkAceptar: string;
  esInterno: boolean;
  tiempoRestanteMin: number;
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL || "";

export default function AlertaCoberturaEmail({
  nombre,
  instalacion,
  direccion,
  horario,
  monto,
  funciones,
  urgencia,
  linkAceptar,
  esInterno,
  tiempoRestanteMin,
}: AlertaCoberturaEmailProps) {
  const esUrgente = urgencia === "URGENTE";
  const fullUrl = linkAceptar.startsWith("http") ? linkAceptar : `${SITE_URL}${linkAceptar}`;

  return (
    <Html>
      <Head />
      <Preview>
        {esUrgente ? "🚨 TURNO EXTRA URGENTE" : "⚠️ Turno Extra Disponible"} — {instalacion}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Img
              src={`${SITE_URL}/logo-white.png`}
              alt="OPAI"
              width={80}
              height={28}
              style={logo}
            />
          </Section>

          <Text style={categoryTag}>
            {esUrgente ? "🚨 URGENTE" : "⚠️ TURNO EXTRA"}
          </Text>

          <Heading style={h1}>
            {esUrgente ? "Turno Extra Urgente" : "Turno Extra Disponible"}
          </Heading>

          <Text style={greeting}>Hola {nombre},</Text>

          <Text style={text}>
            Hay un turno extra disponible que necesita cobertura:
          </Text>

          {/* Info box */}
          <Section style={infoBox}>
            <Text style={infoLabel}>Instalación</Text>
            <Text style={infoValue}>{instalacion}</Text>

            {direccion && (
              <>
                <Text style={infoLabel}>Dirección</Text>
                <Text style={infoValueSmall}>{direccion}</Text>
              </>
            )}

            <Text style={infoLabel}>Horario</Text>
            <Text style={infoValue}>{horario}</Text>

            <Text style={infoLabel}>Funciones</Text>
            <Text style={infoValueSmall}>{funciones}</Text>

            <Text style={infoLabel}>Monto Ofrecido</Text>
            <Text style={montoStyle}>{monto}</Text>
          </Section>

          {esInterno && tiempoRestanteMin > 0 && (
            <Text style={tiempoRestante}>
              {"⏱️"} Tienes {tiempoRestanteMin} minutos antes de que esta oferta se extienda a
              personal externo.
            </Text>
          )}

          <Section style={buttonWrap}>
            <Button href={fullUrl} style={esUrgente ? buttonUrgente : button}>
              {"✅"} ACEPTAR TURNO EXTRA
            </Button>
          </Section>

          <Hr style={hr} />

          <Text style={footnote}>
            Si no puedes asistir, simplemente ignora este mensaje.{" "}
            <Link
              href={`${SITE_URL}/portal/guardia`}
              style={footnoteLink}
            >
              Ir al portal
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: "#0c1222",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  padding: "32px 0",
};
const container = {
  backgroundColor: "#111827",
  borderRadius: "12px",
  maxWidth: "560px",
  margin: "0 auto",
  padding: "0",
  border: "1px solid #1e293b",
};
const header = {
  backgroundColor: "#0f172a",
  borderRadius: "12px 12px 0 0",
  padding: "20px 28px",
};
const logo = {
  display: "block" as const,
};
const categoryTag = {
  color: "#f59e0b",
  fontSize: "12px",
  fontWeight: "600" as const,
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
  margin: "0",
  padding: "20px 28px 0",
};
const h1 = {
  color: "#f1f5f9",
  fontSize: "20px",
  fontWeight: "600" as const,
  margin: "8px 0 12px",
  padding: "0 28px",
};
const greeting = {
  color: "#94a3b8",
  fontSize: "15px",
  lineHeight: "1.6",
  margin: "0 0 4px",
  padding: "0 28px",
};
const text = {
  color: "#94a3b8",
  fontSize: "15px",
  lineHeight: "1.6",
  margin: "0 0 16px",
  padding: "0 28px",
};
const infoBox = {
  backgroundColor: "#0f172a",
  borderRadius: "8px",
  border: "1px solid #1e293b",
  padding: "16px 20px",
  margin: "0 28px 16px",
};
const infoLabel = {
  color: "#64748b",
  fontSize: "11px",
  fontWeight: "600" as const,
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
  margin: "0 0 2px",
  padding: "0",
};
const infoValue = {
  color: "#f1f5f9",
  fontSize: "16px",
  fontWeight: "600" as const,
  margin: "0 0 12px",
  padding: "0",
};
const infoValueSmall = {
  color: "#cbd5e1",
  fontSize: "14px",
  margin: "0 0 12px",
  padding: "0",
};
const montoStyle = {
  color: "#22c55e",
  fontSize: "22px",
  fontWeight: "700" as const,
  margin: "0",
  padding: "0",
};
const tiempoRestante = {
  color: "#f59e0b",
  fontSize: "13px",
  fontWeight: "500" as const,
  lineHeight: "1.5",
  margin: "0 0 16px",
  padding: "0 28px",
};
const buttonWrap = {
  textAlign: "center" as const,
  padding: "8px 28px 20px",
};
const button = {
  backgroundColor: "#00d4aa",
  color: "#0f172a",
  borderRadius: "8px",
  padding: "14px 32px",
  textDecoration: "none",
  fontSize: "15px",
  fontWeight: "700" as const,
};
const buttonUrgente = {
  backgroundColor: "#ef4444",
  color: "#ffffff",
  borderRadius: "8px",
  padding: "14px 32px",
  textDecoration: "none",
  fontSize: "15px",
  fontWeight: "700" as const,
};
const hr = {
  borderColor: "#1e293b",
  margin: "0",
};
const footnote = {
  color: "#475569",
  fontSize: "12px",
  lineHeight: "1.5",
  padding: "16px 28px",
  margin: "0",
};
const footnoteLink = {
  color: "#00d4aa",
  textDecoration: "underline",
};
