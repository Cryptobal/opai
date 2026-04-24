import ClientPsychSection from "@/components/psych/client-portal/ClientPsychSection";

export const dynamic = "force-dynamic";
export const metadata = { title: "Seguridad del personal" };

export default function ClientPsychPage() {
  return (
    <main className="min-h-dvh bg-slate-50 text-slate-900 p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <header>
          <h1 className="text-2xl font-semibold">Seguridad del personal</h1>
          <p className="text-sm text-slate-600">
            Estado de las evaluaciones psicolaborales del personal asignado a
            tus contratos.
          </p>
        </header>
        <ClientPsychSection />
      </div>
    </main>
  );
}
