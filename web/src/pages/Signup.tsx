import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { Check } from "lucide-react";
import { useAuth } from "../auth";
import { ApiError, api } from "../lib/api";
import { formatMoney } from "../lib/format";
import type { PlanInfo } from "../lib/types";
import { useAsync } from "../lib/useAsync";
import { AuthShell } from "../components/AuthShell";
import { Button, ErrorBox, Field, Input, Spinner } from "../components/ui";

export function SignupPage() {
  const { status, signup } = useAuth();
  const { data: plan, error: planError, loading: planLoading, reload } = useAsync(() => api<PlanInfo>("/billing/plan"), []);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (status === "authenticated") return <Navigate to="/plano" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Informe seu nome";
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) errs.email = "Informe um e-mail válido";
    if (password.length < 8) errs.password = "A senha precisa ter pelo menos 8 caracteres";
    setFieldErrors(errs);
    setError(null);
    if (Object.keys(errs).length) return;
    setLoading(true);
    try {
      await signup({ name: name.trim(), email: email.trim(), password });
    } catch (err) {
      if (err instanceof ApiError && err.fields?.length) {
        setFieldErrors(Object.fromEntries(err.fields.map((f) => [f.path, f.message])));
      } else setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const price = plan ? formatMoney(plan.priceCents) : "";

  return (
    <AuthShell
      title="Criar conta"
      subtitle={plan?.signupEnabled ? <>Plano mensal de <strong className="text-zinc-800">{price}</strong>. Você paga depois de criar a conta.</> : undefined}
      footer={
        <>
          Já tem conta?{" "}
          <Link to="/login" className="font-medium text-brand-600 hover:underline">
            Entrar
          </Link>
        </>
      }
    >
      {planLoading && !plan ? (
        <Spinner />
      ) : planError ? (
        <ErrorBox message={planError} onRetry={reload} />
      ) : !plan?.signupEnabled ? (
        <p className="text-center text-sm text-zinc-600">Os cadastros ainda não estão abertos. Volte em breve.</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="Seu nome ou nome do negócio" htmlFor="name" error={fieldErrors.name}>
            <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} invalid={!!fieldErrors.name} autoFocus />
          </Field>
          <Field label="E-mail" htmlFor="email" error={fieldErrors.email} hint="Você usa este e-mail para entrar.">
            <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} invalid={!!fieldErrors.email} />
          </Field>
          <Field label="Senha" htmlFor="password" error={fieldErrors.password} hint="Mínimo de 8 caracteres.">
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              invalid={!!fieldErrors.password}
            />
          </Field>
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </p>
          )}
          <ul className="space-y-1.5 rounded-xl bg-stone-50 p-3 text-xs text-zinc-600">
            {[`Até ${plan.maxPlates} QR Codes`, "Troque o link quando quiser", `${price} a cada ${plan.days} dias, sem fidelidade`].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <Check className="size-3.5 text-emerald-600" aria-hidden /> {t}
              </li>
            ))}
          </ul>
          <Button type="submit" variant="primary" className="w-full" loading={loading}>
            Criar conta e ir para o pagamento
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
