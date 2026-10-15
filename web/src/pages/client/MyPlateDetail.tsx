import { useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, ExternalLink, ScanLine } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { checkUrl, formatDateTime } from "../../lib/format";
import type { HistoryItem, MyPlate } from "../../lib/types";
import { useAsync } from "../../lib/useAsync";
import { Button, buttonClass, Card, CardHeader, ErrorBox, Field, Input, PageHeader, PendingBadge, Spinner, StatusBadge } from "../../components/ui";
import { useToast } from "../../components/Toast";
import { HistoryCard } from "../PlateDetail";

export function MyPlateDetailPage() {
  const { id = "" } = useParams();
  const { data: plate, setData: setPlate, error, loading, reload } = useAsync(() => api<MyPlate>(`/me/plates/${id}`), [id]);
  const history = useAsync(() => api<{ items: HistoryItem[] }>(`/me/plates/${id}/history`), [id]);

  if (loading && !plate) return <Spinner />;
  if (error || !plate)
    return (
      <div className="mx-auto max-w-xl">
        <ErrorBox message={error ?? "Plaquinha não encontrada"} onRetry={reload} />
        <Link to="/minhas" className="mt-4 inline-block text-sm font-medium text-zinc-600 hover:text-zinc-900">
          Voltar
        </Link>
      </div>
    );

  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/minhas" className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900">
        <ArrowLeft className="size-4" aria-hidden /> Minhas plaquinhas
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="break-words">{plate.businessName ?? plate.internalName}</span>
            {plate.configured ? <StatusBadge active={plate.active} /> : <PendingBadge />}
          </span>
        }
        description={<>Código <span className="font-mono">{plate.code}</span> · alterada em {formatDateTime(plate.updatedAt)}</>}
      />
      <div className="space-y-6">
        <LinkCard
          plate={plate}
          onSaved={(p) => {
            setPlate(p);
            history.reload();
          }}
        />
        {!plate.active && (
          <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
            Esta plaquinha está pausada pelo fornecedor: quem escanear vê um aviso de indisponível.
          </p>
        )}
        <HistoryCard loading={history.loading} error={history.error} items={history.data?.items ?? []} />
        <Link to="/minhas/escanear" className={`${buttonClass("secondary")} w-full`}>
          <ScanLine className="size-4" aria-hidden /> Escanear outra plaquinha
        </Link>
      </div>
    </div>
  );
}

function LinkCard({ plate, onSaved }: { plate: MyPlate; onSaved: (p: MyPlate) => void }) {
  const toast = useToast();
  const [params] = useSearchParams();
  const fromScan = params.get("configurar") === "1";
  const [form, setForm] = useState({ destinationUrl: "", businessName: plate.businessName ?? "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const url = form.destinationUrl.trim();
    const nameChanged = form.businessName.trim() !== (plate.businessName ?? "");
    if (url) {
      const urlErr = checkUrl(url);
      if (urlErr) errs.destinationUrl = urlErr;
    } else if (!plate.configured) {
      errs.destinationUrl = "Cole o link para onde a plaquinha deve levar";
    } else if (!nameChanged) {
      errs.destinationUrl = "Cole o novo link";
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    setSaved(false);
    try {
      const body: Record<string, string | null> = { businessName: form.businessName.trim() || null };
      if (url) body.destinationUrl = url;
      const updated = await api<MyPlate>(`/me/plates/${plate.id}`, { method: "PATCH", body });
      onSaved(updated);
      setForm({ destinationUrl: "", businessName: updated.businessName ?? "" });
      setSaved(true);
      toast("success", url ? "Link salvo. A plaquinha já leva ao novo link." : "Nome salvo.");
    } catch (err) {
      if (err instanceof ApiError && err.fields?.length) setErrors(Object.fromEntries(err.fields.map((f) => [f.path, f.message])));
      else toast("error", (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className={plate.configured ? undefined : "border-amber-300 ring-4 ring-amber-100"}>
      <CardHeader
        title={plate.configured ? "Trocar link" : fromScan ? "Plaquinha lida. Defina o link" : "Definir link"}
        description={
          plate.configured
            ? "A plaquinha impressa continua a mesma. Só muda para onde ela leva."
            : "Esta plaquinha ainda está em branco: quem escanear verá “ainda não ativada” até você salvar um link."
        }
      />
      <div className="space-y-5 p-5">
        {plate.destinationUrl && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Link atual</p>
            <a
              href={plate.destinationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 flex items-start gap-2 break-all text-sm font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-4"
              data-testid="destination-url"
            >
              <ExternalLink className="mt-0.5 size-4 shrink-0 text-zinc-400" aria-hidden />
              {plate.destinationUrl}
            </a>
          </div>
        )}
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <Field
            label={plate.configured ? "Novo link" : "Link de destino"}
            htmlFor="m-destinationUrl"
            error={errors.destinationUrl}
            hint="Avaliação do Google, WhatsApp, Instagram, cardápio… Cole o link completo."
          >
            <Input
              id="m-destinationUrl"
              type="url"
              inputMode="url"
              placeholder="https://"
              maxLength={2048}
              autoFocus={fromScan}
              value={form.destinationUrl}
              invalid={!!errors.destinationUrl}
              onChange={(e) => {
                setForm({ ...form, destinationUrl: e.target.value });
                setSaved(false);
              }}
            />
          </Field>
          <Field label="Nome do estabelecimento" htmlFor="m-businessName" error={errors.businessName} hint="Opcional. Só para você se organizar.">
            <Input id="m-businessName" maxLength={120} value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} />
          </Field>
          <Button type="submit" variant="primary" loading={saving} className="w-full sm:w-auto">
            {plate.configured ? "Salvar" : "Salvar e ativar"}
          </Button>
        </form>
        {saved && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status">
            <p className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="size-4" aria-hidden /> Salvo.
            </p>
            <a href={plate.permanentUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 font-medium underline underline-offset-2">
              Testar a plaquinha <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </div>
        )}
      </div>
    </Card>
  );
}
