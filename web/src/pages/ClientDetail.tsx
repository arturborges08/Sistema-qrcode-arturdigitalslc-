import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, KeyRound, PackagePlus, Trash2 } from "lucide-react";
import { api, ApiError } from "../lib/api";
import type { BatchSummary, Client, PlateList } from "../lib/types";
import { useAsync } from "../lib/useAsync";
import { Button, buttonClass, Card, CardHeader, ErrorBox, Field, Input, PageHeader, Spinner, Switch } from "../components/ui";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { CopyButton } from "../components/CopyButton";
import { PlateRow } from "../components/PlateRow";
import { useToast } from "../components/Toast";
import { accessMessage, generatePassword } from "./Clients";

export function ClientDetailPage() {
  const { id = "" } = useParams();
  const { data: client, setData: setClient, error, loading, reload } = useAsync(() => api<Client>(`/clients/${id}`), [id]);
  const plates = useAsync(() => api<PlateList>(`/plates?client=${id}&pageSize=200`), [id]);

  if (loading && !client) return <Spinner />;
  if (error || !client)
    return (
      <div className="mx-auto max-w-xl">
        <ErrorBox message={error ?? "Cliente não encontrado"} onRetry={reload} />
      </div>
    );

  const refresh = () => {
    reload();
    plates.reload();
  };

  return (
    <>
      <Link to="/clientes" className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900">
        <ArrowLeft className="size-4" aria-hidden /> Clientes
      </Link>
      <PageHeader
        title={client.name ?? client.email}
        description={`${client.email} · ${client.plates} ${client.plates === 1 ? "plaquinha" : "plaquinhas"} · ${client.configured} com link`}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <AssignCard client={client} onAssigned={refresh} />
          <Card>
            <CardHeader
              title="Plaquinhas deste cliente"
              action={
                client.plates > 0 ? (
                  <Link to={`/plaquinhas?cliente=${client.id}`} className={buttonClass("ghost", "sm")}>
                    Abrir na lista
                  </Link>
                ) : undefined
              }
            />
            {plates.loading && !plates.data ? (
              <Spinner />
            ) : plates.error ? (
              <div className="p-4">
                <ErrorBox message={plates.error} onRetry={plates.reload} />
              </div>
            ) : !plates.data?.items.length ? (
              <p className="px-5 py-6 text-sm text-zinc-500">Nenhuma plaquinha entregue ainda.</p>
            ) : (
              <ul className="divide-y divide-zinc-100" data-testid="client-plates">
                {plates.data.items.map((p) => (
                  <PlateRow key={p.id} plate={p} />
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          <AccountCard client={client} onSaved={setClient} />
          <DeleteCard client={client} />
        </div>
      </div>
    </>
  );
}

function AssignCard({ client, onAssigned }: { client: Client; onAssigned: () => void }) {
  const toast = useToast();
  const batches = useAsync(() => api<{ items: BatchSummary[] }>("/plates/batches"), []);
  const [batch, setBatch] = useState("");
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!batch) return;
    setSaving(true);
    try {
      const r = await api<{ assigned: number; skipped: number }>(`/clients/${client.id}/assign`, { method: "POST", body: { batchName: batch } });
      toast(
        "success",
        r.skipped
          ? `${r.assigned} entregues. ${r.skipped} já eram de outro cliente e ficaram como estavam.`
          : `${r.assigned} ${r.assigned === 1 ? "plaquinha entregue" : "plaquinhas entregues"} a ${client.name ?? client.email}.`,
      );
      setBatch("");
      onAssigned();
    } catch (err) {
      toast("error", (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Entregar lote"
        description="Todas as plaquinhas do lote passam a ser deste cliente. Plaquinhas que já são de outro cliente não mudam. Para uma plaquinha só, abra a plaquinha e escolha o cliente."
      />
      <form onSubmit={onSubmit} className="flex flex-col gap-2 p-5 sm:flex-row sm:items-end" noValidate>
        <div className="flex-1">
          <Field label="Lote" htmlFor="assign-batch">
            <select
              id="assign-batch"
              value={batch}
              onChange={(e) => setBatch(e.target.value)}
              className="h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
            >
              <option value="">{batches.loading ? "Carregando…" : batches.data?.items.length ? "Escolha um lote" : "Nenhum lote gerado"}</option>
              {batches.data?.items.map((b) => (
                <option key={b.batchName} value={b.batchName}>
                  {b.batchName} ({b.total})
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Button type="submit" variant="primary" loading={saving} disabled={!batch} icon={<PackagePlus className="size-4" />}>
          Entregar
        </Button>
      </form>
    </Card>
  );
}

function AccountCard({ client, onSaved }: { client: Client; onSaved: (c: Client) => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: client.name ?? "", email: client.email });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const dirty = form.name !== (client.name ?? "") || form.email !== client.email;

  async function patch(body: object) {
    return api<Client>(`/clients/${client.id}`, { method: "PATCH", body });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      onSaved(await patch({ name: form.name, email: form.email }));
      toast("success", "Dados salvos.");
    } catch (err) {
      if (err instanceof ApiError && err.fields?.length) setErrors(Object.fromEntries(err.fields.map((f) => [f.path, f.message])));
      else if (err instanceof ApiError && err.status === 409) setErrors({ email: err.message });
      else toast("error", (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function toggle(active: boolean) {
    setToggling(true);
    try {
      onSaved(await patch({ active }));
      toast("success", active ? "Acesso liberado." : "Acesso bloqueado. O cliente foi desconectado. As plaquinhas continuam funcionando.");
    } catch (err) {
      toast("error", (err as Error).message);
    } finally {
      setToggling(false);
    }
  }

  async function resetPassword() {
    const pw = generatePassword();
    setResetting(true);
    try {
      const c = await patch({ password: pw });
      setResetMsg(accessMessage(c.name ?? "", c.email, pw));
    } catch (err) {
      toast("error", (err as Error).message);
    } finally {
      setResetting(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Acesso do cliente" />
      <div className="border-b border-zinc-100 px-5 py-4">
        <Switch checked={client.active} onChange={toggle} disabled={toggling} label={client.active ? "Acesso liberado" : "Acesso bloqueado"} />
      </div>
      <form onSubmit={onSubmit} className="space-y-5 p-5" noValidate>
        <Field label="Nome" htmlFor="e-name" error={errors.name}>
          <Input id="e-name" maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="E-mail de acesso" htmlFor="e-email" error={errors.email}>
          <Input id="e-email" type="email" autoCapitalize="none" maxLength={254} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <div className="flex justify-end">
          <Button type="submit" variant="primary" loading={saving} disabled={!dirty}>
            Salvar
          </Button>
        </div>
      </form>
      <div className="space-y-3 border-t border-zinc-100 p-5">
        {resetMsg ? (
          <>
            <p className="text-sm text-zinc-700">Senha nova gerada. O cliente foi desconectado. Envie o acesso abaixo:</p>
            <pre className="whitespace-pre-wrap break-words rounded-lg bg-zinc-50 p-3 text-xs text-zinc-800 ring-1 ring-zinc-200" data-testid="access-message">
              {resetMsg}
            </pre>
            <CopyButton value={resetMsg} label="Copiar acesso" size="md" />
          </>
        ) : (
          <Button onClick={resetPassword} loading={resetting} icon={<KeyRound className="size-4" />}>
            Gerar nova senha
          </Button>
        )}
      </div>
    </Card>
  );
}

function DeleteCard({ client }: { client: Client }) {
  const nav = useNavigate();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function onDelete() {
    setDeleting(true);
    try {
      await api(`/clients/${client.id}`, { method: "DELETE" });
      toast("success", "Cliente excluído. As plaquinhas dele continuam funcionando e voltaram para você.");
      nav("/clientes", { replace: true });
    } catch (err) {
      toast("error", (err as Error).message);
      setDeleting(false);
      setOpen(false);
    }
  }

  return (
    <Card className="border-red-200">
      <div className="flex flex-col gap-3 p-5">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">Excluir cliente</h2>
          <p className="mt-0.5 text-sm text-zinc-500">Apaga o acesso. As plaquinhas e os links continuam funcionando e voltam a ser só suas.</p>
        </div>
        <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => setOpen(true)}>
          Excluir cliente
        </Button>
      </div>
      <ConfirmDialog open={open} title="Excluir este cliente?" confirmLabel="Excluir cliente" danger loading={deleting} onConfirm={onDelete} onClose={() => setOpen(false)}>
        <p>
          <strong className="text-zinc-900">{client.name ?? client.email}</strong> não vai mais conseguir entrar. As {client.plates} plaquinhas dele continuam
          redirecionando para os links atuais.
        </p>
      </ConfirmDialog>
    </Card>
  );
}
