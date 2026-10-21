import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function LoadingBloco({ linhas = 4, className }: { linhas?: number; className?: string }) {
  return (
    <div className={cn("space-y-2.5", className)} aria-busy="true">
      {Array.from({ length: linhas }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full rounded-md" />
      ))}
    </div>
  );
}

export function EmptyState({
  titulo,
  descricao,
  acao,
}: {
  titulo: string;
  descricao?: string;
  acao?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/40 px-6 py-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted/60 text-muted-foreground mb-3">
        <Inbox className="size-6" aria-hidden />
      </div>
      <p className="text-sm font-semibold text-foreground">{titulo}</p>
      {descricao ? (
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">{descricao}</p>
      ) : null}
      {acao ? <div className="mt-4">{acao}</div> : null}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 shadow-xs"
    >
      <div className="flex items-start gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive mt-0.5">
          <AlertTriangle className="size-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Não foi possível carregar</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {error instanceof Error ? error.message : "Erro inesperado."}
          </p>
          {onRetry ? (
            <Button size="sm" variant="outline" className="mt-3 gap-1.5" onClick={onRetry}>
              <RefreshCw className="size-3.5" /> Tentar novamente
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
