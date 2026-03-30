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

interface AlertaAceptadaEmailProps {
  supervisorNombre: string;
  guardiaNombre: string;
  guardiaPhone: string | null;
  guardiaEmail: string | null;
  instalacion: string;
  direccion?: string;
  horario?: string;
  monto?: string;
  funciones?: string;
  distanciaKm: number | null;
  esInterno: boolean;
  linkAlerta: string;
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://opai.gard.cl";

export default function AlertaAceptadaEmail({
  supervisorNombre,
  guardiaNombre,
  guardiaPhone,
  guardiaEmail,
  instalacion,
  direccion,
  horario,
  monto,
  funciones,
  distanciaKm,
  esInterno,
  linkAlerta,
}: AlertaAceptadaEmailProps) {
  const fullUrl = linkAlerta.startsWith("http") ? linkAlerta : `${SITE_URL}${linkAlerta}`;

  return (
    <Html>
      <Head />
      <Preview>
        {"✅"} Cobertura Resuelta — {guardiaNombre} aceptó el turno en {instalacion}
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

          <Text style={categoryTag}>{"✅"} COBERTURA RESUELTA</Text>

          <Heading style={h1}>Guardia Confirmado</Heading>

          <Text style={greeting}>Hola {supervisorNombre},</Text>

          <Text style={text}>
            Un guardia ha aceptado la alerta de cobertura para {instalacion}.
          </Text>

          {/* Info box */}
          <Section style={infoBox}>
            <Text style={infoLabel}>Guardia</Text>
            <Text style={infoValue}>{guardiaNombre}</Text>

            {!esInterno && (
              <>
                <Text style={infoLabel}>Tipo</Text>
                <Text style={externoBadge}>Personal Externo</Text>
              </>
            )}

            {guardiaPhone && (
              <>
                <Text style={infoLabel}>Teléfono</Text>
                <Text style={infoValueSmall}>{guardiaPhone}</Text>
              </>
            )}

            {guardiaEmail && (
              <>
                <Text style={infoLabel}>Email</Text>
                <Text style={infoValueSmall}>{guardiaEmail}</Text>
              </>
            )}

            <Text style={infoLabel}>Instalación</Text>
            <Text style={infoValue}>{instalacion}</Text>

            {direccion && (
              <>
                <Text style={infoLabel}>Dirección</Text>
                <Text style={infoValueSmall}>{direccion}</Text>
              </>
            )}

            {horario && (
              <>
                <Text style={infoLabel}>Horario</Text>
                <Text style={infoValueSmall}>{horario}</Text>
              </>
            )}

            {monto && (
              <>
                <Text style={infoLabel}>Monto ofrecido</Text>
                <Text style={{ ...infoValueSmall, color: "#22c55e", fontWeight: "600" }}>{monto}</Text>
              </>
            )}

            {funciones && (
              <>
                <Text style={infoLabel}>Funciones</Text>
                <Text style={infoValueSmall}>{funciones}</Text>
              </>
            )}

            {distanciaKm != null && (
              <>
                <Text style={infoLabel}>Distancia del guardia</Text>
                <Text style={infoValueSmall}>{distanciaKm} km de la instalación</Text>
              </>
            )}
          </Section>

          <Section style={accionBox}>
            <Text style={{ ...infoLabel, color: "#f59e0b" }}>{"⚠️"} ACCIÓN REQUERIDA</Text>
            <Text style={{ ...infoValueSmall, color: "#f1f5f9", margin: "4px 0 0" }}>
              Cuando el guardia se presente, confirma su asistencia en OPAI.
              Si no se presenta, usa "Re-Alertar" para buscar otro guardia.
            </Text>
          </Section>

          <Section style={buttonWrap}>
            <Button href={fullUrl} style={button}>
              Ver Detalle de Alerta
            </Button>
          </Section>

          <Hr style={hr} />

          <Text style={footnote}>
            Esta notificación fue enviada desde OPAI.{" "}
            <Link
              href={`${SITE_URL}/opai/perfil/notificaciones`}
              style={footnoteLink}
            >
              Editar tus notificaciones
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
  color: "#22c55e",
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
const externoBadge = {
  color: "#f59e0b",
  fontSize: "12px",
  fontWeight: "600" as const,
  backgroundColor: "#451a03",
  borderRadius: "4px",
  padding: "2px 8px",
  margin: "0 0 12px",
  display: "inline-block" as const,
};
const accionBox = {
  backgroundColor: "#451a03",
  borderRadius: "8px",
  border: "1px solid #78350f",
  padding: "12px 16px",
  margin: "0 28px 16px",
};
const buttonWrap = {
  textAlign: "center" as const,
  padding: "8px 28px 20px",
};
const button = {
  backgroundColor: "#00d4aa",
  color: "#0f172a",
  borderRadius: "8px",
  padding: "12px 24px",
  textDecoration: "none",
  fontSize: "14px",
  fontWeight: "600" as const,
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
