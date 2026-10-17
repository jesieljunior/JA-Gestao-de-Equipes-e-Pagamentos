import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Calculator, Check, Pencil, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { EmptyState, ErrorState, LoadingBloco } from "@/components/states";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSessao } from "@/hooks/use-sessao";
import { supabase } from "@/integrations/supabase/client";
import {
  calcularFechamento,
  dataHora,
  lista,
  moeda,
  ROTULO_TIPO_VALOR,
  um,
  type Ponto,
} from "@/lib/dominio";
import { parseValorPositivo } from "@/lib/moeda";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/fechamento")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Fechamento de horas — PayCrew" },
      {
        name: "description",
        content:
          "Gere o fechamento de cada escala a partir dos pontos aprovados, confira horas e valores e aprove para pagamento.",
      },
      { property: "og:title", content: "Fechamento de horas — PayCrew" },
      {
        property: "og:description",
        content: "Horas trabalhadas, valores calculados e aprovação por evento.",
      },
    ],
  }),
  component: Fechamento,
});

function Fechamento() {
  const queryClient = useQueryClient();
  const { sessao } = useSessao();
  const [correcao, setCorrecao] = useState<{
    escalaId: string;
    fechamentoId: string | null;
    valor: string;
  } | null>(null);

  const eventos = useQuery({
    queryKey: ["fechamento", "eventos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("eventos")
        .select(
          "id, nome, status, data_inicio, equipes(id, nome, escalas(id, valor_combinado, tipo_valor, status, freelancers(nome), pontos(*), fechamentos(*)))",
        )
        .in("status", ["encerrando", "fechamento", "pagamento", "concluido"])
        .order("data_inicio", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ["fechamento"] });
    queryClient.invalidateQueries({ queryKey: ["financeiro"] });
    queryClient.invalidateQueries({ queryKey: ["painel"] });
  };

  const gerar = useMutation({
    mutationFn: async (eventoId: string) => {
      const evento = eventos.data?.find((e) => e.id === eventoId);
      if (!evento) throw new Error("Evento não encontrado.");

      const linhas = evento.equipes
        .flatMap((q) => q.escalas)
        .filter((es) => es.status === "confirmado" && lista(es.fechamentos).length === 0)
        .map((es) => {
          const { horas, valor } = calcularFechamento(es, es.pontos as Ponto[]);
          return {
            escala_id: es.id,
            horas_trabalhadas: horas,
            valor_calculado: valor,
            status: "pendente_aprovacao" as const,
          };
        });

      if (linhas.length === 0) throw new Error("Nada novo para fechar neste evento.");
      const { error } = await supabase.from("fechamentos").insert(linhas);
      if (error) throw error;
      return linhas.length;
    },
    onSuccess: (n) => {
      toast.success(`${n} fechamento(s) gerado(s).`);
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const decidir = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "aprovado" | "contestado" }) => {
      const { error } = await supabase
        .from("fechamentos")
        .update({
          status,
          aprovado_por_id: status === "aprovado" ? (sessao?.usuario.id ?? null) : null,
          aprovado_em: status === "aprovado" ? new Date().toISOString() : null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidar,
    onError: (e: Error) => toast.error(e.message),
  });

  const corrigirValor = useMutation({
    mutationFn: async () => {
      if (!correcao) throw new Error("Escala não identificada.");
      const valor = parseValorPositivo(correcao.valor);
      const { error: erroEscala } = await supabase
        .from("escalas")
        .update({ valor_combinado: valor })
        .eq("id", correcao.escalaId);
      if (erroEscala) throw erroEscala;
      if (correcao.fechamentoId) {
        const { error: erroFechamento } = await supabase
          .from("fechamentos")
          .update({ valor_calculado: valor })
          .eq("id", correcao.fechamentoId)
          .neq("status", "aprovado");
        if (erroFechamento) throw erroFechamento;
      }
    },
    onSuccess: () => {
      toast.success("Valor da diária corrigido.");
      setCorrecao(null);
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell
      titulo="Fechamento"
      descricao="Horas e valores calculados apenas com pontos aprovados"
    >
      {eventos.isPending ? (
        <LoadingBloco />
      ) : eventos.isError ? (
        <ErrorState error={eventos.error} onRetry={() => eventos.refetch()} />
      ) : eventos.data.length === 0 ? (
        <EmptyState
          titulo="Nenhum evento em fechamento"
          descricao="Avance o evento até Encerrando para fechar as horas da equipe."
        />
      ) : (
        <div className="space-y-4">
          {eventos.data.map((e) => {
            const escalas = e.equipes.flatMap((q) =>
              q.escalas.map((es) => ({ ...es, equipe: q.nome })),
            );
            const total = escalas
              .flatMap((es) => lista(es.fechamentos))
              .reduce((s, f) => s + Number(f.valor_calculado), 0);

            return (
              <section key={e.id} className="rounded-md border border-border bg-card">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                  <div>
                    <h2 className="text-sm font-semibold">{e.nome}</h2>
                    <p className="text-xs text-muted-foreground">
                      {dataHora(e.data_inicio)} · total fechado {moeda(total)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={e.status} />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={gerar.isPending}
                      onClick={() => gerar.mutate(e.id)}
                    >
                      <Calculator className="size-4" /> Gerar fechamentos
                    </Button>
                  </div>
                </div>

                {escalas.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                    Nenhuma escala neste evento.
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {escalas.map((es) => {
                      const f = um(es.fechamentos);
                      const previa = calcularFechamento(es, es.pontos as Ponto[]);
                      return (
                        <li
                          key={es.id}
                          className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{es.freelancers?.nome}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {es.equipe} · {moeda(es.valor_combinado)}{" "}
                              {ROTULO_TIPO_VALOR[es.tipo_valor]}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-sm">
                            <span className="tabular-nums text-muted-foreground">
                              {(f ? Number(f.horas_trabalhadas) : previa.horas).toFixed(2)} h
                            </span>
                            <span className="tabular-nums font-medium">
                              {moeda(f ? f.valor_calculado : previa.valor)}
                            </span>
                            {previa.requerRevisao ? (
                              <span className="inline-flex items-center gap-1 text-xs text-warning-foreground">
                                <TriangleAlert className="size-3.5" /> {previa.motivoRevisao}
                              </span>
                            ) : null}
                            {f ? (
                              <>
                                <StatusBadge status={f.status} />
                                {f.status !== "aprovado" ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => decidir.mutate({ id: f.id, status: "aprovado" })}
                                  >
                                    <Check className="size-4" /> Aprovar
                                  </Button>
                                ) : null}
                                {f.status === "pendente_aprovacao" ? (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() =>
                                      decidir.mutate({ id: f.id, status: "contestado" })
                                    }
                                  >
                                    <TriangleAlert className="size-4" /> Contestar
                                  </Button>
                                ) : null}
                                {es.tipo_valor === "diaria" && f.status !== "aprovado" ? (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() =>
                                      setCorrecao({
                                        escalaId: es.id,
                                        fechamentoId: f.id,
                                        valor: String(es.valor_combinado),
                                      })
                                    }
                                  >
                                    <Pencil className="size-4" /> Corrigir diária
                                  </Button>
                                ) : null}
                              </>
                            ) : (
                              <span className="text-xs text-muted-foreground">prévia</span>
                            )}
                            {previa.requerRevisao ? (
                              <Button asChild size="sm" variant="outline">
                                <Link to="/operacao/$eventoId" params={{ eventoId: e.id }}>
                                  Corrigir pontos
                                </Link>
                              </Button>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
      <Dialog open={Boolean(correcao)} onOpenChange={(aberto) => !aberto && setCorrecao(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Corrigir valor da diária</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="valor-diaria-correcao">Valor combinado (R$)</Label>
            <Input
              id="valor-diaria-correcao"
              inputMode="decimal"
              value={correcao?.valor ?? ""}
              onChange={(e) =>
                setCorrecao((atual) => (atual ? { ...atual, valor: e.target.value } : atual))
              }
              placeholder="0,00"
            />
          </div>
          <DialogFooter>
            <Button onClick={() => corrigirValor.mutate()} disabled={corrigirValor.isPending}>
              Salvar correção
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
