import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { EmptyState, ErrorState, LoadingBloco } from "@/components/states";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { dataHora, moeda } from "@/lib/dominio";
import { useSessao } from "@/hooks/use-sessao";
import { carregarCobranca } from "@/lib/cobranca.functions";

export const Route = createFileRoute("/_authenticated/painel")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Painel da agência — PayCrew" },
      {
        name: "description",
        content:
          "Acompanhe eventos em andamento, pontos aguardando aprovação, fechamentos e pagamentos pendentes da sua agência.",
      },
      { property: "og:title", content: "Painel da agência — PayCrew" },
      {
        property: "og:description",
        content: "Visão geral da operação: eventos, pontos, fechamentos e pagamentos pendentes.",
      },
    ],
  }),
  component: Painel,
});

async function carregar(empresaId: string) {
  const emTresDias = new Date(Date.now() + 3 * 24 * 60 * 60_000).toISOString();
  const [eventos, pontos, foraHorario, selfiesExpirando, fechamentos, pagamentos, saldoRes] =
    await Promise.all([
      supabase
        .from("eventos")
        .select("id, nome, local, data_inicio, status, qr_code_expira_em")
        .eq("empresa_id", empresaId)
        .not("status", "in", "(concluido,arquivado,cancelado)")
        .order("data_inicio", { ascending: true })
        .limit(8),
      supabase
        .from("pontos")
        .select("id, escalas!inner(equipes!inner(eventos!inner(empresa_id)))", {
          count: "exact",
          head: true,
        })
        .eq("status", "pendente")
        .eq("escalas.equipes.eventos.empresa_id", empresaId),
      supabase
        .from("pontos")
        .select("id, escalas!inner(equipes!inner(eventos!inner(empresa_id)))", {
          count: "exact",
          head: true,
        })
        .eq("status", "pendente")
        .eq("fora_horario", true)
        .eq("escalas.equipes.eventos.empresa_id", empresaId),
      supabase
        .from("pontos")
        .select("id, escalas!inner(equipes!inner(eventos!inner(empresa_id)))", {
          count: "exact",
          head: true,
        })
        .not("foto_url", "is", null)
        .lte("selfie_expira_em", emTresDias)
        .gte("selfie_expira_em", new Date().toISOString())
        .eq("escalas.equipes.eventos.empresa_id", empresaId),
      supabase
        .from("fechamentos")
        .select("id, escalas!inner(equipes!inner(eventos!inner(empresa_id)))", {
          count: "exact",
          head: true,
        })
        .eq("escalas.equipes.eventos.empresa_id", empresaId)
        .eq("status", "pendente_aprovacao"),
      supabase
        .from("pagamentos")
        .select(
          "valor, status, fechamentos!inner(escalas!inner(equipes!inner(eventos!inner(empresa_id))))",
        )
        .eq("fechamentos.escalas.equipes.eventos.empresa_id", empresaId),
      supabase.rpc("saldo_empresa", { _empresa_id: empresaId }),
    ]);

  if (eventos.error) throw eventos.error;
  if (pagamentos.error) throw pagamentos.error;

  const aPagar = (pagamentos.data ?? [])
    .filter((p) => p.status === "pendente" || p.status === "agendado")
    .reduce((s, p) => s + Number(p.valor), 0);
  const pago = (pagamentos.data ?? [])
    .filter((p) => p.status === "executado")
    .reduce((s, p) => s + Number(p.valor), 0);

  return {
    eventos: eventos.data ?? [],
    pontosPendentes: pontos.count ?? 0,
    pontosForaHorario: foraHorario.count ?? 0,
    selfiesExpirando: selfiesExpirando.count ?? 0,
    fechamentosPendentes: fechamentos.count ?? 0,
    aPagar,
    pago,
    saldoReal: Number(saldoRes?.data ?? 0),
  };
}

function Cartao({ titulo, valor, to }: { titulo: string; valor: string | number; to: string }) {
  return (
    <Link
      to={to}
      className="rounded-md border border-border bg-card p-4 transition-colors hover:border-primary/40"
    >
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{valor}</p>
    </Link>
  );
}

function Painel() {
  const { empresaId } = useSessao();
  const q = useQuery({
    queryKey: ["painel", empresaId],
    enabled: Boolean(empresaId),
    queryFn: () => {
      if (!empresaId) throw new Error("Agência não encontrada.");
      return carregar(empresaId);
    },
  });
  const cobranca = useQuery({
    queryKey: ["cobranca-v2", empresaId],
    enabled: Boolean(empresaId),
    queryFn: () => carregarCobranca(),
    refetchInterval: 30_000,
  });

  return (
    <AppShell titulo="Painel" descricao="O que precisa de atenção agora">
      {cobranca.data ? (
        <section className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
          <div>
            <h2 className="font-semibold">Plano {cobranca.data.uso.plano_nome}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {cobranca.data.uso.plano_codigo === "free"
                ? `${cobranca.data.uso.eventos_usados} de ${cobranca.data.uso.limite_eventos} eventos usados neste ciclo`
                : `${cobranca.data.uso.participacoes_usadas} participações · ${cobranca.data.ciclo.participacoes_incluidas} incluídas · ${cobranca.data.estimativa.excedentes} excedentes`}{" "}
              · Estimativa: {moeda(cobranca.data.estimativa.total)}
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to="/plano">Plano e upgrade</Link>
          </Button>
        </section>
      ) : null}
      {q.isPending ? (
        <LoadingBloco linhas={4} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Cartao titulo="Saldo real em conta" valor={moeda(q.data.saldoReal)} to="/saldo" />
            <Cartao titulo="Eventos em andamento" valor={q.data.eventos.length} to="/eventos" />
            <Cartao titulo="Pontos a aprovar" valor={q.data.pontosPendentes} to="/operacao" />
            <Cartao
              titulo="Fechamentos a aprovar"
              valor={q.data.fechamentosPendentes}
              to="/fechamento"
            />
            <Cartao titulo="A pagar (Pix pendente)" valor={moeda(q.data.aPagar)} to="/financeiro" />
          </div>

          {q.data.pontosForaHorario > 0 || q.data.selfiesExpirando > 0 ? (
            <section className="mt-4 grid gap-3 sm:grid-cols-2">
              {q.data.pontosForaHorario > 0 ? (
                <Link
                  to="/operacao"
                  className="rounded-md border border-status-pendente bg-status-pendente p-3 text-status-pendente-foreground"
                >
                  <p className="text-sm font-semibold">
                    {q.data.pontosForaHorario} ponto(s) fora do horário
                  </p>
                  <p className="text-xs">A supervisão precisa avaliar estes registros.</p>
                </Link>
              ) : null}
              {q.data.selfiesExpirando > 0 ? (
                <Link to="/operacao" className="rounded-md border border-border bg-card p-3">
                  <p className="text-sm font-semibold">
                    {q.data.selfiesExpirando} selfie(s) expiram em até 3 dias
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Baixe alguma evidência necessária antes da exclusão.
                  </p>
                </Link>
              ) : null}
            </section>
          ) : null}

          <section className="mt-6 rounded-md border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">Próximos eventos</h2>
              <Button asChild size="sm" variant="outline">
                <Link to="/eventos">Ver todos</Link>
              </Button>
            </div>
            {q.data.eventos.length === 0 ? (
              <EmptyState
                titulo="Nenhum evento ativo"
                descricao="Crie um evento para montar a equipe e iniciar a operação."
                acao={
                  <Button asChild size="sm">
                    <Link to="/eventos">Criar evento</Link>
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y divide-border">
                {q.data.eventos.map((e) => (
                  <li key={e.id}>
                    <Link
                      to="/eventos/$eventoId"
                      params={{ eventoId: e.id }}
                      className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-accent/50"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{e.nome}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {dataHora(e.data_inicio)}
                          {e.local ? ` · ${e.local}` : ""}
                        </p>
                      </div>
                      <StatusBadge status={e.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="mt-4 text-xs text-muted-foreground">
            Total já pago pela agência: {moeda(q.data.pago)}
          </p>
        </>
      )}
    </AppShell>
  );
}
