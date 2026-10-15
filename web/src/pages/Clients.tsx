import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, KeyRound, UserPlus, Users } from "lucide-react";
import { api, ApiError } from "../lib/api";
import type { Client } from "../lib/types";
import { useAsync } from "../lib/useAsync";
import { Button, Card, CardHeader, EmptyState, ErrorBox, Field, Input, PageHeader, Spinner } from "../components/ui";
import { CopyButton } from "../components/CopyButton";
import { useToast } from "../components/Toast";

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** Senha aleatória fácil de digitar no celular (sem caracteres ambíguos). */
export function generatePassword(length = 10) {
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export function accessMessage(name: string, email: string, password: string) {
  return [
    `Olá, ${name}! Seu acesso para configurar as plaquinhas:`,
    `Endereço: ${window.location.origin}/login`,
    `E-mail: ${email}`,
    `Senha: ${password}`,
    "Depois de entrar, toque em Escanear e aponte para a plaquinha para definir ou trocar o link.",
  ].join("\n");
}

export function ClientsPage() {
  const { data, error, loading, reload } = useAsync(() => api<{ items: Client[] }>("/clients"), []);
  return (
    <>
      <PageHeader title="Clientes" description="Revendedores que compraram plaquinhas. Cada um entra com o próprio e-mail e só mexe nas plaquinhas dele." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="min-w-0">
          {loading && !data ? (
            <Spinner />
          ) : error ? (
            <div className="p-4">
              <ErrorBox message={error} onRetry={reload} />
            </div>
          ) : !data || data.items.length === 0 ? (
            <EmptyState icon={<Users className="size-5" />} title="Nenhum cliente ainda" description="Cadastre o primeiro cliente ao lado." />
          ) : (
            <ul className="divide-y divide-zinc-100" data-testid="clients">
              {data.items.map((c) => (
                <li key={c.id}>
                  <Link to={`/clientes/${c.id}`} className="group flex items-center gap-4 px-5 py-3.5 hover:bg-zinc-50">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-zinc-900">{c.name ?? c.email}</p>
                      <p className="mt-0.5 truncate text-xs text-zinc-500">
                        {c.email} · {c.plates} {c.plates === 1 ? "plaquinha" : "plaquinhas"} · {c.configured} com link
                      </p>
                    </div>
                    {!c.active && <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">Desativado</span>}
                    <ChevronRight className="size-4 shrink-0 text-zinc-300 group-hover:text-zinc-500" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <NewClientCard onCreated={reload} />
      </div>
    </>
  );
}

function NewClientCard({ onCreated }: { onCreated: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: "", email: "", password: generatePassword() });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ id: string; message: string } | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = "Informe o nome";
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) errs.email = "Informe um e-mail válido";
    if (form.password.length < 8) errs.password = "A senha deve ter pelo menos 8 caracteres";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const c = await api<Client>("/clients", { method: "POST", body: form });
      setCreated({ id: c.id, message: accessMessage(c.name ?? "", c.email, form.password) });
      setForm({ name: "", email: "", password: generatePassword() });
      toast("success", "Cliente cadastrado.");
      onCreated();
    } catch (err) {
      if (err instanceof ApiError && err.fields?.length) setErrors(Object.fromEntries(err.fields.map((f) => [f.path, f.message])));
      else if (err instanceof ApiError && err.status === 409) setErrors({ email: err.message });
      else toast("error", (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="lg:sticky lg:top-20 lg:self-start">
      <CardHeader title="Novo cliente" description="Depois, entregue um lote de plaquinhas a ele na página do cliente." />
      {created ? (
        <div className="space-y-4 p-5" role="status">
          <p className="text-sm text-zinc-700">Envie este acesso ao cliente. A senha não aparece de novo depois que você sair desta tela.</p>
          <pre className="whitespace-pre-wrap break-words rounded-lg bg-zinc-50 p-3 text-xs text-zinc-800 ring-1 ring-zinc-200" data-testid="access-message">
            {created.message}
          </pre>
          <div className="flex flex-wrap gap-2">
            <CopyButton value={created.message} label="Copiar acesso" size="md" />
            <Link to={`/clientes/${created.id}`} className="inline-flex h-10 items-center rounded-lg px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-100">
              Entregar plaquinhas
            </Link>
            <Button variant="ghost" onClick={() => setCreated(null)}>
              Cadastrar outro
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-5 p-5" noValidate>
          <Field label="Nome" htmlFor="n-name" error={errors.name} hint="Como você identifica o revendedor">
            <Input id="n-name" maxLength={120} value={form.name} invalid={!!errors.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="E-mail de acesso" htmlFor="n-email" error={errors.email}>
            <Input id="n-email" type="email" inputMode="email" autoCapitalize="none" maxLength={254} value={form.email} invalid={!!errors.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Senha inicial" htmlFor="n-password" error={errors.password} hint="Gerada automaticamente. O cliente pode trocar depois.">
            <div className="flex gap-2">
              <Input id="n-password" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={128} value={form.password} invalid={!!errors.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              <Button type="button" onClick={() => setForm({ ...form, password: generatePassword() })} aria-label="Gerar outra senha" icon={<KeyRound className="size-4" />} />
            </div>
          </Field>
          <div className="flex justify-end">
            <Button type="submit" variant="primary" loading={saving} icon={<UserPlus className="size-4" />}>
              Cadastrar cliente
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
