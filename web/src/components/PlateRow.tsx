import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import type { Plate } from "../lib/types";
import { formatDate, shortUrl } from "../lib/format";
import { PendingBadge, StatusBadge } from "./ui";

export function PlateRow({ plate }: { plate: Plate }) {
  return (
    <li>
      <Link to={`/plaquinhas/${plate.id}`} className="group flex items-center gap-4 px-5 py-3.5 hover:bg-zinc-50">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={plate.businessName ? "truncate font-medium text-zinc-900" : "truncate font-medium text-zinc-500"}>
              {plate.businessName ?? "Sem nome"}
            </span>
            <span className="truncate text-sm text-zinc-500">· {plate.internalName}</span>
            {plate.client && (
              <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800 ring-1 ring-sky-200">
                {plate.client.name ?? plate.client.email}
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
            <span className="font-mono text-zinc-700">/r/{plate.code}</span>
            {plate.destinationUrl ? (
              <span className="truncate" title={plate.destinationUrl}>
                → {shortUrl(plate.destinationUrl, 48)}
              </span>
            ) : (
              <span>aguardando link</span>
            )}
          </div>
        </div>
        <div className="hidden text-right text-xs text-zinc-500 sm:block">{formatDate(plate.createdAt)}</div>
        {plate.configured ? <StatusBadge active={plate.active} /> : <PendingBadge />}
        <ChevronRight className="size-4 shrink-0 text-zinc-300 group-hover:text-zinc-500" aria-hidden />
      </Link>
    </li>
  );
}
