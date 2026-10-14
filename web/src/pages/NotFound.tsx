import { Link } from "react-router-dom";
import { buttonClass, EmptyState } from "../components/ui";
import { SearchX } from "lucide-react";

export function NotFoundPage() {
  return (
    <EmptyState
      icon={<SearchX className="size-5" />}
      title="Página não encontrada"
      action={<Link to="/" className={buttonClass("primary")}>Ir para a visão geral</Link>}
    />
  );
}
