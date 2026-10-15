import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Plus, QrCode, Search } from "lucide-react";
import { api } from "../lib/api";
import type { PlateList } from "../lib/types";
import { useAsync } from "../lib/useAsync";
import { Button, buttonClass, Card, cx, EmptyState, ErrorBox, Input, PageHeader, Spinner } from "../components/ui";
import { PlateRow } from "../components/PlateRow";

const STATUS = [
  { v: "all", label: "Todos" },
  { v: "active", label: "Ativos" },
  { v: "inactive", label: "Inativos" },
  { v: "unconfigured", label: "Em branco" },
] as const;

export function PlatesListPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const status = params.get("status") ?? "all";
  const lote = params.get("lote") ?? "";
  const cliente = params.get("cliente") ?? "";
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
  const [term, setTerm] = useState(q);

  useEffect(() => setTerm(q), [q]);

  const { data, error, loading, reload } = useAsync(() => {
    const sp = new URLSearchParams({ status, page: String(page), pageSize: "20" });
    if (q) sp.set("q", q);
    if (lote) sp.set("batch", lote);
    if (cliente) sp.set("client", cliente);
    return api<PlateList>(`/plates?${sp}`);
  }, [q, status, page, lote, cliente]);

  function update(next: Record<string, string>) {
    const sp = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v && !(k === "status" && v === "all") && !(k === "page" && v === "1")) sp.set(k, v);
      else sp.delete(k);
    }
    setParams(sp);
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <PageHeader
        title="Plaquinhas"
        description={
          data ? (
            <>
              {data.total} {data.total === 1 ? "registro" : "registros"}
              {lote && (
                <>
                  {" "}· lote <strong className="font-medium text-zinc-700">{lote}</strong>{" "}
                  <button className="underline underline-offset-2" onClick={() => update({ lote: "", page: "1" })}>limpar</button>
                </>
              )}
              {cliente && (
                <>
                  {" "}· {cliente === "none" ? "sem cliente" : (
                    <>cliente <strong className="font-medium text-zinc-700">{data.items[0]?.client?.name ?? "selecionado"}</strong></>
                  )}{" "}
                  <button className="underline underline-offset-2" onClick={() => update({ cliente: "", page: "1" })}>limpar</button>
                </>
              )}
            </>
          ) : undefined
        }
        actions={
          <Link to="/plaquinhas/nova" className={buttonClass("primary")}>
            <Plus className="size-4" aria-hidden />
            Nova plaquinha
          </Link>
        }
      />
      <Card>
        <div className="flex flex-col gap-3 border-b border-zinc-100 p-4 sm:flex-row sm:items-center">
          <form
            className="relative flex-1"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              update({ q: term.trim(), page: "1" });
            }}
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" aria-hidden />
            <label htmlFor="busca" className="sr-only">
              Buscar
            </label>
            <Input
              id="busca"
              type="search"
              placeholder="Buscar por empresa, nome interno ou código"
              className="pl-9"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
            />
          </form>
          <div className="flex flex-wrap rounded-lg border border-zinc-300 p-0.5" role="group" aria-label="Filtrar por status">
            {STATUS.map((s) => (
              <button
                key={s.v}
                onClick={() => update({ status: s.v, page: "1" })}
                aria-pressed={status === s.v}
                className={cx(
                  "h-8 flex-1 rounded-md px-3 text-sm font-medium sm:flex-none",
                  status === s.v ? "bg-zinc-900 text-white" : "text-zinc-600 hover:text-zinc-900",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        {loading && !data ? (
          <Spinner />
        ) : error ? (
          <div className="p-4">
            <ErrorBox message={error} onRetry={reload} />
          </div>
        ) : data && data.items.length === 0 ? (
          q || status !== "all" || lote ? (
            <EmptyState icon={<Search className="size-5" />} title="Nada encontrado" description="Nenhuma plaquinha corresponde aos filtros." />
          ) : (
            <EmptyState
              icon={<QrCode className="size-5" />}
              title="Nenhuma plaquinha cadastrada"
              action={
                <Link to="/plaquinhas/nova" className={buttonClass("primary")}>
                  Cadastrar plaquinha
                </Link>
              }
            />
          )
        ) : data ? (
          <>
            <ul className={cx("divide-y divide-zinc-100", loading && "opacity-60")}>
              {data.items.map((p) => (
                <PlateRow key={p.id} plate={p} />
              ))}
            </ul>
            {pages > 1 && (
              <div className="flex items-center justify-between border-t border-zinc-100 px-5 py-3 text-sm text-zinc-600">
                <span>
                  Página {page} de {pages}
                </span>
                <div className="flex gap-2">
                  <Button size="sm" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}>
                    Anterior
                  </Button>
                  <Button size="sm" disabled={page >= pages} onClick={() => update({ page: String(page + 1) })}>
                    Próxima
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : null}
      </Card>
    </>
  );
}
