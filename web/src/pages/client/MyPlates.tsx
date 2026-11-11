import { Link } from "react-router-dom";
import { ChevronRight, Plus, QrCode, ScanLine } from "lucide-react";
import { useAuth } from "../../auth";
import { api } from "../../lib/api";
import { shortUrl } from "../../lib/format";
import type { MyPlateList } from "../../lib/types";
import { useAsync } from "../../lib/useAsync";
import { buttonClass, Card, EmptyState, ErrorBox, PageHeader, PendingBadge, Spinner, StatusBadge } from "../../components/ui";

export function MyPlatesPage() {
  const { name } = useAuth();
  const { data, error, loading, reload } = useAsync(() => api<MyPlateList>("/me/plates"), []);

  return (
    <>
      <PageHeader
        title={name ? `Olá, ${name}` : "Minhas plaquinhas"}
        description={
          data
            ? data.canCreate
              ? `${data.total} de ${data.maxPlates} QR Codes usados`
              : `${data.total} ${data.total === 1 ? "plaquinha" : "plaquinhas"} · ${data.configured} com link · ${data.total - data.configured} em branco`
            : undefined
        }
      />
      {data?.canCreate ? (
        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          {data.total < (data.maxPlates ?? 0) ? (
            <Link to="/minhas/nova" className={`${buttonClass("primary")} h-14 w-full text-base`}>
              <Plus className="size-5" aria-hidden /> Novo QR Code
            </Link>
          ) : (
            <p className="flex h-14 items-center justify-center rounded-lg border border-zinc-200 bg-white px-4 text-center text-sm text-zinc-600">
              Você chegou ao limite de {data.maxPlates} QR Codes do plano.
            </p>
          )}
          <Link to="/minhas/escanear" className={`${buttonClass("secondary")} h-14 w-full text-base`}>
            <ScanLine className="size-5" aria-hidden /> Escanear plaquinha
          </Link>
        </div>
      ) : (
        <Link to="/minhas/escanear" className={`${buttonClass("primary")} mb-6 h-14 w-full text-base`}>
          <ScanLine className="size-5" aria-hidden /> Escanear plaquinha
        </Link>
      )}
      <Card>
        {loading && !data ? (
          <Spinner />
        ) : error ? (
          <div className="p-4">
            <ErrorBox message={error} onRetry={reload} />
          </div>
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            icon={<QrCode className="size-5" />}
            title={data?.canCreate ? "Você ainda não criou nenhum QR Code" : "Nenhuma plaquinha na sua conta"}
            description={
              data?.canCreate
                ? "Toque em “Novo QR Code”, cole o link e baixe o arquivo para imprimir."
                : "Quando as suas plaquinhas forem liberadas, elas aparecem aqui."
            }
          />
        ) : (
          <ul className="divide-y divide-zinc-100" data-testid="my-plates">
            {data.items.map((p) => (
              <li key={p.id}>
                <Link to={`/minhas/${p.id}`} className="group flex items-center gap-4 px-5 py-3.5 hover:bg-zinc-50">
                  <div className="min-w-0 flex-1">
                    <p className={p.businessName ? "truncate font-medium text-zinc-900" : "truncate font-medium text-zinc-500"}>
                      {p.businessName ?? p.internalName}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-zinc-500">
                      <span className="font-mono text-zinc-700">{p.code}</span>
                      {p.destinationUrl ? ` · ${shortUrl(p.destinationUrl, 44)}` : " · aguardando link"}
                    </p>
                  </div>
                  {p.configured ? <StatusBadge active={p.active} /> : <PendingBadge />}
                  <ChevronRight className="size-4 shrink-0 text-zinc-300 group-hover:text-zinc-500" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
