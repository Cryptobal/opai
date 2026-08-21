export function ReporteErrorState(props: {
  title: string;
  message: string;
}) {
  return (
    <main
      style={{
        maxWidth: 420,
        margin: "0 auto",
        padding: "48px 20px",
        minHeight: "100dvh",
      }}
    >
      <p
        style={{
          fontSize: 12,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--rp-brand)",
          fontWeight: 600,
          margin: 0,
        }}
      >
        Canal oficial de reportes
      </p>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: "12px 0 8px" }}>
        {props.title}
      </h1>
      <p style={{ fontSize: 15, lineHeight: 1.5, color: "#3d4a42", margin: 0 }}>
        {props.message}
      </p>
    </main>
  );
}
