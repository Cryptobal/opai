import {
  Body,
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
import { getEmailLogoUrl, getCanonicalSiteUrl } from "@/lib/emails/site-url";
import type { PlatformAlertData } from "@/lib/notifications/notify-platform";

const styles = {
  body: {
    backgroundColor: "#f4f6f9",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    margin: 0,
    padding: "32px 0",
  },
  container: {
    backgroundColor: "#ffffff",
    borderRadius: "8px",
    maxWidth: "600px",
    margin: "0 auto",
    padding: "32px",
  },
  header: {
    borderBottom: "2px solid #0066FF",
    paddingBottom: "16px",
    marginBottom: "24px",
  },
  badge: (color: string) => ({
    display: "inline-block",
    padding: "4px 12px",
    borderRadius: "12px",
    fontSize: "12px",
    fontWeight: 600,
    color: "#fff",
    backgroundColor: color,
  }),
  h1: { fontSize: "20px", fontWeight: 700, color: "#0D1117", margin: "12px 0 4px" },
  sectionTitle: {
    fontSize: "14px",
    fontWeight: 700,
    color: "#6b7280",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    margin: "20px 0 8px",
  },
  table: { width: "100%", borderCollapse: "collapse" as const, marginTop: "12px" },
  td: {
    padding: "8px 0",
    fontSize: "14px",
    color: "#374151",
    borderBottom: "1px solid #f0f0f0",
  },
  tdLabel: { fontWeight: 600, color: "#6b7280", width: "35%" },
  cta: {
    display: "inline-block",
    backgroundColor: "#0066FF",
    color: "#fff",
    textDecoration: "none",
    padding: "12px 24px",
    borderRadius: "6px",
    fontWeight: 600,
    fontSize: "14px",
    marginTop: "16px",
  },
  small: { fontSize: "12px", color: "#9ca3af" },
};

const eventColor = (event: string) =>
  event === "signup_verified" ? "#10b981" :
  event === "signup_pending" ? "#f59e0b" :
  "#ef4444";

const eventLabel = (event: string) =>
  event === "signup_verified" ? "ACTIVADO" :
  event === "signup_pending" ? "PENDIENTE" :
  "FALLÓ";

export default function PlatformAlertEmail(props: PlatformAlertData) {
  const logoUrl = getEmailLogoUrl();
  const adminUrl = props.platformAdminUrl ?? `${getCanonicalSiteUrl()}/platform/tenants`;
  const tenantUrl = props.tenantUrl;
  const addressLine = [props.address, props.commune, props.city]
    .filter(Boolean)
    .join(", ");

  return (
    <Html>
      <Head />
      <Preview>{`${eventLabel(props.event)}: ${props.commercialName}`}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            {logoUrl ? <Img src={logoUrl} alt="Opai" width="80" /> : null}
            <span style={styles.badge(eventColor(props.event))}>{eventLabel(props.event)}</span>
            <Heading style={styles.h1}>{props.commercialName}</Heading>
            <Text style={styles.small}>
              {props.event === "signup_pending" && "Esperando verificación de email del owner."}
              {props.event === "signup_verified" && "Tenant provisionado y activo."}
              {props.event === "signup_failed" && `Error: ${props.errorMessage ?? "desconocido"}`}
            </Text>
          </Section>

          <Heading style={styles.sectionTitle}>Contacto</Heading>
          <table style={styles.table}>
            <tbody>
              <tr>
                <td style={{ ...styles.td, ...styles.tdLabel }}>Nombre</td>
                <td style={styles.td}>{props.ownerName}</td>
              </tr>
              <tr>
                <td style={{ ...styles.td, ...styles.tdLabel }}>Email</td>
                <td style={styles.td}>
                  <Link href={`mailto:${props.ownerEmail}`}>{props.ownerEmail}</Link>
                </td>
              </tr>
              {props.ownerPhone ? (
                <tr>
                  <td style={{ ...styles.td, ...styles.tdLabel }}>Teléfono</td>
                  <td style={styles.td}>
                    <Link href={`tel:${props.ownerPhone}`}>{props.ownerPhone}</Link>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>

          <Heading style={styles.sectionTitle}>Empresa</Heading>
          <table style={styles.table}>
            <tbody>
              {props.legalName ? (
                <tr>
                  <td style={{ ...styles.td, ...styles.tdLabel }}>Razón social</td>
                  <td style={styles.td}>{props.legalName}</td>
                </tr>
              ) : null}
              {props.companyRut ? (
                <tr>
                  <td style={{ ...styles.td, ...styles.tdLabel }}>RUT</td>
                  <td style={styles.td}>{props.companyRut}</td>
                </tr>
              ) : null}
              {props.industry ? (
                <tr>
                  <td style={{ ...styles.td, ...styles.tdLabel }}>Industria</td>
                  <td style={styles.td}>{props.industry}</td>
                </tr>
              ) : null}
              {props.estimatedGuards ? (
                <tr>
                  <td style={{ ...styles.td, ...styles.tdLabel }}>Guardias estim.</td>
                  <td style={styles.td}>{props.estimatedGuards}</td>
                </tr>
              ) : null}
              {addressLine ? (
                <tr>
                  <td style={{ ...styles.td, ...styles.tdLabel }}>Dirección</td>
                  <td style={styles.td}>{addressLine}</td>
                </tr>
              ) : null}
              {props.giro ? (
                <tr>
                  <td style={{ ...styles.td, ...styles.tdLabel }}>Giro</td>
                  <td style={styles.td}>{props.giro}</td>
                </tr>
              ) : null}
            </tbody>
          </table>

          {props.siiData ? (
            <>
              <Heading style={styles.sectionTitle}>SII</Heading>
              <table style={styles.table}>
                <tbody>
                  {props.siiData.fechaInicioActividades ? (
                    <tr>
                      <td style={{ ...styles.td, ...styles.tdLabel }}>Inicio actividades</td>
                      <td style={styles.td}>{props.siiData.fechaInicioActividades}</td>
                    </tr>
                  ) : null}
                  <tr>
                    <td style={{ ...styles.td, ...styles.tdLabel }}>Tamaño SII</td>
                    <td style={styles.td}>
                      {props.siiData.esEmpresaMenorTamano ? "PYME" : "No PYME"}
                    </td>
                  </tr>
                  {props.siiData.actividadesEconomicas?.length ? (
                    <tr>
                      <td style={{ ...styles.td, ...styles.tdLabel }}>Actividades</td>
                      <td style={styles.td}>
                        {props.siiData.actividadesEconomicas
                          .slice(0, 3)
                          .map((a) => `${a.codigo} ${a.descripcion}`)
                          .join(" · ")}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </>
          ) : null}

          {(props.source || props.utmSource || props.ip) ? (
            <>
              <Heading style={styles.sectionTitle}>Origen</Heading>
              <table style={styles.table}>
                <tbody>
                  {props.source ? (
                    <tr>
                      <td style={{ ...styles.td, ...styles.tdLabel }}>Source</td>
                      <td style={styles.td}>{props.source}</td>
                    </tr>
                  ) : null}
                  {props.utmSource ? (
                    <tr>
                      <td style={{ ...styles.td, ...styles.tdLabel }}>UTM source</td>
                      <td style={styles.td}>{props.utmSource}</td>
                    </tr>
                  ) : null}
                  {props.utmCampaign ? (
                    <tr>
                      <td style={{ ...styles.td, ...styles.tdLabel }}>UTM campaign</td>
                      <td style={styles.td}>{props.utmCampaign}</td>
                    </tr>
                  ) : null}
                  {props.ip ? (
                    <tr>
                      <td style={{ ...styles.td, ...styles.tdLabel }}>IP</td>
                      <td style={styles.td}>{props.ip}</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </>
          ) : null}

          <Hr style={{ borderColor: "#e5e7eb", margin: "24px 0" }} />

          <Section style={{ textAlign: "center" as const }}>
            {tenantUrl ? (
              <Link href={tenantUrl} style={styles.cta}>
                Ver tenant
              </Link>
            ) : null}
            {" "}
            <Link href={adminUrl} style={{ ...styles.cta, backgroundColor: "#374151" }}>
              Platform Admin
            </Link>
          </Section>

          <Text style={{ ...styles.small, marginTop: "24px", textAlign: "center" as const }}>
            Notificación automática · Opai Platform
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
