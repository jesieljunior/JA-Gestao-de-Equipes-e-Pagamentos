import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  Clock,
  Copy,
  DollarSign,
  PiggyBank,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Users,
  Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";
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
import {
  calcularMetricasTesouraria,
  calcularPosicaoPorCliente,
  estaNoPeriodo,
  type PeriodoDias,
  ROTULO_PERIODO,
} from "@/lib/tesouraria";

export const Route = createFileRoute("/_authenticated/financeiro")({
  head: () => ({
    meta: [
      { title: "Financeiro & Pix — PayCrew" },
      {
        name: "description",
        content:
          "Saldo real da agência, cobranças aos clientes, saldo em custódia e fila de repasses Pix para prestadores nos últimos 30, 60 e 90 dias.",
      },
      { property: "og:title", content: "Financeiro & Pix — PayCrew" },
      {
        property: "og:description",
        content: "Saldo em conta, cobranças e repasses Pix para a equipe.",
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

  // Estados de Filtro de Período
  const [periodo, setPeriodo] = useState<PeriodoDias>("30");

  // Estados do Formulário de Cobrança
  const [clienteId, setClienteId] = useState("");
  const [eventoId, setEventoId] = useState("");
  const [valor, setValor] = useState("");
  const [forma, setForma] = useState<"pix" | "boleto" | "cartao">("pix");
  const [vencimento, setVencimento] = useState(hojeMais(3));
  const [descricao, setDescricao] = useState("");

  // Estados de Pagamento e Fila
  const [dataPagamento, setDataPagamento] = useState(hojeMais(1));
  const [pagamentosSelecionados, setPagamentosSelecionados] = useState<string[]>([]);
  const [filtroStatusPagamento, setFiltroStatusPagamento] = useState<string>("todos");
  const [buscaPagamento, setBuscaPagamento] = useState("");

  // Busca de Cobranças e Clientes
  const [buscaCobranca, setBuscaCobranca] = useState("");

  // 1. Saldo Real em Conta
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

  // 2. Cobranças Emitidas
  const cobrancas = useQuery({
    queryKey: ["financeiro", "cobrancas", empresaId],
    enabled: Boolean(empresaId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cobrancas")
        .select("*, clientes(nome), eventos(nome)")
        .eq("empresa_id", empresaId!)
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // 3. Auxiliares (Clientes e Eventos da Agência)
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
          .select("id, nome, cliente_id")
          .eq("empresa_id", empresaId!)
          .order("data_inicio", { ascending: false })
          .limit(100),
      ]);
      if (c.error) throw c.error;
      if (e.error) throw e.error;
      return { clientes: c.data ?? [], eventos: e.data ?? [] };
    },
  });

  // 4. Fila de Fechamentos e Pagamentos
  const fila = useQuery({
    queryKey: ["financeiro", "fila", empresaId],
    enabled: Boolean(empresaId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fechamentos")
        .select(
          "id, valor_calculado, status, escala:escalas(valor_combinado, tipo_valor, freelancer:freelancers(nome, chave_pix), equipe:equipes(nome, evento:eventos(id, nome, cliente_id))), pagamentos(*)",
        )
        .eq("escalas.equipes.eventos.empresa_id", empresaId!)
        .eq("status", "aprovado")
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // 5. Taxas da plataforma
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
      return (data ?? []).reduce((s, t) => s + Number(t.valor), 0);
    },
  });

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ["financeiro"] });
    queryClient.invalidateQueries({ queryKey: ["saldo"] });
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
      toast.success("Cobrança emitida com sucesso.");
      setValor("");
      setDescricao("");
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sincronizar = useMutation({
    mutationFn: (id: string) => chamarSincronizar({ data: { id } }),
    onSuccess: (r) => {
      toast.success(
        r.status === "pago" ? "Pagamento confirmado, saldo liberado." : `Status: ${r.status}`,
      );
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
    onSuccess: () => {
      toast.success("Pagamento agendado.");
      invalidar();
    },
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
      toast.success("Pagamentos agendados em lote.");
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const executar = useMutation({
    mutationFn: (id: string) => chamarPix({ data: { pagamentoId: id } }),
    onSuccess: (r) => {
      toast.success(
        r.taxa > 0
          ? `Pix enviado com sucesso. Taxa: ${moeda(r.taxa)}.`
          : "Pix enviado com sucesso.",
      );
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const tentarNovamente = useMutation({
    mutationFn: (id: string) => chamarReabrirPagamento({ data: { pagamentoId: id } }),
    onSuccess: () => {
      toast.success("Pagamento reaberto para envio.");
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Lista plana de pagamentos com metadados
  const todosPagamentos = useMemo(() => {
    return (fila.data ?? []).flatMap((f) => {
      const escala = um(f.escala);
      const freelancer = um(escala?.freelancer);
      const equipe = um(escala?.equipe);
      const evento = um(equipe?.evento);
      return lista(f.pagamentos).map((p) => ({
        ...p,
        fechamentoId: f.id,
        valorCalculado: f.valor_calculado,
        freelancerNome: freelancer?.nome ?? "Colaborador",
        chavePix: freelancer?.chave_pix ?? "",
        equipeNome: equipe?.nome ?? "",
        eventoNome: evento?.nome ?? "",
        eventoId: evento?.id ?? null,
        clienteId: evento?.cliente_id ?? null,
      }));
    });
  }, [fila.data]);

  // Mapa de evento -> cliente
  const eventoClienteMap = useMemo(() => {
    const map = new Map<string, string>();
    (auxiliares.data?.eventos ?? []).forEach((ev) => {
      if (ev.cliente_id) map.set(ev.id, ev.cliente_id);
    });
    return map;
  }, [auxiliares.data?.eventos]);

  // Métricas Consolidadas de Tesouraria
  const metricas = useMemo(() => {
    return calcularMetricasTesouraria({
      saldoReal: saldo.data ?? 0,
      cobrancas: cobrancas.data ?? [],
      pagamentos: todosPagamentos,
      periodo,
    });
  }, [saldo.data, cobrancas.data, todosPagamentos, periodo]);

  // Balanço por Cliente
  const posicoesClientes = useMemo(() => {
    return calcularPosicaoPorCliente({
      clientes: auxiliares.data?.clientes ?? [],
      cobrancas: cobrancas.data ?? [],
      pagamentos: todosPagamentos,
      eventoClienteMap,
    });
  }, [auxiliares.data?.clientes, cobrancas.data, todosPagamentos, eventoClienteMap]);

  // Fechamentos aprovados sem pagamento gerado ainda
  const aGerar = useMemo(() => {
    return (fila.data ?? []).filter((f) => lista(f.pagamentos).length === 0);
  }, [fila.data]);

  // Pagamentos filtrados por status, período e busca
  const pagamentosFiltrados = useMemo(() => {
    return (fila.data ?? []).filter((f) => {
      const p = um(f.pagamentos);
      const escala = um(f.escala);
      const freelancer = um(escala?.freelancer);
      const equipe = um(escala?.equipe);
      const evento = um(equipe?.evento);

      // Filtro de status
      if (filtroStatusPagamento === "sem_pagamento") {
        if (p) return false;
      } else if (filtroStatusPagamento !== "todos") {
        if (!p || p.status !== filtroStatusPagamento) return false;
      }

      // Filtro de período para pagamentos já criados/executados
      if (p && !estaNoPeriodo(p.executado_em || p.criado_em, periodo)) {
        return false;
      }

      // Filtro de busca textual
      if (buscaPagamento.trim()) {
        const termo = buscaPagamento.toLowerCase();
        const nome = (freelancer?.nome ?? "").toLowerCase();
        const pix = (freelancer?.chave_pix ?? "").toLowerCase();
        const ev = (evento?.nome ?? "").toLowerCase();
        if (!nome.includes(termo) && !pix.includes(termo) && !ev.includes(termo)) {
          return false;
        }
      }

      return true;
    });
  }, [fila.data, filtroStatusPagamento, periodo, buscaPagamento]);

  // Cobranças filtradas por busca
  const cobrancasFiltradas = useMemo(() => {
    const list = cobrancas.data ?? [];
    if (!buscaCobranca.trim()) return list;
    const termo = buscaCobranca.toLowerCase();
    return list.filter((c) => {
      const cliente = um(c.clientes)?.nome?.toLowerCase() ?? "";
      const evento = um(c.eventos)?.nome?.toLowerCase() ?? "";
      const desc = (c.descricao ?? "").toLowerCase();
      return cliente.includes(termo) || evento.includes(termo) || desc.includes(termo);
    });
  }, [cobrancas.data, buscaCobranca]);

  return (
    <AppShell
      titulo="Financeiro & Pix"
      descricao="Saldo real da agência, aportes dos clientes, cobranças e repasses Pix"
    >
      {/* Barra de Período e Resumo Executivo */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight">
            Tesouraria do Evento & Fluxo Pix
          </h2>
          <p className="text-xs text-muted-foreground">
            Acompanhe o saldo real disponível, aportes de clientes e repasses liquidados
          </p>
        </div>

        {/* Seletor Segmentado de Período (30d / 60d / 90d / todos) */}
        <div className="inline-flex rounded-lg border border-border bg-muted/40 p-1">
          {(["30", "60", "90", "todos"] as PeriodoDias[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriodo(p)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                periodo === p
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p === "todos" ? "Histórico Total" : `${p} dias`}
            </button>
          ))}
        </div>
      </div>

      {/* Grid com os 4 Pilares de Tesouraria */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* 1. Saldo Real em Conta */}
        <div className="rounded-lg border border-border bg-card p-4 transition-all">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Saldo Real em Conta</span>
            <Wallet className="size-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold tracking-tight tabular-nums text-foreground">
              {moeda(metricas.saldoReal)}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Disponível para Pix imediato</span>
            <Link to="/saldo" className="text-primary hover:underline">
              Adicionar Saldo
            </Link>
          </div>
        </div>

        {/* 2. Saldo Colocado pelos Clientes */}
        <div className="rounded-lg border border-border bg-card p-4 transition-all">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Aportado por Clientes</span>
            <PiggyBank className="size-4 text-primary" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold tracking-tight tabular-nums text-foreground">
              {moeda(metricas.saldoClientesColocadoTotal)}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {moeda(metricas.saldoClientesColocadoPeriodo)} no período de{" "}
            {ROTULO_PERIODO[periodo].toLowerCase()}
          </p>
        </div>

        {/* 3. Saldo Pendente de Entrar */}
        <div className="rounded-lg border border-border bg-card p-4 transition-all">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Pendente de Entrar</span>
            <Clock className="size-4 text-amber-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold tracking-tight tabular-nums text-foreground">
              {moeda(metricas.saldoPendenteEntrar)}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {metricas.qtdCobrancasPendentes} cobrança(s) de clientes em aberto
          </p>
        </div>

        {/* 4. Saldo Repassado via Pix */}
        <div className="rounded-lg border border-border bg-card p-4 transition-all">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Repassado ({ROTULO_PERIODO[periodo]})</span>
            <ArrowUpRight className="size-4 text-blue-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold tracking-tight tabular-nums text-foreground">
              {moeda(metricas.saldoRepassadoPeriodo)}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>30d: {moeda(metricas.saldoRepassado30Dias)}</span>
            <span>·</span>
            <span>60d: {moeda(metricas.saldoRepassado60Dias)}</span>
            <span>·</span>
            <span>90d: {moeda(metricas.saldoRepassado90Dias)}</span>
          </div>
        </div>
      </div>

      {/* Abas Financeiras */}
      <Tabs defaultValue="pagamentos">
        <TabsList className="grid w-full grid-cols-4 sm:w-auto">
          <TabsTrigger value="pagamentos">Fila de Pix (Saídas)</TabsTrigger>
          <TabsTrigger value="entradas">Cobranças Clientes (Entradas)</TabsTrigger>
          <TabsTrigger value="clientes">Posição por Cliente</TabsTrigger>
          <TabsTrigger value="extrato-pix">Extrato Pix Geral</TabsTrigger>
        </TabsList>

        {/* ABA 1: Fila de Pagamentos Pix (Saídas) */}
        <TabsContent value="pagamentos" className="mt-4 space-y-4">
          {/* Barra de Filtros e Agendamento em Massa */}
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar colaborador, Pix ou evento..."
                  value={buscaPagamento}
                  onChange={(e) => setBuscaPagamento(e.target.value)}
                  className="pl-8 text-xs"
                />
              </div>

              <Select value={filtroStatusPagamento} onValueChange={setFiltroStatusPagamento}>
                <SelectTrigger className="h-9 w-40 text-xs">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os status</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="agendado">Agendado</SelectItem>
                  <SelectItem value="executado">Pago / Executado</SelectItem>
                  <SelectItem value="falhou">Falhou</SelectItem>
                  <SelectItem value="sem_pagamento">A Gerar Pagamento</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="date"
                min={hojeMais(1)}
                value={dataPagamento}
                onChange={(e) => setDataPagamento(e.target.value)}
                className="h-9 w-36 text-xs font-mono"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={agendarEmMassa.isPending || pagamentosSelecionados.length === 0}
                onClick={() => agendarEmMassa.mutate()}
                className="whitespace-nowrap"
              >
                <CalendarClock className="mr-1.5 size-4" /> Agendar Lote (
                {pagamentosSelecionados.length})
              </Button>
            </div>
          </div>

          {fila.isPending ? (
            <LoadingBloco />
          ) : fila.isError ? (
            <ErrorState error={fila.error} onRetry={() => fila.refetch()} />
          ) : pagamentosFiltrados.length === 0 ? (
            <EmptyState
              titulo="Nenhum pagamento correspondente aos filtros"
              descricao="Aprove fechamentos de eventos ou altere os filtros de status e período para visualizar a fila."
            />
          ) : (
            <ul className="space-y-2">
              {pagamentosFiltrados.map((f) => {
                const p = um(f.pagamentos);
                const escala = um(f.escala);
                const freelancer = um(escala?.freelancer);
                const equipe = um(escala?.equipe);
                const evento = um(equipe?.evento);
                return (
                  <li
                    key={f.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 hover:border-border/80 transition-all"
                  >
                    <div className="flex items-center gap-3 min-w-0">
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
                        <p className="truncate text-sm font-semibold text-foreground">
                          {freelancer?.nome}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {evento?.nome ?? "Evento"} · {equipe?.nome ?? "Equipe"} · Chave Pix:{" "}
                          <strong className="font-mono text-foreground">
                            {freelancer?.chave_pix ?? "Não cadastrada"}
                          </strong>
                        </p>
                        {p?.txid_parceiro ? (
                          <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                            TXID: {p.txid_parceiro}
                            {p.executado_em ? ` · Liquidado em ${dataHora(p.executado_em)}` : ""}
                          </p>
                        ) : null}
                        {p?.erro ? (
                          <div className="mt-1 flex items-center gap-1.5 text-xs font-medium text-destructive">
                            <AlertCircle className="size-3.5 shrink-0" />
                            <span>Falha: {p.erro}</span>
                          </div>
                        ) : null}
                        {p?.data_agendada ? (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Agendado para: <strong>{dataHora(p.data_agendada)}</strong>
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="font-mono text-sm font-bold tabular-nums text-foreground">
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
                              className="h-8 text-xs"
                            >
                              <CalendarClock className="mr-1 size-3.5" /> Agendar
                            </Button>
                          ) : null}
                          {p.status === "pendente" || p.status === "agendado" ? (
                            <Button
                              size="sm"
                              disabled={executar.isPending}
                              onClick={() => executar.mutate(p.id)}
                              className="h-8 text-xs"
                            >
                              <Play className="mr-1 size-3.5" /> Enviar Pix
                            </Button>
                          ) : null}
                          {p.status === "falhou" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => tentarNovamente.mutate(p.id)}
                              className="h-8 text-xs"
                            >
                              <RotateCcw className="mr-1 size-3.5" /> Tentar de novo
                            </Button>
                          ) : null}
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={gerar.isPending}
                          onClick={() => gerar.mutate(f.id)}
                          className="h-8 text-xs"
                        >
                          Gerar Pagamento
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>

        {/* ABA 2: Cobranças de Clientes (Inbound Pix / Aportes) */}
        <TabsContent value="entradas" className="mt-4 space-y-4">
          <section className="rounded-lg border border-border bg-card p-5">
            <h3 className="mb-1 text-sm font-semibold">Emitir Cobrança para Cliente do Evento</h3>
            <p className="mb-4 text-xs text-muted-foreground">
              Gere uma cobrança com QR Code Pix ou boleto. Ao ser paga pelo cliente, o valor é
              creditado imediatamente no seu saldo real.
            </p>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Cliente Contratante</Label>
                <Select value={clienteId} onValueChange={setClienteId}>
                  <SelectTrigger className="text-xs">
                    <SelectValue placeholder="Selecione o cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {(auxiliares.data?.clientes ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome} {c.cpf_cnpj ? `(${c.cpf_cnpj})` : "(sem documento)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Evento Vinculado (opcional)</Label>
                <Select value={eventoId} onValueChange={setEventoId}>
                  <SelectTrigger className="text-xs">
                    <SelectValue placeholder="Sem vínculo a evento específico" />
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
                <Label htmlFor="valor">Valor da Cobrança (R$)</Label>
                <Input
                  id="valor"
                  inputMode="decimal"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  placeholder="0,00"
                  className="font-mono tabular-nums text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Forma de Pagamento</Label>
                <Select value={forma} onValueChange={(v) => setForma(v as typeof forma)}>
                  <SelectTrigger className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pix">Pix (Recomendado - Instantâneo)</SelectItem>
                    <SelectItem value="boleto">Boleto Bancário</SelectItem>
                    <SelectItem value="cartao">Cartão de Crédito</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="venc">Data de Vencimento</Label>
                <Input
                  id="venc"
                  type="date"
                  value={vencimento}
                  onChange={(e) => setVencimento(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
                <Label htmlFor="desc">Descrição / Observação</Label>
                <Input
                  id="desc"
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Ex.: Aporte para equipe do Festival de Inverno"
                  className="text-xs"
                />
              </div>

              <div className="flex items-end sm:col-span-2 lg:col-span-3">
                <Button
                  className="w-full sm:w-auto"
                  disabled={emitir.isPending}
                  onClick={() => emitir.mutate()}
                >
                  <Plus className="mr-1.5 size-4" /> Emitir Cobrança do Cliente
                </Button>
              </div>
            </div>
          </section>

          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Histórico de Cobranças de Clientes</h3>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder="Filtrar cobranças..."
                value={buscaCobranca}
                onChange={(e) => setBuscaCobranca(e.target.value)}
                className="pl-8 text-xs"
              />
            </div>
          </div>

          {cobrancas.isPending ? (
            <LoadingBloco />
          ) : cobrancas.isError ? (
            <ErrorState error={cobrancas.error} onRetry={() => cobrancas.refetch()} />
          ) : cobrancasFiltradas.length === 0 ? (
            <EmptyState
              titulo="Nenhuma cobrança encontrada"
              descricao="Emita uma cobrança vinculada a um cliente e evento para compor o fluxo de caixa."
            />
          ) : (
            <ul className="space-y-2">
              {cobrancasFiltradas.map((c) => {
                const cliente = um(c.clientes);
                const evento = um(c.eventos);
                return (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-foreground">{c.descricao}</p>
                      <p className="text-xs text-muted-foreground">
                        {cliente?.nome ?? "Cliente"}
                        {evento ? ` · ${evento.nome}` : ""} · Vencimento: {c.vencimento ?? "—"}
                      </p>
                      {c.erro ? <p className="mt-0.5 text-xs text-destructive">{c.erro}</p> : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-bold tabular-nums text-foreground">
                        {moeda(c.valor)}
                      </span>
                      <StatusBadge status={c.status} />
                      {c.pix_copia_cola ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            void navigator.clipboard.writeText(c.pix_copia_cola!);
                            toast.success("Pix copia e cola copiado.");
                          }}
                          className="h-8 text-xs"
                        >
                          <Copy className="mr-1 size-3.5" /> Copiar Pix
                        </Button>
                      ) : null}
                      {c.link_pagamento ? (
                        <a
                          className="text-xs font-medium text-primary underline underline-offset-4"
                          href={c.link_pagamento}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Abrir Fatura
                        </a>
                      ) : null}
                      {c.status !== "pago" && c.parceiro_cobranca_id ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={sincronizar.isPending}
                          onClick={() => sincronizar.mutate(c.id)}
                          className="h-8 text-xs"
                        >
                          <RefreshCw className="mr-1 size-3.5" /> Conferir Pagamento
                        </Button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>

        {/* ABA 3: Posição por Cliente (Custódia & Aportes) */}
        <TabsContent value="clientes" className="mt-4 space-y-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="text-sm font-semibold">Balanço e Custódia por Contratante</h3>
            <p className="text-xs text-muted-foreground">
              Visão segregada do dinheiro colocado por cada contratante comparado com os repasses
              aos colaboradores.
            </p>
          </div>

          {posicoesClientes.length === 0 ? (
            <EmptyState
              titulo="Nenhum cliente cadastrado"
              descricao="Cadastre clientes e emita cobranças para acompanhar o saldo em custódia."
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border bg-muted/30 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Cliente</th>
                    <th className="px-4 py-3 font-medium text-right">Colocado (Pago)</th>
                    <th className="px-4 py-3 font-medium text-right">Pendente a Entrar</th>
                    <th className="px-4 py-3 font-medium text-right">Repassado nos Eventos</th>
                    <th className="px-4 py-3 font-medium text-right">Saldo em Custódia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {posicoesClientes.map((c) => {
                    const emDia = c.saldoCustodia >= 0;
                    return (
                      <tr key={c.clienteId} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-foreground">{c.nome}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {c.cpfCnpj ?? "Sem documento"} · {c.totalEventos} evento(s)
                          </p>
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-medium tabular-nums text-foreground">
                          {moeda(c.totalColocado)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-medium tabular-nums text-amber-600 dark:text-amber-400">
                          {moeda(c.totalPendente)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-medium tabular-nums text-foreground">
                          {moeda(c.totalRepassado)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span
                            className={`inline-block font-mono font-semibold tabular-nums ${
                              emDia ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
                            }`}
                          >
                            {moeda(c.saldoCustodia)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* ABA 4: Extrato Pix Geral */}
        <TabsContent value="extrato-pix" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">
                Extrato Unificado de Transações Pix ({ROTULO_PERIODO[periodo]})
              </h3>
              <p className="text-xs text-muted-foreground">
                Todas as entradas por Pix de clientes e recargas, além dos repasses Pix enviados aos
                freelancers.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {/* Entradas Pix Recentes */}
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                  <ArrowDownLeft className="size-4" /> Entradas Pix (Aportes & Clientes)
                </span>
                <span className="font-mono text-xs font-bold tabular-nums">
                  {moeda(
                    (cobrancas.data ?? [])
                      .filter(
                        (c) =>
                          c.status === "pago" && estaNoPeriodo(c.pago_em || c.criado_em, periodo),
                      )
                      .reduce((acc, c) => acc + Number(c.valor || 0), 0),
                  )}
                </span>
              </div>

              <ul className="space-y-2 text-xs divide-y divide-border/60">
                {(cobrancas.data ?? [])
                  .filter(
                    (c) => c.status === "pago" && estaNoPeriodo(c.pago_em || c.criado_em, periodo),
                  )
                  .slice(0, 8)
                  .map((c) => (
                    <li key={c.id} className="pt-2 first:pt-0 flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{c.descricao || "Aporte confirmado"}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {dataHora(c.pago_em || c.criado_em)}
                        </p>
                      </div>
                      <span className="font-mono font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                        + {moeda(c.valor)}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>

            {/* Saídas Pix Recentes */}
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                  <ArrowUpRight className="size-4" /> Repasses Pix à Equipe (
                  {ROTULO_PERIODO[periodo]})
                </span>
                <span className="font-mono text-xs font-bold tabular-nums">
                  {moeda(metricas.saldoRepassadoPeriodo)}
                </span>
              </div>

              <ul className="space-y-2 text-xs divide-y divide-border/60">
                {todosPagamentos
                  .filter(
                    (p) =>
                      p.status === "executado" &&
                      estaNoPeriodo(p.executado_em || p.criado_em, periodo),
                  )
                  .slice(0, 8)
                  .map((p) => (
                    <li key={p.id} className="pt-2 first:pt-0 flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{p.freelancerNome}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {dataHora(p.executado_em || p.criado_em)} · Pix: {p.chavePix || "—"}
                        </p>
                      </div>
                      <span className="font-mono font-semibold tabular-nums text-foreground">
                        - {moeda(p.valor)}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
