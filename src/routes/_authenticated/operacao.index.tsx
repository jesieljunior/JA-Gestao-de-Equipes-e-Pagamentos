import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { EmptyState, ErrorState, LoadingBloco } from "@/components/states";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { dataHora } from "@/lib/dominio";

export const Route = createFileRoute("/_authenticated/operacao/")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Operação em campo — Já" },
      {
        name: "description",
        content:
          "Acompanhe os eventos em andamento, aprove os registros de ponto da equipe e registre ocorrências.",
      },
      { property: "og:title", content: "Operação em campo — Já" },
      {
        property: "og:description",
        content: "Presença, ponto e ocorrências dos eventos em andamento.",
      },
    ],
  }),
  component: Operacao,
});

function Operacao() {
  const eventos = useQuery({
    queryKey: ["eventos", "operacao"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("eventos")
        .select("id, nome, local, data_inicio, status, clientes(nome)")
        .in("status", ["pronto", "em_execucao", "encerrando"])
        .order("data_inicio");
      if (error) throw error;
      return data;
    },
  });

  return (
    <AppShell titulo="Operação" descricao="Eventos prontos ou acontecendo agora">
      {eventos.isPending ? (
        <LoadingBloco />
      ) : eventos.isError ? (
        <ErrorState error={eventos.error} onRetry={() => eventos.refetch()} />
      ) : eventos.data.length === 0 ? (
        <EmptyState
          titulo="Nada em campo"
          descricao="Quando um evento chegar ao estado Pronto ele aparece aqui."
        />
      ) : (
        <ul className="space-y-2">
          {eventos.data.map((e) => (
            <li
              key={e.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{e.nome}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {dataHora(e.data_inicio)}
                  {e.local ? ` · ${e.local}` : ""}
                  {e.clientes?.nome ? ` · ${e.clientes.nome}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={e.status} />
                <Button asChild size="sm" variant="outline">
                  <Link to="/operacao/$eventoId" params={{ eventoId: e.id }}>
                    Abrir
                  </Link>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
