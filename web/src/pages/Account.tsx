import { useState, type FormEvent } from "react";
import { useAuth } from "../auth";
import { api } from "../lib/api";
import { Button, Card, CardHeader, Field, Input, PageHeader } from "../components/ui";
import { useToast } from "../components/Toast";

export function AccountPage() {
  const { email, role } = useAuth();
  const toast = useToast();
  const min = role === "CLIENT" ? 8 : 12;
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (form.newPassword.length < min) return setError(`A nova senha deve ter pelo menos ${min} caracteres`);
    if (form.newPassword !== form.confirm) return setError("A confirmação não confere com a nova senha");
    setError(null);
    setSaving(true);
    try {
      await api("/auth/password", { method: "POST", body: { currentPassword: form.currentPassword, newPassword: form.newPassword } });
      setForm({ currentPassword: "", newPassword: "", confirm: "" });
      toast("success", "Senha alterada. Outros aparelhos conectados foram desconectados.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Minha conta" description={email ?? undefined} />
      <Card>
        <CardHeader title="Trocar senha" />
        <form onSubmit={onSubmit} className="space-y-5 p-5" noValidate>
          <Field label="Senha atual" htmlFor="a-current">
            <Input id="a-current" type="password" autoComplete="current-password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} />
          </Field>
          <Field label="Nova senha" htmlFor="a-new" hint={`Pelo menos ${min} caracteres.`}>
            <Input id="a-new" type="password" autoComplete="new-password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} />
          </Field>
          <Field label="Repita a nova senha" htmlFor="a-confirm" error={error}>
            <Input id="a-confirm" type="password" autoComplete="new-password" value={form.confirm} invalid={!!error} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" variant="primary" loading={saving} disabled={!form.currentPassword || !form.newPassword}>
              Trocar senha
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
