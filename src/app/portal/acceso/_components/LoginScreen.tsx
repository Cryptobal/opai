"use client";

import { FormEvent, useState } from "react";
import { ShieldCheck, Eye, EyeOff, Loader2 } from "lucide-react";

interface LoginScreenProps {
  onSuccess: () => void;
}

export function LoginScreen({ onSuccess }: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/callback/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          redirect: false,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(
          data?.error ?? "Credenciales incorrectas. Verifica e intenta de nuevo."
        );
      }

      // Attempt to verify session was established
      const sessionRes = await fetch("/api/auth/session");
      const sessionData = await sessionRes.json();

      if (sessionData?.user?.email) {
        onSuccess();
      } else {
        // Fallback: use signIn from next-auth via CSRF-safe POST
        const csrfRes = await fetch("/api/auth/csrf");
        const csrfData = await csrfRes.json();

        const formData = new URLSearchParams();
        formData.append("email", email.trim());
        formData.append("password", password);
        formData.append("csrfToken", csrfData.csrfToken);
        formData.append("redirect", "false");
        formData.append("json", "true");

        const signInRes = await fetch("/api/auth/callback/credentials", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: formData.toString(),
        });

        if (signInRes.ok) {
          onSuccess();
        } else {
          throw new Error("Credenciales incorrectas. Verifica e intenta de nuevo.");
        }
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Error al iniciar sesión. Intenta de nuevo."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[#0A0F1C] px-6">
      {/* Logo area */}
      <div className="mb-10 flex flex-col items-center">
        <div className="mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/logo-horizontal-white.png" alt="OPAI" className="h-10 object-contain mx-auto" />
        </div>
        <h1 className="mt-3 text-2xl font-bold text-white">Control de Acceso</h1>
        <p className="mt-1 text-sm text-gray-400">OPAI</p>
      </div>

      {/* Login form */}
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-5">
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Email */}
        <div className="space-y-1.5">
          <label htmlFor="login-email" className="block text-sm font-medium text-gray-300">
            Correo electrónico
          </label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="guardia@gardsecurity.com"
            className="w-full rounded-xl border border-gray-700 bg-gray-900/60 px-4 py-3 text-sm text-white placeholder-gray-500 outline-none transition-colors focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
          />
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <label htmlFor="login-password" className="block text-sm font-medium text-gray-300">
            Contrasena
          </label>
          <div className="relative">
            <input
              id="login-password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="********"
              className="w-full rounded-xl border border-gray-700 bg-gray-900/60 px-4 py-3 pr-12 text-sm text-white placeholder-gray-500 outline-none transition-colors focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 transition-colors hover:text-gray-200"
              aria-label={showPassword ? "Ocultar contrasena" : "Mostrar contrasena"}
            >
              {showPassword ? (
                <EyeOff className="h-4.5 w-4.5" />
              ) : (
                <Eye className="h-4.5 w-4.5" />
              )}
            </button>
          </div>
        </div>

        {/* Remember checkbox */}
        <label className="flex items-center gap-2.5 text-sm text-gray-400">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-cyan-500 focus:ring-cyan-500 focus:ring-offset-0"
          />
          Recordar sesion
        </label>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-400 disabled:opacity-60 disabled:cursor-not-allowed active:bg-cyan-600"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Iniciando sesion...
            </>
          ) : (
            "Iniciar Sesion"
          )}
        </button>
      </form>

      <p className="mt-8 text-xs text-gray-600 text-center">
        Si no tienes acceso, contacta a tu supervisor.
      </p>
      <p className="mt-2 text-xs text-gray-700 text-center">
        Powered by{" "}
        <a href="https://lx3.ai" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-500 transition-colors">LX3.ai</a>
      </p>
    </div>
  );
}
