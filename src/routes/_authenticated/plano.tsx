import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { carregarCobranca } from "@/lib/cobranca.functions";
import { AVISO_CLT, RECURSOS_PLANO, pontoDeVirada, temRecurso } from "@/lib/cobranca-v2";
import { moeda, dataCurta } from "@/lib/dominio";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const opcoes = queryOptions({
  queryKey: ["cobranca-v2"],
  queryFn: () => carregarCobranca(),
  staleTime: 30_000,
});
export const Route = createFileRoute("/_authenticated/plano")({
  loader: ({ context }) => context.queryClient.ensureQueryData(opcoes),
  head: () => ({
    meta: [
      { title: "Plano e uso — Já" },
      {
        name: "description",
        content: "Participações, limites CLT e faturas do seu plano Já.",
      },
      { property: "og:title", content: "Plano e uso — Já" },
      { property: "og:description", content: "Seu ciclo, consumo e assinatura da plataforma Já." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Plano,
});
function Plano() {
  const { data } = useSuspenseQuery(opcoes);
  const { uso, ciclo, estimativa, planos } = data;
  return (
    <AppShell
      titulo="Plano e uso"
      descricao={`${uso.plano_nome} · ${dataCurta(ciclo.inicio)} a ${dataCurta(ciclo.fim)}`}
    >
      <dl className="grid gap-6 border-b border-border pb-6 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-sm text-muted-foreground">Participações operacionais</dt>
          <dd className="mt-2 text-2xl font-semibold">
            {uso.participacoes_usadas} / {ciclo.participacoes_incluidas}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">
            Excedentes · {moeda(ciclo.valor_excedente)} cada
          </dt>
          <dd className="mt-2 text-2xl font-semibold">{estimativa.excedentes}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Estimativa SaaS do ciclo</dt>
          <dd className="mt-2 text-2xl font-semibold">{moeda(estimativa.total)}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">CLT ativos · limite separado</dt>
          <dd className="mt-2 text-2xl font-semibold">
            {uso.clt_ativos} / {uso.limite_clt ?? "Sem limite"}
          </dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-6 py-5 text-sm">
        <span>
          Eventos: {uso.eventos_usados} / {uso.limite_eventos ?? "Sem limite"}
        </span>
        <span>Pessoas por evento: {uso.limite_pessoas_evento ?? "Sem limite"}</span>
        <span>Supervisores: {uso.limite_supervisores ?? "Sem limite"}</span>
      </div>
      <p className="text-xs text-muted-foreground">{AVISO_CLT}</p>
      {uso.aviso_vendas ? (
        <p className="mt-3 text-sm font-medium text-primary">
          Volume elevado: consulte a equipe Já para uma contratação personalizada.
        </p>
      ) : null}
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Composição do ciclo</h2>
        <div className="flex flex-wrap gap-6 text-sm">
          <span>Mensalidade: {moeda(ciclo.mensalidade)}</span>
          <span>Excedentes: {moeda(estimativa.valorExcedente)}</span>
          <span>Desconto: {moeda(estimativa.bruto - estimativa.total)}</span>
        </div>
      </section>
      <section className="mt-8">
        <h2 className="mb-4 text-lg font-semibold">Planos disponíveis</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {planos.map((p, index) => {
            const proximo = planos[index + 1];
            const virada = proximo && p.codigo !== "free" ? pontoDeVirada(p, proximo) : null;
            return (
              <article key={p.id} className="border border-border rounded-md p-4">
                <h3 className="font-semibold">{p.nome}</h3>
                <p className="mt-2 text-xl font-semibold">
                  {moeda(p.mensalidade)}
                  <span className="text-xs text-muted-foreground"> / mês</span>
                </p>
                <p className="mt-3 text-sm">
                  {p.participacoes_incluidas} participações · {moeda(p.valor_excedente)} excedente
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  CLT: {p.limite_clt ?? "Sem limite"} · Supervisores:{" "}
                  {p.limite_supervisores ?? "Sem limite"}
                </p>
                <ul className="mt-3 space-y-1 text-xs">
                  {RECURSOS_PLANO.filter((r) => temRecurso(p.recursos, r.chave)).map((r) => (
                    <li key={r.chave}>{r.rotulo}</li>
                  ))}
                </ul>
                {virada ? (
                  <p className="mt-3 text-xs text-primary">
                    A partir de {virada} participações, compare com {proximo?.nome}.
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Faturas SaaS</h2>
        {data.faturas.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ciclo</TableHead>
                <TableHead>Participações</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Vencimento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.faturas.map((f) => (
                <TableRow key={f.id}>
                  <TableCell>{dataCurta(f.ciclo_inicio)}</TableCell>
                  <TableCell>{f.participacoes_usadas}</TableCell>
                  <TableCell>{moeda(f.total)}</TableCell>
                  <TableCell>{f.status}</TableCell>
                  <TableCell>{dataCurta(f.vencimento)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhuma fatura encerrada.</p>
        )}
      </section>
      <section className="mt-8 border-t border-border pt-5">
        <h2 className="text-lg font-semibold">Custos do meio de pagamento</h2>
        <ul className="mt-3 flex flex-wrap gap-6 text-sm">
          {data.taxas.map((t) => (
            <li key={t.id}>
              {t.rotulo}: {(t.taxa * 100).toFixed(2)}%
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          Valores de trabalhadores e custos do gateway não compõem a receita SaaS.
        </p>
      </section>
    </AppShell>
  );
}
