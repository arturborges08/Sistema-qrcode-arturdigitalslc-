import { useState, type FormEvent } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { QrCode } from "lucide-react";
import { useAuth } from "../auth";
import { Button, Field, Input } from "../components/ui";

export function LoginPage() {
  const { status, login } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (status === "authenticated") {
    const from = (location.state as { from?: string } | null)?.from ?? "/";
    return <Navigate to={from} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError((err as Error).message);
      setPassword("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="mb-4 flex size-11 items-center justify-center rounded-xl bg-zinc-900 text-white">
            <QrCode className="size-5" aria-hidden />
          </span>
          <h1 className="text-xl font-semibold tracking-tight">Entrar no painel</h1>
          <p className="mt-1 text-sm text-zinc-500">Gestão das plaquinhas QR Code e NFC</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-zinc-200 bg-white p-6" noValidate>
          <Field label="E-mail" htmlFor="email">
            <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </Field>
          <Field label="Senha" htmlFor="password">
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" className="w-full" loading={loading} disabled={!email || !password}>
            Entrar
          </Button>
        </form>
      </div>
    </div>
  );
}
