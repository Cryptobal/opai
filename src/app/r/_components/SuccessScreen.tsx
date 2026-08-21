"use client";

export function SuccessScreen(props: {
  code: string;
  followUrl: string;
}) {
  return (
    <main style={{ maxWidth: 420, margin: "0 auto", padding: "40px 20px 80px" }}>
      <div
        aria-hidden
        style={{
          width: 88,
          height: 88,
          borderRadius: 99,
          margin: "0 auto 20px",
          background: "var(--rp-tint)",
          border: "3px solid var(--rp-ok)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--rp-ok)",
          fontSize: 36,
          fontWeight: 700,
          animation: "rp-stamp 0.45s ease-out",
        }}
      >
        ✓
      </div>
      <h1 style={{ textAlign: "center", fontSize: 22, margin: "0 0 8px" }}>
        Reporte enviado
      </h1>
      <p style={{ textAlign: "center", fontSize: 14, color: "#3d4a42", margin: "0 0 20px" }}>
        Guardia y supervisor notificados. Conserva este código para hacer seguimiento.
      </p>
      <div
        style={{
          fontFamily: "var(--rp-mono)",
          fontSize: 20,
          letterSpacing: "0.08em",
          textAlign: "center",
          padding: "14px 12px",
          borderRadius: "var(--rp-radius)",
          background: "var(--rp-card)",
          border: "1px solid var(--rp-line)",
          fontWeight: 700,
        }}
      >
        {props.code}
      </div>
      <a
        href={props.followUrl}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 48,
          marginTop: 20,
          borderRadius: "var(--rp-radius)",
          background: "var(--rp-brand)",
          color: "#fff",
          textDecoration: "none",
          fontWeight: 700,
        }}
      >
        Ver seguimiento
      </a>
    </main>
  );
}
