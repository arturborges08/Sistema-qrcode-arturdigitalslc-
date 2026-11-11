import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth";
import { Button, Field, Input } from "../components/ui";
import { AuthShell } from "../components/AuthShell";

export function LoginPage() {
  const { status, login } = useAuth();
  const location = useLocation();
  const [params] = useSearchParams();
  // Volta para a plaquinha escaneada depois do login. Só caminhos internos /r/CODIGO são aceitos.
  const voltar = params.get("voltar");
  const backToScan = voltar && /^\/r\/[A-Za-z0-9]{4,32}$/.test(voltar) ? voltar : null;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (status === "authenticated" && backToScan) {
    window.location.replace(backToScan);
    return null;
  }
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
    <AuthShell
      title="Entrar"
      subtitle="Acesse o painel das suas plaquinhas"
      footer={
        <>
          Ainda não tem conta?{" "}
          <Link to="/cadastro" className="font-medium text-brand-600 hover:underline">
            Criar conta
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
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
        <p className="text-center text-xs text-zinc-500">Esqueceu a senha? Fale com quem criou o seu acesso.</p>
      </form>
    </AuthShell>
  );
}
