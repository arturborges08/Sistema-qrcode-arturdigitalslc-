import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Download, ExternalLink, History, Printer, Trash2 } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { checkUrl, formatDateTime } from "../lib/format";
import type { Client, HistoryItem, Plate } from "../lib/types";
import { useAsync } from "../lib/useAsync";
import { Button, buttonClass, Card, CardHeader, ErrorBox, Field, Input, PageHeader, PendingBadge, Spinner, StatusBadge, Switch, Textarea } from "../components/ui";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { CopyButton } from "../components/CopyButton";
import { useToast } from "../components/Toast";

export function PlateDetailPage() {
  const { id = "" } = useParams();
  const { data: plate, setData: setPlate, error, loading, reload } = useAsync(() => api<Plate>(`/plates/${id}`), [id]);
  const history = useAsync(() => api<{ items: HistoryItem[] }>(`/plates/${id}/history`), [id]);

  if (loading && !plate) return <Spinner />;
  if (error || !plate)
    return (
      <div className="mx-auto max-w-xl">
        <ErrorBox message={error ?? "Plaquinha não encontrada"} onRetry={reload} />
        <Link to="/plaquinhas" className="mt-4 inline-block text-sm font-medium text-zinc-600 hover:text-zinc-900">
          Voltar para a lista
        </Link>
      </div>
    );

  const onSaved = (p: Plate) => {
    setPlate(p);
    history.reload();
  };

  return (
    <>
      <Link to="/plaquinhas" className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900">
        <ArrowLeft className="size-4" aria-hidden /> Plaquinhas
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="break-words">{plate.businessName ?? "Plaquinha sem nome"}</span>
            {plate.configured ? <StatusBadge active={plate.active} /> : <PendingBadge />}
          </span>
        }
        description={
          <>
            {plate.internalName} · cadastrada em {formatDateTime(plate.createdAt)} · alterada em {formatDateTime(plate.updatedAt)}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          {!plate.configured && <ConfigureCard plate={plate} onSaved={onSaved} />}
          <PermanentCard plate={plate} />
          {plate.configured && (
            <div className="lg:hidden">
              <QrCard plate={plate} />
            </div>
          )}
          {plate.configured && <DestinationCard plate={plate} onSaved={onSaved} />}
          {plate.configured && <DetailsCard plate={plate} onSaved={onSaved} />}
          <ClientCard plate={plate} onSaved={onSaved} />
          {!plate.configured && (
            <div className="lg:hidden">
              <QrCard plate={plate} />
            </div>
          )}
          <HistoryCard loading={history.loading} error={history.error} items={history.data?.items ?? []} />
          <DangerCard plate={plate} />
        </div>
        <div className="hidden lg:sticky lg:top-20 lg:block lg:self-start">
          <QrCard plate={plate} />
        </div>
      </div>
    </>
  );
}

function ConfigureCard({ plate, onSaved }: { plate: Plate; onSaved: (p: Plate) => void }) {
  const toast = useToast();
  const [params] = useSearchParams();
  const fromScan = params.get("configurar") === "1";
  const [form, setForm] = useState({ businessName: plate.businessName ?? "", internalName: plate.internalName, destinationUrl: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.businessName.trim()) errs.businessName = "Informe o nome do cliente ou estabelecimento";
    if (!form.internalName.trim()) errs.internalName = "Informe o nome interno";
    const urlErr = checkUrl(form.destinationUrl);
    if (urlErr) errs.destinationUrl = urlErr;
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const updated = await api<Plate>(`/plates/${plate.id}`, {
        method: "PATCH",
        body: { businessName: form.businessName, internalName: form.internalName, destinationUrl: form.destinationUrl.trim() },
      });
      onSaved(updated);
      toast("success", "Plaquinha configurada. O QR Code já leva ao link.");
    } catch (err) {
      if (err instanceof ApiError && err.fields?.length) setErrors(Object.fromEntries(err.fields.map((f) => [f.path, f.message])));
      else toast("error", (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-amber-300 ring-4 ring-amber-100">
      <CardHeader
        title={fromScan ? "Plaquinha lida. Defina o link" : "Configurar plaquinha"}
        description="Esta plaquinha está em branco: quem escanear verá “ainda não ativada” até você salvar um link."
      />
      <form onSubmit={onSubmit} className="space-y-5 p-5" noValidate>
        <Field label="Link de destino" htmlFor="c-destinationUrl" error={errors.destinationUrl} hint="Avaliação do Google, WhatsApp, Instagram… Cole o link completo.">
          <Input
            id="c-destinationUrl"
            type="url"
            inputMode="url"
            placeholder="https://"
            maxLength={2048}
            autoFocus={fromScan}
            value={form.destinationUrl}
            invalid={!!errors.destinationUrl}
            onChange={(e) => setForm({ ...form, destinationUrl: e.target.value })}
          />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Cliente / estabelecimento" htmlFor="c-businessName" error={errors.businessName}>
            <Input id="c-businessName" maxLength={120} value={form.businessName} invalid={!!errors.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} />
          </Field>
          <Field label="Nome interno" htmlFor="c-internalName" error={errors.internalName} hint="Ex.: Balcão, Mesa 3">
            <Input id="c-internalName" maxLength={120} value={form.internalName} invalid={!!errors.internalName} onChange={(e) => setForm({ ...form, internalName: e.target.value })} />
          </Field>
        </div>
        <div className="flex justify-end">
          <Button type="submit" variant="primary" loading={saving}>
            Salvar e ativar
          </Button>
        </div>
      </form>
    </Card>
  );
}

function PermanentCard({ plate }: { plate: Plate }) {
  return (
    <Card>
      <CardHeader title="Endereço permanente" description="Gravado no QR Code e na tag NFC. Não muda quando o destino é alterado." />
      <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
        <code className="min-w-0 flex-1 break-all rounded-lg bg-zinc-50 px-3 py-2 font-mono text-sm text-zinc-900 ring-1 ring-zinc-200" data-testid="permanent-url">
          {plate.permanentUrl}
        </code>
        <div className="flex gap-2">
          <CopyButton value={plate.permanentUrl} />
          <a href={plate.permanentUrl} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "sm")}>
            <ExternalLink className="size-4" aria-hidden />
            Testar
          </a>
        </div>
      </div>
    </Card>
  );
}

function DestinationCard({ plate, onSaved }: { plate: Plate; onSaved: (p: Plate) => void }) {
  const toast = useToast();
  const [url, setUrl] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmation, setConfirmation] = useState<{ permanentUrl: string; same: boolean } | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const v = url.trim();
    const localErr = checkUrl(v);
    if (localErr) return setErr(localErr);
    setErr(null);
    setSaving(true);
    const before = plate.permanentUrl;
    try {
      const updated = await api<Plate>(`/plates/${plate.id}`, { method: "PATCH", body: { destinationUrl: v } });
      onSaved(updated);
      setUrl("");
      setConfirmation({ permanentUrl: updated.permanentUrl, same: updated.permanentUrl === before });
      toast("success", "Destino atualizado.");
    } catch (e2) {
      setErr(e2 instanceof ApiError && e2.fields?.length ? e2.fields[0].message : (e2 as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Destino atual" description="Para onde o visitante é enviado ao ler o QR Code ou aproximar o celular." />
      <div className="space-y-5 p-5">
        <a
          href={plate.destinationUrl ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-start gap-2 break-all text-sm font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-4 hover:decoration-zinc-900"
          data-testid="destination-url"
        >
          <ExternalLink className="mt-0.5 size-4 shrink-0 text-zinc-400" aria-hidden />
          {plate.destinationUrl}
        </a>
        <form onSubmit={onSubmit} className="space-y-3" noValidate>
          <Field label="Novo destino" htmlFor="newDestination" error={err} hint="Cole o novo link. O QR Code impresso continua o mesmo.">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="newDestination"
                type="url"
                inputMode="url"
                placeholder="https://"
                maxLength={2048}
                value={url}
                invalid={!!err}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setConfirmation(null);
                }}
              />
              <Button type="submit" variant="primary" loading={saving} disabled={!url.trim()}>
                Salvar destino
              </Button>
            </div>
          </Field>
        </form>
        {confirmation && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status">
            <p className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="size-4" aria-hidden /> Destino salvo no banco de dados.
            </p>
            <p className="mt-1">
              {confirmation.same ? "O endereço permanente continua idêntico: " : "Atenção: o endereço permanente mudou: "}
              <span className="break-all font-mono">{confirmation.permanentUrl}</span>
            </p>
            <a href={confirmation.permanentUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 font-medium underline underline-offset-2">
              Testar o redirecionamento <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </div>
        )}
      </div>
    </Card>
  );
}

function DetailsCard({ plate, onSaved }: { plate: Plate; onSaved: (p: Plate) => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ businessName: plate.businessName ?? "", internalName: plate.internalName, notes: plate.notes ?? "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const dirty = form.businessName !== (plate.businessName ?? "") || form.internalName !== plate.internalName || form.notes !== (plate.notes ?? "");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.businessName.trim()) errs.businessName = "Informe o nome da empresa";
    if (!form.internalName.trim()) errs.internalName = "Informe o nome interno";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const updated = await api<Plate>(`/plates/${plate.id}`, {
        method: "PATCH",
        body: { businessName: form.businessName, internalName: form.internalName, notes: form.notes.trim() || null },
      });
      onSaved(updated);
      setForm({ businessName: updated.businessName ?? "", internalName: updated.internalName, notes: updated.notes ?? "" });
      toast("success", "Dados salvos.");
    } catch (err) {
      if (err instanceof ApiError && err.fields?.length) setErrors(Object.fromEntries(err.fields.map((f) => [f.path, f.message])));
      else toast("error", (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function toggle(active: boolean) {
    setToggling(true);
    try {
      onSaved(await api<Plate>(`/plates/${plate.id}`, { method: "PATCH", body: { active } }));
      toast("success", active ? "Plaquinha ativada." : "Plaquinha desativada. O QR Code passa a mostrar um aviso.");
    } catch (err) {
      toast("error", (err as Error).message);
    } finally {
      setToggling(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Dados da plaquinha" />
      <div className="border-b border-zinc-100 px-5 py-4">
        <Switch
          checked={plate.active}
          onChange={toggle}
          disabled={toggling}
          label={plate.active ? "Ativa: o QR Code redireciona para o destino" : "Inativa: o QR Code mostra aviso de indisponível"}
        />
      </div>
      <form onSubmit={onSubmit} className="space-y-5 p-5" noValidate>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Nome da empresa" htmlFor="d-businessName" error={errors.businessName}>
            <Input id="d-businessName" maxLength={120} value={form.businessName} invalid={!!errors.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} />
          </Field>
          <Field label="Nome interno" htmlFor="d-internalName" error={errors.internalName}>
            <Input id="d-internalName" maxLength={120} value={form.internalName} invalid={!!errors.internalName} onChange={(e) => setForm({ ...form, internalName: e.target.value })} />
          </Field>
        </div>
        <Field label="Observações" htmlFor="d-notes" error={errors.notes} hint="Visível apenas no painel.">
          <Textarea id="d-notes" rows={3} maxLength={2000} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>
        <div className="flex justify-end">
          <Button type="submit" variant="primary" loading={saving} disabled={!dirty}>
            Salvar dados
          </Button>
        </div>
      </form>
    </Card>
  );
}

function ClientCard({ plate, onSaved }: { plate: Plate; onSaved: (p: Plate) => void }) {
  const toast = useToast();
  const clients = useAsync(() => api<{ items: Client[] }>("/clients"), []);
  const [saving, setSaving] = useState(false);

  async function change(clientId: string) {
    setSaving(true);
    try {
      const updated = await api<Plate>(`/plates/${plate.id}`, { method: "PATCH", body: { clientId: clientId || null } });
      onSaved(updated);
      toast("success", updated.client ? `Plaquinha entregue a ${updated.client.name ?? updated.client.email}.` : "Plaquinha voltou a ser só sua.");
    } catch (err) {
      toast("error", (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Cliente revendedor" description="O cliente escolhido consegue escanear esta plaquinha e trocar o link pelo acesso dele." />
      <div className="p-5">
        <Field label="Cliente" htmlFor="plate-client">
          <select
            id="plate-client"
            value={plate.clientId ?? ""}
            disabled={saving || clients.loading}
            onChange={(e) => change(e.target.value)}
            className="h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 disabled:opacity-60"
          >
            <option value="">Nenhum (só você)</option>
            {clients.data?.items.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name ?? c.email}
                {c.active ? "" : " (bloqueado)"}
              </option>
            ))}
          </select>
        </Field>
        {clients.data && clients.data.items.length === 0 && (
          <p className="mt-2 text-sm text-zinc-500">
            Nenhum cliente cadastrado. <Link to="/clientes" className="font-medium underline underline-offset-2">Cadastrar cliente</Link>
          </p>
        )}
      </div>
    </Card>
  );
}

function QrCard({ plate }: { plate: Plate }) {
  const base = `/api/plates/${plate.id}`;
  return (
    <Card>
      <CardHeader title="QR Code" description={`${plate.businessName ?? "Sem nome"} · ${plate.internalName}`} />
      <div className="space-y-4 p-5">
        <div className="mx-auto max-w-64 rounded-lg border border-zinc-200 bg-white p-2">
          <img src={`${base}/qr.svg`} alt={`QR Code do endereço ${plate.permanentUrl}`} className="aspect-square w-full" width={256} height={256} />
        </div>
        <p className="text-center font-mono text-xs text-zinc-500">Código: {plate.code}</p>
        <div className="grid grid-cols-1 gap-2">
          <a href={`${base}/qr.svg?download=1`} className={buttonClass("secondary")} download>
            <Download className="size-4" aria-hidden /> SVG vetorial (gráfica / laser)
          </a>
          <a href={`${base}/qr.png?size=print&download=1`} className={buttonClass("secondary")} download>
            <Download className="size-4" aria-hidden /> PNG para impressão (3000 px)
          </a>
          <a href={`${base}/qr.png?size=screen&download=1`} className={buttonClass("secondary")} download>
            <Download className="size-4" aria-hidden /> PNG para tela (1024 px)
          </a>
          <Link to={`/plaquinhas/${plate.id}/imprimir`} className={buttonClass("secondary")}>
            <Printer className="size-4" aria-hidden /> Imprimir só o QR Code
          </Link>
        </div>
        <p className="text-xs leading-relaxed text-zinc-500">
          Baixar de novo gera exatamente o mesmo código. Correção de erro nível Q e margem de 4 módulos. Antes de produzir em lote, teste a leitura de uma plaquinha impressa.
        </p>
      </div>
    </Card>
  );
}

export function HistoryCard({ loading, error, items }: { loading: boolean; error: string | null; items: HistoryItem[] }) {
  return (
    <Card>
      <CardHeader title="Histórico de destinos" />
      {loading && items.length === 0 ? (
        <Spinner />
      ) : error ? (
        <div className="p-5">
          <ErrorBox message={error} />
        </div>
      ) : items.length === 0 ? (
        <p className="flex items-center gap-2 px-5 py-6 text-sm text-zinc-500">
          <History className="size-4" aria-hidden /> Nenhuma alteração registrada.
        </p>
      ) : (
        <ol className="divide-y divide-zinc-100" data-testid="history">
          {items.map((h) => (
            <li key={h.id} className="px-5 py-3.5 text-sm">
              <p className="text-xs text-zinc-500">
                {formatDateTime(h.changedAt)}
                {h.changedBy && (
                  <span data-testid="changed-by">
                    {" · por "}
                    {h.changedBy.role === "CLIENT" ? `${h.changedBy.name ?? h.changedBy.email} (cliente)` : (h.changedBy.name ?? "administrador")}
                  </span>
                )}
              </p>
              {h.previousUrl === null ? (
                <p className="mt-1 break-all text-zinc-800">
                  <span className="text-zinc-500">Destino inicial: </span>
                  {h.newUrl}
                </p>
              ) : (
                <div className="mt-1 space-y-0.5 break-all">
                  <p className="text-zinc-500 line-through decoration-zinc-300">{h.previousUrl}</p>
                  <p className="text-zinc-900">{h.newUrl}</p>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function DangerCard({ plate }: { plate: Plate }) {
  const nav = useNavigate();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function onDelete() {
    setDeleting(true);
    try {
      await api(`/plates/${plate.id}`, { method: "DELETE" });
      toast("success", "Plaquinha excluída.");
      nav("/plaquinhas", { replace: true });
    } catch (err) {
      toast("error", (err as Error).message);
      setDeleting(false);
      setOpen(false);
    }
  }

  return (
    <Card className="border-red-200">
      <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">Excluir plaquinha</h2>
          <p className="mt-0.5 text-sm text-zinc-500">Remove o registro e o histórico. Para pausar o QR Code sem perder dados, desative-a.</p>
        </div>
        <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => setOpen(true)}>
          Excluir
        </Button>
      </div>
      <ConfirmDialog
        open={open}
        title="Excluir esta plaquinha?"
        confirmLabel="Excluir definitivamente"
        danger
        loading={deleting}
        onConfirm={onDelete}
        onClose={() => setOpen(false)}
      >
        <p>
          <strong className="text-zinc-900">{plate.businessName ?? "Sem nome"}</strong> · {plate.internalName}
        </p>
        <p>
          Qualquer plaquinha física com o código <span className="font-mono">{plate.code}</span> deixará de funcionar e passará a mostrar “Link não
          encontrado”. Esta ação não pode ser desfeita.
        </p>
      </ConfirmDialog>
    </Card>
  );
}
