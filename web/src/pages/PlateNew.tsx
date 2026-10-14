import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { checkUrl } from "../lib/format";
import type { Plate } from "../lib/types";
import { Button, buttonClass, Card, Field, Input, PageHeader, Switch, Textarea } from "../components/ui";
import { useToast } from "../components/Toast";

type Errors = Partial<Record<"businessName" | "internalName" | "destinationUrl" | "notes" | "form", string>>;

export function PlateNewPage() {
  const nav = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState({ businessName: "", internalName: "", destinationUrl: "", notes: "", active: true });
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  const set = (k: keyof typeof form) => (v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: Errors = {};
    if (!form.businessName.trim()) errs.businessName = "Informe o nome da empresa";
    if (!form.internalName.trim()) errs.internalName = "Informe o nome interno";
    const urlErr = checkUrl(form.destinationUrl);
    if (urlErr) errs.destinationUrl = urlErr;
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    try {
      const plate = await api<Plate>("/plates", {
        method: "POST",
        body: { ...form, destinationUrl: form.destinationUrl.trim(), notes: form.notes.trim() || null },
      });
      toast("success", "Plaquinha cadastrada. O QR Code permanente já está disponível.");
      nav(`/plaquinhas/${plate.id}`, { replace: true });
    } catch (err) {
      const next: Errors = {};
      if (err instanceof ApiError && err.fields?.length) {
        for (const f of err.fields) next[f.path as keyof Errors] ??= f.message;
      } else next.form = (err as Error).message;
      setErrors(next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/plaquinhas" className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900">
        <ArrowLeft className="size-4" aria-hidden /> Plaquinhas
      </Link>
      <PageHeader title="Nova plaquinha" description="O endereço permanente é gerado automaticamente e nunca muda." />
      <Card>
        <form onSubmit={onSubmit} className="space-y-5 p-5" noValidate>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Nome da empresa ou estabelecimento" htmlFor="businessName" error={errors.businessName}>
              <Input id="businessName" maxLength={120} value={form.businessName} invalid={!!errors.businessName} onChange={(e) => set("businessName")(e.target.value)} autoFocus />
            </Field>
            <Field label="Nome interno da plaquinha" htmlFor="internalName" error={errors.internalName} hint="Ex.: Balcão, Mesa 3, Entrada">
              <Input id="internalName" maxLength={120} value={form.internalName} invalid={!!errors.internalName} onChange={(e) => set("internalName")(e.target.value)} />
            </Field>
          </div>
          <Field
            label="URL de destino"
            htmlFor="destinationUrl"
            error={errors.destinationUrl}
            hint="Link de avaliação do Google, WhatsApp, Instagram, cardápio… Apenas http:// ou https://"
          >
            <Input
              id="destinationUrl"
              type="url"
              inputMode="url"
              placeholder="https://"
              maxLength={2048}
              value={form.destinationUrl}
              invalid={!!errors.destinationUrl}
              onChange={(e) => set("destinationUrl")(e.target.value)}
            />
          </Field>
          <Field label="Observações (opcional)" htmlFor="notes" error={errors.notes} hint="Visível apenas no painel.">
            <Textarea id="notes" rows={3} maxLength={2000} value={form.notes} onChange={(e) => set("notes")(e.target.value)} />
          </Field>
          <Switch checked={form.active} onChange={set("active")} label={form.active ? "Ativa: o QR Code redireciona" : "Inativa: o QR Code mostra aviso de indisponível"} />
          {errors.form && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {errors.form}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 border-t border-zinc-100 pt-5 sm:flex-row sm:justify-end">
            <Link to="/plaquinhas" className={buttonClass("secondary")}>
              Cancelar
            </Link>
            <Button type="submit" variant="primary" loading={saving}>
              Cadastrar plaquinha
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
