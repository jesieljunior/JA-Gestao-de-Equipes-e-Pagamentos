import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, CalendarClock, Copy, Play, Plus, RefreshCw, RotateCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { EmptyState, ErrorState, LoadingBloco } from "@/components/states";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSessao } from "@/hooks/use-sessao";
import { supabase } from "@/integrations/supabase/client";
import { dataHora, lista, moeda, um } from "@/lib/dominio";
import {
  agendarPagamentos,
  criarCobranca,
  executarPagamentoPix,
  gerarPagamento,
  reabrirPagamentoFalho,
  sincronizarCobranca,
} from "@/lib/financeiro.functions";
import { parseValorPositivo } from "@/lib/moeda";

export const Route = createFileRoute("/_authenticated/financeiro")({
  head: () => ({
    meta: [
      { title: "Financeiro — PayCrew" },
      {
        name: "description",
        content:
          "Saldo da agência, cobranças ao cliente do evento e Pix aos freelancers com taxa da plataforma.",
      },
      { property: "og:title", content: "Financeiro — PayCrew" },
      {
        property: "og:description",
        content: "Saldo, cobranças, Pix de saída e totais da agência.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Financeiro,
});

const hojeMais = (dias: number) => {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
};

function Financeiro() {
  const queryClient = useQueryClient();
  const { empresaId } = useSessao();

  const chamarCriarCobranca = useServerFn(criarCobranca);
  const chamarSincronizar = useServerFn(sincronizarCobranca);
  const chamarPix = useServerFn(executarPagamentoPix);
  const chamarGerarPagamento = useServerFn(gerarPagamento);
  const chamarAgendarPagamentos = useServerFn(agendarPagamentos);
  const chamarReabrirPagamento = useServerFn(reabrirPagamentoFalho);

  const [clienteId, setClienteId] = useState("");
  const [eventoId, setEventoId] = useState("");
  const [valor, setValor] = useState("");
  const [forma, setForma] = useState<"pix" | "boleto" | "cartao">("pix");
  const [vencimento, setVencimento] = useState(hojeMais(3));
  const [dataPagamento, setDataPagamento] = useState(hojeMais(1));
  const [pagamentosSelecionados, setPagamentosSelecionados] = useState<string[]>([]);
  const [descricao, setDescricao] = useState("");

  const saldo = useQuery({
    queryKey: ["financeiro", "saldo", empresaId],
    enabled: Boolean(empresaId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("saldo_empresa", {
        _empresa_id: empresaId!,
      });
      if (error) throw error;
      return Number(data ?? 0);
    },
  });

  const cobrancas = useQuery({
    queryKey: ["financeiro", "cobrancas", empresaId],
    enabled: Boolean(empresaId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cobrancas")
        .select("*, clientes(nome), eventos(nome)")
        .eq("empresa_id", empresaId!)
        .eq("tipo", "cobranca_cliente")
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const auxiliares = useQuery({
    queryKey: ["financeiro", "auxiliares", empresaId],
    enabled: Boolean(empresaId),
    queryFn: async () => {
      const [c, e] = await Promise.all([
        supabase
          .from("clientes")
          .select("id, nome, cpf_cnpj")
          .eq("empresa_id", empresaId!)
          .order("nome"),
        supabase
          .from("eventos")
          .select("id, nome")
          .eq("empresa_id", empresaId!)
          .order("data_inicio", { ascending: false })
          .limit(50),
      ]);
      if (c.error) throw c.error;
      if (e.error) throw e.error;
      return { clientes: c.data, eventos: e.data };
    },
  });

  const fila = useQuery({
    queryKey: ["financeiro", "fila", empresaId],
    enabled: Boolean(empresaId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fechamentos")
        .select(
          "id, valor_calculado, status, escala:escalas(valor_combinado, tipo_valor, freelancer:freelancers(nome, chave_pix), equipe:equipes(nome, evento:eventos(nome))), pagamentos(*)",
        )
        .eq("escalas.equipes.eventos.empresa_id", empresaId!)
        .eq("status", "aprovado")
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const taxas = useQuery({
    queryKey: ["financeiro", "taxas", empresaId],
    enabled: Boolean(empresaId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("taxas_plataforma")
        .select("valor")
        .eq("empresa_id", empresaId!)
        .eq("status", "cobrada");
      if (error) throw error;
      return data.reduce((s, t) => s + Number(t.valor), 0);
    },
  });

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ["financeiro"] });
    queryClient.invalidateQueries({ queryKey: ["painel"] });
  };

  const emitir = useMutation({
    mutationFn: async () => {
      const numero = parseValorPositivo(valor);
      return chamarCriarCobranca({
        data: {
          clienteId,
          eventoId: eventoId || null,
          valor: numero,
          forma,
          vencimento,
          descricao: descricao.trim() || "Cobrança do evento",
        },
      });
    },
    onSuccess: () => {
      toast.success("Cobrança emitida.");
      setValor("");
      setDescricao("");
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sincronizar = useMutation({
    mutationFn: (id: string) => chamarSincronizar({ data: { id } }),
    onSuccess: (r) => {
      toast.success(r.status === "pago" ? "Pagamento confirmado." : `Status: ${r.status}`);
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const gerar = useMutation({
    mutationFn: (fechamentoId: string) => chamarGerarPagamento({ data: { fechamentoId } }),
    onSuccess: () => {
      toast.success("Pagamento criado na fila.");
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const agendar = useMutation({
    mutationFn: async (id: string) => {
      const data = new Date(`${dataPagamento}T09:00:00`);
      if (!dataPagamento || Number.isNaN(data.getTime()) || data <= new Date()) {
        throw new Error("Escolha uma data futura para o pagamento.");
      }
      return chamarAgendarPagamentos({
        data: { pagamentoIds: [id], dataAgendada: data.toISOString() },
      });
    },
    onSuccess: invalidar,
    onError: (e: Error) => toast.error(e.message),
  });

  const agendarEmMassa = useMutation({
    mutationFn: async () => {
      const data = new Date(`${dataPagamento}T09:00:00`);
      if (!pagamentosSelecionados.length) throw new Error("Selecione ao menos um pagamento.");
      if (!dataPagamento || Number.isNaN(data.getTime()) || data <= new Date()) {
        throw new Error("Escolha uma data futura para os pagamentos.");
      }
      return chamarAgendarPagamentos({
        data: { pagamentoIds: pagamentosSelecionados, dataAgendada: data.toISOString() },
      });
    },
    onSuccess: () => {
      setPagamentosSelecionados([]);
      toast.success("Pagamentos agendados.");
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const executar = useMutation({
    mutationFn: (id: string) => chamarPix({ data: { pagamentoId: id } }),
    onSuccess: (r) => {
      toast.success(
        r.taxa > 0 ? `Pix enviado. Taxa da plataforma: ${moeda(r.taxa)}.` : "Pix enviado.",
      );
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const tentarNovamente = useMutation({
    mutationFn: (id: string) => chamarReabrirPagamento({ data: { pagamentoId: id } }),
    onSuccess: invalidar,
    onError: (e: Error) => toast.error(e.message),
  });

  const pagamentos = (fila.data ?? []).flatMap((f) => lista(f.pagamentos));
  const soma = (status: string) =>
    pagamentos.filter((p) => p.status === status).reduce((s, p) => s + Number(p.valor), 0);
  const aGerar = (fila.data ?? []).filter((f) => lista(f.pagamentos).length === 0);

  return (
    <AppShell
      titulo="Financeiro"
      descricao="Saldo da agência, cobrança do cliente e Pix ao freelancer"
    >
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(
          [
            ["Saldo disponível", saldo.data ?? 0],
            [
              "A pagar",
              soma("pendente") + aGerar.reduce((s, f) => s + Number(f.valor_calculado), 0),
            ],
            ["Pago", soma("executado")],
            ["Taxas PayCrew", taxas.data ?? 0],
          ] as [string, number][]
        ).map(([rotulo, v]) => (
          <div key={rotulo} className="rounded-md border border-border bg-card px-3 py-2">
            <p className="text-xs text-muted-foreground">{rotulo}</p>
            <p className="tabular-nums text-lg font-semibold">{moeda(v)}</p>
          </div>
        ))}
      </div>

      <Tabs defaultValue="pagamentos">
        <TabsList>
          <TabsTrigger value="pagamentos">Pagamentos</TabsTrigger>
          <TabsTrigger value="entradas">Cobranças de clientes</TabsTrigger>
        </TabsList>

        <TabsContent value="pagamentos" className="mt-4">
          <div className="mb-4 flex flex-wrap items-end gap-3 rounded-md border border-border bg-card p-4">
            <div className="space-y-1.5">
              <Label htmlFor="data-pagamento">Data dos pagamentos agendados</Label>
              <Input
                id="data-pagamento"
                type="date"
                min={hojeMais(1)}
                value={dataPagamento}
                onChange={(e) => setDataPagamento(e.target.value)}
              />
            </div>
            <p className="pb-2 text-xs text-muted-foreground">
              A data será usada ao agendar cada pagamento da fila.
            </p>
            <Button
              size="sm"
              variant="outline"
              disabled={agendarEmMassa.isPending || pagamentosSelecionados.length === 0}
              onClick={() => agendarEmMassa.mutate()}
            >
              <CalendarClock className="size-4" /> Agendar selecionados (
              {pagamentosSelecionados.length})
            </Button>
          </div>
          {fila.isPending ? (
            <LoadingBloco />
          ) : fila.isError ? (
            <ErrorState error={fila.error} onRetry={() => fila.refetch()} />
          ) : fila.data.length === 0 ? (
            <EmptyState
              titulo="Nada a pagar"
              descricao="Fechamentos aprovados aparecem aqui para gerar o pagamento."
            />
          ) : (
            <ul className="space-y-2">
              {fila.data.map((f) => {
                const p = um(f.pagamentos);
                const escala = um(f.escala);
                const freelancer = um(escala?.freelancer);
                const equipe = um(escala?.equipe);
                const evento = um(equipe?.evento);
                return (
                  <li
                    key={f.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-3"
                  >
                    {p?.status === "pendente" ? (
                      <Checkbox
                        checked={pagamentosSelecionados.includes(p.id)}
                        onCheckedChange={(checked) =>
                          setPagamentosSelecionados((atual) =>
                            checked ? [...atual, p.id] : atual.filter((id) => id !== p.id),
                          )
                        }
                        aria-label={`Selecionar pagamento de ${freelancer?.nome ?? "colaborador"}`}
                      />
                    ) : null}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{freelancer?.nome}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {evento?.nome} · {equipe?.nome} · Pix: {freelancer?.chave_pix ?? "—"}
                      </p>
                      {p?.txid_parceiro ? (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          transferência: {p.txid_parceiro}
                          {p.executado_em ? ` · ${dataHora(p.executado_em)}` : ""}
                        </p>
                      ) : null}
                      {p?.erro ? (
                        <div className="mt-1 flex items-center gap-1.5 text-xs font-medium text-destructive">
                          <AlertCircle className="size-3.5 shrink-0" />
                          <span>Motivo da falha: {p.erro}</span>
                        </div>
                      ) : null}
                      {p?.data_agendada ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          agendado para {dataHora(p.data_agendada)}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="tabular-nums text-sm font-semibold">
                        {moeda(f.valor_calculado)}
                      </span>
                      {p ? (
                        <>
                          <StatusBadge status={p.status} />
                          {p.status === "pendente" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => agendar.mutate(p.id)}
                            >
                              <CalendarClock className="size-4" /> Agendar
                            </Button>
                          ) : null}
                          {p.status === "pendente" || p.status === "agendado" ? (
                            <Button
                              size="sm"
                              disabled={executar.isPending}
                              onClick={() => executar.mutate(p.id)}
                            >
                              <Play className="size-4" /> Enviar Pix
                            </Button>
                          ) : null}
                          {p.status === "falhou" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => tentarNovamente.mutate(p.id)}
                            >
                              <RotateCcw className="size-4" /> Tentar de novo
                            </Button>
                          ) : null}
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={gerar.isPending}
                          onClick={() => gerar.mutate(f.id)}
                        >
                          Gerar pagamento
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="entradas" className="mt-4 space-y-4">
          <section className="rounded-md border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Cobrar cliente do evento</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Cliente</Label>
                <Select value={clienteId} onValueChange={setClienteId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {(auxiliares.data?.clientes ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}
                        {c.cpf_cnpj ? "" : " (sem CPF/CNPJ)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Evento (opcional)</Label>
                <Select value={eventoId} onValueChange={setEventoId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sem vínculo" />
                  </SelectTrigger>
                  <SelectContent>
                    {(auxiliares.data?.eventos ?? []).map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="valor">Valor (R$)</Label>
                <Input
                  id="valor"
                  inputMode="decimal"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  placeholder="0,00"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Forma</Label>
                <Select value={forma} onValueChange={(v) => setForma(v as typeof forma)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pix">Pix</SelectItem>
                    <SelectItem value="boleto">Boleto</SelectItem>
                    <SelectItem value="cartao">Cartão</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="venc">Vencimento</Label>
                <Input
                  id="venc"
                  type="date"
                  value={vencimento}
                  onChange={(e) => setVencimento(e.target.value)}
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2 lg:col-span-2">
                <Label htmlFor="desc">Descrição</Label>
                <Input
                  id="desc"
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Ex.: Equipe do evento Show de Verão"
                />
              </div>

              <div className="flex items-end">
                <Button
                  className="w-full"
                  disabled={emitir.isPending}
                  onClick={() => emitir.mutate()}
                >
                  <Plus className="size-4" /> Emitir cobrança
                </Button>
              </div>
            </div>
          </section>

          {cobrancas.isPending ? (
            <LoadingBloco />
          ) : cobrancas.isError ? (
            <ErrorState error={cobrancas.error} onRetry={() => cobrancas.refetch()} />
          ) : cobrancas.data.length === 0 ? (
            <EmptyState
              titulo="Nenhuma cobrança emitida"
              descricao="Emita uma cobrança vinculada a um cliente e evento."
            />
          ) : (
            <ul className="space-y-2">
              {cobrancas.data.map((c) => {
                const cliente = um(c.clientes);
                const evento = um(c.eventos);
                return (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{c.descricao}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {cliente?.nome}
                        {evento ? ` · ${evento.nome}` : ""} · vence {c.vencimento ?? "—"}
                      </p>
                      {c.erro ? <p className="mt-0.5 text-xs text-destructive">{c.erro}</p> : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="tabular-nums text-sm font-semibold">{moeda(c.valor)}</span>
                      <StatusBadge status={c.status} />
                      {c.pix_copia_cola ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            void navigator.clipboard.writeText(c.pix_copia_cola!);
                            toast.success("Pix copia-e-cola copiado.");
                          }}
                        >
                          <Copy className="size-4" /> Pix
                        </Button>
                      ) : null}
                      {c.link_pagamento ? (
                        <a
                          className="text-xs underline underline-offset-4"
                          href={c.link_pagamento}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Abrir fatura
                        </a>
                      ) : null}
                      {c.status !== "pago" && c.parceiro_cobranca_id ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={sincronizar.isPending}
                          onClick={() => sincronizar.mutate(c.id)}
                        >
                          <RefreshCw className="size-4" /> Verificar
                        </Button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
