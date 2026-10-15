import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { EmptyState, ErrorState, LoadingBloco } from "@/components/states";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { dataCurta, lista, moeda, um, type Ponto } from "@/lib/dominio";
import { useSessao } from "@/hooks/use-sessao";
import { calcularFechamento } from "@/lib/dominio";

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Relatórios — PayCrew" },
      {
        name: "description",
        content:
          "Resumo por evento: equipe, presenças, horas trabalhadas, custo total e pagamentos, com exportação em CSV.",
      },
      { property: "og:title", content: "Relatórios — PayCrew" },
      {
        property: "og:description",
        content: "Custo, horas e pagamentos de cada evento da agência.",
      },
    ],
  }),
  component: Relatorios,
});

function Relatorios() {
  const { empresaId } = useSessao();
  const eventos = useQuery({
    queryKey: ["relatorios", empresaId],
    enabled: Boolean(empresaId),
    queryFn: async () => {
      if (!empresaId) throw new Error("Agência não encontrada.");
      const recurso = await supabase.rpc("recurso_habilitado", { _empresa_id: empresaId, _recurso: "financeiro" });
      if (recurso.error || !recurso.data) throw new Error("Relatórios financeiros indisponíveis no Free. Faça upgrade em Plano e uso.");
      const { data, error } = await supabase
        .from("eventos")
        .select(
          "id, nome, status, data_inicio, clientes(nome), equipes(nome, escalas(status, valor_combinado, tipo_valor, freelancers(nome), pontos(*), fechamentos(valor_calculado, horas_trabalhadas, status, pagamentos(status, valor))))",
        )
        .order("data_inicio", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const exportarCsv = async (eventoId: string) => {
    if (!empresaId) return;
    const recurso = await supabase.rpc("recurso_habilitado", { _empresa_id: empresaId, _recurso: "exportacao_avancada" });
    if (recurso.error || !recurso.data) { toast.error("Exportação avançada indisponível no seu plano."); return; }
    const e = eventos.data?.find((x) => x.id === eventoId);
    if (!e) return;
    const linhas: string[][] = [
      ["Evento", "Equipe", "Freelancer", "Status da escala", "Horas", "Valor", "Pagamento"],
    ];
    for (const q of e.equipes) {
      for (const es of q.escalas) {
        const f = um(es.fechamentos);
        const p = um(f?.pagamentos);
        const previa = f ? null : calcularFechamento(es, es.pontos as Ponto[]);
        linhas.push([
          e.nome,
          q.nome,
          es.freelancers?.nome ?? "",
          es.status,
          String(f?.horas_trabalhadas ?? previa?.horas ?? 0),
          String(f?.valor_calculado ?? previa?.valor ?? 0),
          p?.status ?? "sem pagamento",
        ]);
      }
    }
    const csv = linhas
      .map((l) => l.map((c) => `"${c.replaceAll('"', '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `paycrew-${e.nome.toLowerCase().replace(/\W+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado.");
  };

  return (
    <AppShell titulo="Relatórios" descricao="Horas, custo e pagamentos por evento">
      {eventos.isPending ? (
        <LoadingBloco />
      ) : eventos.isError ? (
        <ErrorState error={eventos.error} onRetry={() => eventos.refetch()} />
      ) : eventos.data.length === 0 ? (
        <EmptyState
          titulo="Nenhum evento"
          descricao="Crie um evento para acompanhar os números aqui."
        />
      ) : (
        <div className="space-y-4">
          {eventos.data.map((e) => {
            const escalas = e.equipes.flatMap((q) => q.escalas);
            const confirmados = escalas.filter((s) => s.status === "confirmado").length;
            const fechamentos = escalas.flatMap((s) => lista(s.fechamentos));
            const horas = fechamentos.reduce((s, f) => s + Number(f.horas_trabalhadas), 0);
            const custo = fechamentos.reduce((s, f) => s + Number(f.valor_calculado), 0);
            const pagos = fechamentos
              .flatMap((f) => lista(f.pagamentos))
              .filter((p) => p.status === "executado")
              .reduce((s, p) => s + Number(p.valor), 0);

            return (
              <section key={e.id} className="rounded-md border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold">{e.nome}</h2>
                    <p className="text-xs text-muted-foreground">
                      {dataCurta(e.data_inicio)}
                      {e.clientes?.nome ? ` · ${e.clientes.nome}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={e.status} />
                    <Button size="sm" variant="outline" onClick={() => exportarCsv(e.id)}>
                      <Download className="size-4" /> CSV
                    </Button>
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-xs text-muted-foreground">Confirmados</dt>
                    <dd className="tabular-nums font-medium">
                      {confirmados} de {escalas.length}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Horas fechadas</dt>
                    <dd className="tabular-nums font-medium">{horas.toFixed(2)} h</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Custo total</dt>
                    <dd className="tabular-nums font-medium">{moeda(custo)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Pago</dt>
                    <dd className="tabular-nums font-medium">{moeda(pagos)}</dd>
                  </div>
                </dl>
              </section>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
