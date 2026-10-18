import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function LoadingBloco({ linhas = 4, className }: { linhas?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)} aria-busy="true">
      {Array.from({ length: linhas }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
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
    <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border px-6 py-12 text-center">
      <Inbox className="size-6 text-muted-foreground" aria-hidden />
      <p className="mt-3 text-sm font-medium text-foreground">{titulo}</p>
      {descricao ? (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{descricao}</p>
      ) : null}
      {acao ? <div className="mt-4">{acao}</div> : null}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-4 text-destructive" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">Não foi possível carregar</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "Erro inesperado."}
          </p>
          {onRetry ? (
            <Button size="sm" variant="outline" className="mt-3" onClick={onRetry}>
              <RefreshCw className="size-3.5" /> Tentar novamente
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
