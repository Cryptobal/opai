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
    href: "/registrarse",
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
    href: "/registro/reenviar",
  },
  provisioning_failed: {
    title: "Algo salió mal",
    message:
      "No pudimos crear tu cuenta. Ya avisamos al equipo. Por favor escríbenos a hola@opai.cl.",
    cta: "Volver al inicio",
    href: "/",
  },
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
    <main className="min-h-screen flex items-center justify-center bg-[#0D1117] text-white p-6">
      <div className="max-w-md w-full text-center">
        <h1 className="text-2xl font-bold mb-3">{info.title}</h1>
        <p className="text-slate-400 mb-6">{info.message}</p>
        <Link
          href={href}
          className="inline-block bg-[#0066FF] text-white font-semibold px-6 py-3 rounded-lg hover:bg-[#0052CC] transition"
        >
          {info.cta}
        </Link>
      </div>
    </main>
  );
}
