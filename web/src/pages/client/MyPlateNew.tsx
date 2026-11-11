import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { checkUrl } from "../../lib/format";
import type { MyPlate } from "../../lib/types";
import { Button, Card, Field, Input, PageHeader } from "../../components/ui";
import { useToast } from "../../components/Toast";

/** Assinante cria um QR Code novo na própria conta. */
export function MyPlateNewPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState({ businessName: "", destinationUrl: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.businessName.trim()) errs.businessName = "Dê um nome para reconhecer este QR Code";
    const urlErr = checkUrl(form.destinationUrl);
    if (urlErr) errs.destinationUrl = urlErr;
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const p = await api<MyPlate>("/me/plates", {
        method: "POST",
        body: { businessName: form.businessName.trim(), destinationUrl: form.destinationUrl.trim() },
      });
      toast("success", "QR Code criado. Baixe o arquivo para imprimir.");
      navigate(`/minhas/${p.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.fields?.length) setErrors(Object.fromEntries(err.fields.map((f) => [f.path, f.message])));
      else toast("error", (err as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <Link to="/minhas" className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900">
        <ArrowLeft className="size-4" aria-hidden /> Minhas plaquinhas
      </Link>
      <PageHeader title="Novo QR Code" description="Você pode trocar o link depois, quantas vezes quiser." />
      <Card className="p-5">
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <Field label="Nome" htmlFor="n-name" error={errors.businessName} hint="Ex.: Balcão da loja, Mesa 4, Avaliações Google.">
            <Input id="n-name" maxLength={120} autoFocus value={form.businessName} invalid={!!errors.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} />
          </Field>
          <Field label="Para onde o QR Code leva" htmlFor="n-url" error={errors.destinationUrl} hint="Cole o link completo: avaliação do Google, WhatsApp, Instagram, cardápio…">
            <Input
              id="n-url"
              type="url"
              inputMode="url"
              placeholder="https://"
              maxLength={2048}
              value={form.destinationUrl}
              invalid={!!errors.destinationUrl}
              onChange={(e) => setForm({ ...form, destinationUrl: e.target.value })}
            />
          </Field>
          <Button type="submit" variant="primary" loading={saving} className="w-full sm:w-auto">
            Criar QR Code
          </Button>
        </form>
      </Card>
    </div>
  );
}
