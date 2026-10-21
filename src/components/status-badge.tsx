import { ROTULO_STATUS, TOM_POR_STATUS, type Tom } from "@/lib/dominio";
import { cn } from "@/lib/utils";

const TOM_CLASSES: Record<Tom, string> = {
  neutro: "bg-status-neutro text-status-neutro-foreground border-border/60",
  pendente: "bg-status-pendente text-status-pendente-foreground border-amber-500/20",
  ok: "bg-status-ok text-status-ok-foreground border-emerald-500/20",
  ativo: "bg-status-ativo text-status-ativo-foreground border-blue-500/20",
  erro: "bg-status-erro text-status-erro-foreground border-rose-500/20",
  pago: "bg-status-pago text-status-pago-foreground border-emerald-600/20",
};

const TOM_DOT_CLASSES: Record<Tom, string> = {
  neutro: "bg-muted-foreground/60",
  pendente: "bg-amber-500",
  ok: "bg-emerald-500",
  ativo: "bg-blue-500",
  erro: "bg-rose-500",
  pago: "bg-emerald-600",
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
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium tracking-tight leading-tight select-none",
        TOM_CLASSES[tom],
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full shrink-0", TOM_DOT_CLASSES[tom])} aria-hidden />
      <span>{rotulo}</span>
    </span>
  );
}
