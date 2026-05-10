import Link from "next/link";

const REASONS: Record<
  string,
  { title: string; message: string; cta: string; href: string }
> = {
  missing_token: {
    title: "Link inválido",
    message:
      "Este enlace de verificación no es válido. Revisa que copiaste la URL completa.",
    cta: "Volver al registro",
    href: "/registro",
  },
  invalid_token: {
    title: "Link no encontrado",
    message:
      "Este enlace ya fue usado o no existe. Si ya verificaste tu cuenta, inicia sesión.",
    cta: "Iniciar sesión",
    href: "/opai/login",
  },
  expired: {
    title: "El link expiró",
    message:
      "Tu link de verificación caducó. Reenvíalo para recibir uno nuevo.",
    cta: "Reenviar verificación",
    href: "/registro/verificar-email",
  },
  provisioning_failed: {
    title: "Algo salió mal",
    message:
      "No pudimos crear tu cuenta. Ya avisamos al equipo. Por favor escríbenos a hola@opai.cl.",
    cta: "Volver al inicio",
    href: "/",
  },
};

export const metadata = {
  title: "Error de registro",
  robots: { index: false, follow: false },
};

export default async function SignupErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; email?: string }>;
}) {
  const sp = await searchParams;
  const reason = sp.reason ?? "invalid_token";
  const info = REASONS[reason] ?? REASONS.invalid_token;
  const href = info.href + (sp.email ? `?email=${encodeURIComponent(sp.email)}` : "");

  return (
    <main style={{ padding: "120px 24px 80px", display: "flex", justifyContent: "center" }}>
      <div className="mk-card" style={{ maxWidth: 480, width: "100%", padding: 40, textAlign: "center" }}>
        <h1 style={{
          fontFamily: "var(--mk-font-h)",
          fontSize: 28,
          fontWeight: 700,
          color: "var(--mk-text)",
          margin: "0 0 12px",
        }}>
          {info.title}
        </h1>
        <p style={{
          fontSize: 15,
          color: "var(--mk-muted)",
          lineHeight: 1.6,
          margin: "0 0 28px",
        }}>
          {info.message}
        </p>
        <Link href={href} className="mk-btn-primary" style={{ padding: "14px 28px", fontSize: 15 }}>
          {info.cta}
        </Link>
      </div>
    </main>
  );
}
