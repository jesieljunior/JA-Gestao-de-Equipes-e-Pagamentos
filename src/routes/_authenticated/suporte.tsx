import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { ErrorState, LoadingBloco } from "@/components/states";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { dataHora, moeda } from "@/lib/dominio";
import {
  localizarEmpresasSuporte,
  iniciarAtendimentoSuporte,
  encerrarAtendimentoSuporte,
  listarDadosSuporte,
} from "@/lib/suporte.functions";

export const Route = createFileRoute("/_authenticated/suporte")({
  head: () => ({
    meta: [
      { title: "Atendimento por empresa — PayCrew" },
      {
        name: "description",
        content: "Atendimentos operacionais limitados e auditados por empresa.",
      },
      { property: "og:title", content: "Atendimento por empresa — PayCrew" },
      {
        property: "og:description",
        content: "Consulta operacional de uma empresa por atendimento.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Suporte,
});
function Suporte() {
  const qc = useQueryClient();
  const localizar = useServerFn(localizarEmpresasSuporte);
  const iniciar = useServerFn(iniciarAtendimentoSuporte);
  const encerrar = useServerFn(encerrarAtendimentoSuporte);
  const [busca, setBusca] = useState("");
  const [motivo, setMotivo] = useState("");
  const q = useQuery({
    queryKey: ["suporte", "empresas", busca],
    queryFn: () => localizar({ data: { busca } }),
  });
  const inicio = useMutation({
    mutationFn: (empresaId: string) => iniciar({ data: { empresaId, motivo } }),
    onSuccess: () => {
      setMotivo("");
      qc.invalidateQueries({ queryKey: ["suporte"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const fim = useMutation({
    mutationFn: (atendimentoId: string) => encerrar({ data: { atendimentoId } }),
    onSuccess: async () => {
      await qc.cancelQueries({ queryKey: ["suporte", "dados"] });
      qc.removeQueries({ queryKey: ["suporte", "dados"] });
      qc.invalidateQueries({ queryKey: ["suporte", "empresas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const atendimento = q.data?.atendimento;
  const empresa = q.data?.empresas.find((e) => e.id === atendimento?.empresa_id);
  return (
    <AppShell
      titulo="Suporte PayCrew"
      descricao={empresa ? `Atendimento: ${empresa.nome}` : "Empresas clientes"}
    >
      {q.isPending ? (
        <LoadingBloco />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : atendimento ? (
        <>
          <section className="mb-5 flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
            <div>
              <h2 className="font-semibold">{empresa?.nome}</h2>
              <p className="text-sm text-muted-foreground">
                {atendimento.motivo} · {dataHora(atendimento.iniciado_em)}
              </p>
            </div>
            <Button
              variant="outline"
              disabled={fim.isPending}
              onClick={() => fim.mutate(atendimento.id)}
            >
              Encerrar atendimento
            </Button>
          </section>
          <Dados key={atendimento.id} atendimentoId={atendimento.id} />
        </>
      ) : (
        <>
          <div className="mb-5 grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="busca">Pesquisar empresa por nome ou CNPJ</Label>
              <Input
                id="busca"
                placeholder="Digite ao menos 3 caracteres..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="motivo">Finalidade do atendimento</Label>
              <Input
                id="motivo"
                placeholder="Ex.: Auditoria de pontos do evento X"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
              />
            </div>
          </div>
          {busca.trim().length < 3 ? (
            <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Digite ao menos 3 caracteres no campo de busca para localizar a empresa alvo.
            </p>
          ) : q.data.empresas.length === 0 ? (
            <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Nenhuma agência localizada com este termo de busca.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {q.data.empresas.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div>
                    <p className="font-medium">{e.nome}</p>
                    <p className="text-sm text-muted-foreground">
                      {e.cnpj} · {e.ativa ? "Ativa" : "Inativa"}
                    </p>
                  </div>
                  <Button
                    disabled={inicio.isPending || motivo.trim().length < 5}
                    onClick={() => inicio.mutate(e.id)}
                  >
                    Iniciar atendimento
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </AppShell>
  );
}
function Dados({ atendimentoId }: { atendimentoId: string }) {
  const listar = useServerFn(listarDadosSuporte);
  const q = useQuery({
    queryKey: ["suporte", "dados", atendimentoId],
    queryFn: () => listar({ data: { atendimentoId } }),
  });
  if (q.isPending) return <LoadingBloco />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  return (
    <>
      <dl className="mb-6 grid gap-5 sm:grid-cols-4">
        {[
          ["Eventos", d.eventos.length],
          ["Equipes", d.equipes.length],
          ["Colaboradores", d.colaboradores.length],
          ["Pontos pendentes", d.pontos.filter((p) => p.status === "pendente").length],
        ].map(([label, valor]) => (
          <div key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-2xl font-semibold">{valor}</dd>
          </div>
        ))}
      </dl>
      <Tabs defaultValue="eventos">
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="eventos">Eventos</TabsTrigger>
          <TabsTrigger value="pessoas">Colaboradores</TabsTrigger>
          <TabsTrigger value="pontos">Pontos</TabsTrigger>
          <TabsTrigger value="financeiro">Diagnóstico financeiro</TabsTrigger>
          <TabsTrigger value="ocorrencias">Ocorrências</TabsTrigger>
        </TabsList>
        <TabsContent value="eventos">
          <ul className="divide-y divide-border">
            {d.eventos.map((e) => (
              <li key={e.id} className="flex justify-between gap-3 py-3">
                <span>
                  {e.nome} · {dataHora(e.data_inicio)}
                </span>
                <StatusBadge status={e.status} />
              </li>
            ))}
          </ul>
        </TabsContent>
        <TabsContent value="pessoas">
          <ul className="divide-y divide-border">
            {d.colaboradores.map((p) => (
              <li key={p.id} className="py-3">
                {p.nome} · {p.funcao} · {p.tipo_vinculo}
              </li>
            ))}
          </ul>
        </TabsContent>
        <TabsContent value="pontos">
          <ul className="divide-y divide-border">
            {d.pontos.map((p) => (
              <li key={p.id} className="flex justify-between gap-3 py-3">
                <span>
                  {p.tipo} · {dataHora(p.registrado_em)}
                </span>
                <StatusBadge status={p.status} />
              </li>
            ))}
          </ul>
        </TabsContent>
        <TabsContent value="financeiro">
          <h3 className="mt-4 font-semibold">Fechamentos</h3>
          {d.fechamentos.map((f) => (
            <div key={f.id} className="flex justify-between border-b border-border py-3">
              <span>
                {f.horas_trabalhadas} h · {moeda(f.valor_calculado)}
              </span>
              <StatusBadge status={f.status} />
            </div>
          ))}
          <h3 className="mt-5 font-semibold">Pagamentos</h3>
          {d.pagamentos.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap justify-between gap-3 border-b border-border py-3"
            >
              <span>
                {moeda(p.valor)} · {p.erro}
              </span>
              <StatusBadge status={p.status} />
            </div>
          ))}
          <h3 className="mt-5 font-semibold">Cobranças</h3>
          {d.cobrancas.map((c) => (
            <div key={c.id} className="flex justify-between border-b border-border py-3">
              <span>
                {c.descricao} · {moeda(c.valor)}
              </span>
              <StatusBadge status={c.status} />
            </div>
          ))}
        </TabsContent>
        <TabsContent value="ocorrencias">
          {d.ocorrencias.map((o) => (
            <p key={o.id} className="border-b border-border py-3">
              {o.descricao} · {dataHora(o.criado_em)}
            </p>
          ))}
        </TabsContent>
      </Tabs>
    </>
  );
}
