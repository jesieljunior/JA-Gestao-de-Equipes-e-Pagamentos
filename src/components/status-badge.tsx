import { ROTULO_STATUS, TOM_POR_STATUS, type Tom } from "@/lib/dominio";
import { cn } from "@/lib/utils";

const TOM_CLASSES: Record<Tom, string> = {
  neutro: "bg-status-neutro text-status-neutro-foreground",
  pendente: "bg-status-pendente text-status-pendente-foreground",
  ok: "bg-status-ok text-status-ok-foreground",
  ativo: "bg-status-ativo text-status-ativo-foreground",
  erro: "bg-status-erro text-status-erro-foreground",
  pago: "bg-status-pago text-status-pago-foreground",
};

export function StatusBadge({
  status,
  className,
}: {
  status: string | null | undefined;
  className?: string;
}) {
  if (!status) return null;
  const rotulo = ROTULO_STATUS[status] ?? status;
  const tom = TOM_POR_STATUS[status] ?? "neutro";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-1.5 py-0.5 text-xs font-medium leading-tight",
        TOM_CLASSES[tom],
        className,
      )}
    >
      {rotulo}
    </span>
  );
}
