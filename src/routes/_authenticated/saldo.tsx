import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Clock,
  Copy,
  DollarSign,
  PiggyBank,
  Plus,
  RefreshCw,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSessao } from "@/hooks/use-sessao";
import { supabase } from "@/integrations/supabase/client";
import { dataHora, lista, moeda, um } from "@/lib/dominio";
import { sincronizarCobranca } from "@/lib/financeiro.functions";
import { parseValorPositivo } from "@/lib/moeda";
import { iniciarRecarga } from "@/lib/saldo.functions";
import {
  calcularMetricasTesouraria,
  calcularPosicaoPorCliente,
  estaNoPeriodo,
  type PeriodoDias,
  ROTULO_PERIODO,
} from "@/lib/tesouraria";

export const Route = createFileRoute("/_authenticated/saldo")({
  head: () => ({
    meta: [
      { title: "Tesouraria & Saldo — PayCrew" },
      {
        name: "description",
        content:
          "Saldo real da agência, aportes dos clientes, valores pendentes e repasses Pix nos últimos 30, 60 e 90 dias.",
      },
      { property: "og:title", content: "Tesouraria & Saldo — PayCrew" },
      {
        property: "og:description",
        content: "Gestão completa de saldo, aportes de clientes e repasses Pix.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Saldo,
});

const ATALHOS = [500, 1000, 2500, 5000];
type Forma = "pix" | "cartao" | "boleto";

function Saldo() {
  const { empresaId } = useSessao();
  const queryClient = useQueryClient();
  const chamarRecarga = useServerFn(iniciarRecarga);
  const chamarSincronizar = useServerFn(sincronizarCobranca);

  const [periodo, setPeriodo] = useState<PeriodoDias>("30");
  const [buscaCliente, setBuscaCliente] = useState("");
  const [valorRecarga, setValorRecarga] = useState("");
  const [formaRecarga, setFormaRecarga] = useState<Forma>("pix");
  const [resultadoRecarga, setResultadoRecarga] = useState<{
    link: string | null;
    pixCopiaCola: string | null;
    pixImagem: string | null;
  } | null>(null);

  // 1. Saldo real disponível em conta
  const saldoQuery = useQuery({
    queryKey: ["saldo", "total", empresaId],
    enabled: Boolean(empresaId),
    queryFn: async () => {
      if (!empresaId) throw new Error("Agência não identificada.");
      const { data, error } = await supabase.rpc("saldo_empresa", {
        _empresa_id: empresaId,
      });
      if (error) throw error;
      return Number(data ?? 0);
    },
  });

  // 2. Todas as cobranças (aportes da agência e cobranças de clientes)
  const cobrancasQuery = useQuery({
    queryKey: ["saldo", "cobrancas", empresaId],
    enabled: Boolean(empresaId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cobrancas")
        .select(
          "id, tipo, status, valor, criado_em, pago_em, vencimento, descricao, forma, cliente_id, evento_id, pix_copia_cola, link_pagamento, parceiro_cobranca_id, erro",
        )
        .eq("empresa_id", empresaId!)
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // 3. Clientes da agência
  const clientesQuery = useQuery({
    queryKey: ["saldo", "clientes", empresaId],
    enabled: Boolean(empresaId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select("id, nome, cpf_cnpj, email, telefone")
        .eq("empresa_id", empresaId!)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  // 4. Eventos
  const eventosQuery = useQuery({
    queryKey: ["saldo", "eventos", empresaId],
    enabled: Boolean(empresaId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("eventos")
        .select("id, nome, cliente_id")
        .eq("empresa_id", empresaId!);
      if (error) throw error;
      return data ?? [];
    },
  });

  // 5. Pagamentos com cadeia de evento/cliente
  const pagamentosQuery = useQuery({
    queryKey: ["saldo", "pagamentos", empresaId],
    enabled: Boolean(empresaId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pagamentos")
        .select(
          "id, valor, status, data_agendada, executado_em, criado_em, txid_parceiro, fechamento:fechamentos(escala:escalas(equipe:equipes(evento:eventos(id, cliente_id))))",
        )
        .order("criado_em", { ascending: false });
      if (error) throw error;

      return (data ?? []).map((p) => {
        const fechamento = um(p.fechamento);
        const escala = um(fechamento?.escala);
        const equipe = um(escala?.equipe);
        const evento = um(equipe?.evento);
        return {
          id: p.id,
          valor: p.valor,
          status: p.status,
          data_agendada: p.data_agendada,
          executado_em: p.executado_em,
          criado_em: p.criado_em,
          txid_parceiro: p.txid_parceiro,
          evento_id: evento?.id ?? null,
          cliente_id: evento?.cliente_id ?? null,
        };
      });
    },
  });

  // 6. Extrato de movimentos de saldo
  const movimentosQuery = useQuery({
    queryKey: ["saldo", "movimentos", empresaId],
    enabled: Boolean(empresaId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("movimentos_saldo")
        .select("id, tipo, valor, descricao, criado_em, cobranca_id, pagamento_id")
        .eq("empresa_id", empresaId!)
        .order("criado_em", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ["saldo"] });
    queryClient.invalidateQueries({ queryKey: ["financeiro"] });
    queryClient.invalidateQueries({ queryKey: ["painel"] });
  };

  const recarregar = useMutation({
    mutationFn: async () => {
      const numero = parseValorPositivo(valorRecarga);
      if (numero < 5) throw new Error("Informe um valor de pelo menos R$ 5,00.");
      return chamarRecarga({ data: { valor: numero, forma: formaRecarga } });
    },
    onSuccess: (r) => {
      setResultadoRecarga({
        link: r.link,
        pixCopiaCola: r.pixCopiaCola,
        pixImagem: r.pixImagem,
      });
      setValorRecarga("");
      toast.success("Recarga criada. Conclua o pagamento para liberar o saldo.");
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const conferir = useMutation({
    mutationFn: (id: string) => chamarSincronizar({ data: { id } }),
    onSuccess: (r) => {
      toast.success(
        r.status === "pago" ? "Pagamento confirmado, saldo liberado." : `Status: ${r.status}`,
      );
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const copiar = async (texto: string) => {
    await navigator.clipboard.writeText(texto);
    toast.success("Pix copia e cola copiado.");
  };

  // Mapa de evento -> cliente
  const eventoClienteMap = useMemo(() => {
    const map = new Map<string, string>();
    (eventosQuery.data ?? []).forEach((ev) => {
      if (ev.cliente_id) map.set(ev.id, ev.cliente_id);
    });
    return map;
  }, [eventosQuery.data]);

  // Métricas de Tesouraria consolidadas
  const metricas = useMemo(() => {
    return calcularMetricasTesouraria({
      saldoReal: saldoQuery.data ?? 0,
      cobrancas: cobrancasQuery.data ?? [],
      pagamentos: pagamentosQuery.data ?? [],
      periodo,
    });
  }, [saldoQuery.data, cobrancasQuery.data, pagamentosQuery.data, periodo]);

  // Balanço por Cliente
  const posicoesClientes = useMemo(() => {
    const lista = calcularPosicaoPorCliente({
      clientes: clientesQuery.data ?? [],
      cobrancas: cobrancasQuery.data ?? [],
      pagamentos: pagamentosQuery.data ?? [],
      eventoClienteMap,
    });

    if (!buscaCliente.trim()) return lista;
    const termo = buscaCliente.toLowerCase();
    return lista.filter(
      (c) => c.nome.toLowerCase().includes(termo) || (c.cpfCnpj && c.cpfCnpj.includes(termo)),
    );
  }, [
    clientesQuery.data,
    cobrancasQuery.data,
    pagamentosQuery.data,
    eventoClienteMap,
    buscaCliente,
  ]);

  // Movimentações filtradas pelo período
  const movimentosFiltrados = useMemo(() => {
    return (movimentosQuery.data ?? []).filter((m) => estaNoPeriodo(m.criado_em, periodo));
  }, [movimentosQuery.data, periodo]);

  // Recargas próprias da agência
  const recargasAgencia = useMemo(() => {
    return (cobrancasQuery.data ?? []).filter((c) => c.tipo === "aporte_agencia");
  }, [cobrancasQuery.data]);

  return (
    <AppShell
      titulo="Tesouraria & Saldo"
      descricao="Balanço da agência, aportes dos clientes, valores a receber e repasses Pix"
    >
      {/* Seletor de Período e Resumo Executivo */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Posição Financeira da Empresa</h2>
          <p className="text-xs text-muted-foreground">
            Balanço dinâmico para tomadas de decisão e repasses imediatos
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

      {/* Grid com os 4 Pilares Financeiros do Dono da Empresa */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* 1. Saldo Real da Conta */}
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
          <p className="mt-1 text-xs text-muted-foreground">
            Disponível para pagamentos Pix imediatos
          </p>
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

      {/* Abas de Operação Financeira */}
      <Tabs defaultValue="clientes">
        <TabsList className="grid w-full grid-cols-4 sm:w-auto">
          <TabsTrigger value="clientes">Saldos por Cliente</TabsTrigger>
          <TabsTrigger value="recarga">Adicionar Saldo</TabsTrigger>
          <TabsTrigger value="extrato">Extrato em Conta</TabsTrigger>
          <TabsTrigger value="historico-recargas">Minhas Recargas</TabsTrigger>
        </TabsList>

        {/* ABA 1: Saldos por Cliente (Custódia & Aportes) */}
        <TabsContent value="clientes" className="mt-4 space-y-4">
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">Balanço Individual por Contratante</h3>
              <p className="text-xs text-muted-foreground">
                Acompanhe o valor aportado por cada cliente, valores pendentes e repasses vinculados
                aos seus eventos.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input
                  placeholder="Filtrar por cliente ou CNPJ..."
                  value={buscaCliente}
                  onChange={(e) => setBuscaCliente(e.target.value)}
                  className="pl-8 text-xs"
                />
              </div>
              <Link to="/financeiro">
                <Button size="sm" variant="outline" className="whitespace-nowrap">
                  <Plus className="mr-1.5 size-3.5" /> Nova Cobrança
                </Button>
              </Link>
            </div>
          </div>

          {clientesQuery.isPending ? (
            <LoadingBloco />
          ) : clientesQuery.isError ? (
            <ErrorState error={clientesQuery.error} onRetry={() => clientesQuery.refetch()} />
          ) : posicoesClientes.length === 0 ? (
            <EmptyState
              titulo="Nenhum cliente cadastrado ou encontrado"
              descricao="Cadastre clientes e emita cobranças de eventos para ver a posição de custódia."
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border bg-muted/30 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Cliente</th>
                    <th className="px-4 py-3 font-medium text-right">Colocado (Pago)</th>
                    <th className="px-4 py-3 font-medium text-right">Pendente a Entrar</th>
                    <th className="px-4 py-3 font-medium text-right">Repassado à Equipe</th>
                    <th className="px-4 py-3 font-medium text-right">Saldo em Custódia</th>
                    <th className="px-4 py-3 font-medium text-center">Ações</th>
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
                        <td className="px-4 py-3 text-center">
                          <Link to="/financeiro">
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs">
                              Cobrar Pix
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* ABA 2: Adicionar Saldo (Aporte Próprio da Agência) */}
        <TabsContent value="recarga" className="mt-4">
          <section className="rounded-lg border border-border bg-card p-5">
            <h3 className="text-sm font-semibold">Adicionar Saldo à Conta da Agência</h3>
            <p className="mb-4 text-xs text-muted-foreground">
              Aporte imediato via Pix para liberar repasses a freelancers e cobrir diárias da
              equipe.
            </p>

            <div className="mb-4 flex flex-wrap gap-2">
              {ATALHOS.map((v) => (
                <Button
                  key={v}
                  size="sm"
                  variant="outline"
                  type="button"
                  onClick={() => setValorRecarga(String(v))}
                  className="font-mono tabular-nums"
                >
                  {moeda(v)}
                </Button>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="valor">Valor do Aporte (R$)</Label>
                <Input
                  id="valor"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={valorRecarga}
                  onChange={(e) => setValorRecarga(e.target.value)}
                  className="font-mono tabular-nums"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label>Forma de Pagamento</Label>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["pix", "Pix (Imediato)"],
                      ["cartao", "Cartão de Crédito"],
                      ["boleto", "Boleto Bancário"],
                    ] as [Forma, string][]
                  ).map(([v, rotulo]) => (
                    <Button
                      key={v}
                      type="button"
                      size="sm"
                      variant={formaRecarga === v ? "default" : "outline"}
                      onClick={() => setFormaRecarga(v)}
                    >
                      {rotulo}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <Button
              className="mt-5"
              disabled={recarregar.isPending}
              onClick={() => recarregar.mutate()}
            >
              <Plus className="mr-1.5 size-4" />
              {recarregar.isPending ? "Gerando cobrança..." : "Gerar Pagamento de Recarga"}
            </Button>

            {/* Resultado com Pix QR Code e Copia-e-Cola */}
            {resultadoRecarga ? (
              <div className="mt-5 space-y-3 rounded-lg border border-border bg-background p-4">
                <p className="text-xs font-semibold text-foreground">
                  Recarga Gerada — Efetue o pagamento para disponibilização imediata:
                </p>
                {resultadoRecarga.pixImagem ? (
                  <img
                    src={`data:image/png;base64,${resultadoRecarga.pixImagem}`}
                    alt="QR Code Pix para recarga"
                    className="size-48 rounded-md border border-border"
                  />
                ) : null}
                {resultadoRecarga.pixCopiaCola ? (
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      value={resultadoRecarga.pixCopiaCola}
                      className="font-mono text-xs"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (resultadoRecarga.pixCopiaCola)
                          void copiar(resultadoRecarga.pixCopiaCola);
                      }}
                    >
                      <Copy className="size-4" /> Copiar Pix
                    </Button>
                  </div>
                ) : null}
                {resultadoRecarga.link ? (
                  <a
                    className="inline-block text-xs font-medium text-primary underline underline-offset-4"
                    href={resultadoRecarga.link}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Abrir fatura de pagamento no navegador
                  </a>
                ) : null}
              </div>
            ) : null}
          </section>
        </TabsContent>

        {/* ABA 3: Extrato em Conta */}
        <TabsContent value="extrato" className="mt-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              Movimentações de Caixa ({ROTULO_PERIODO[periodo]})
            </h3>
            <span className="text-xs text-muted-foreground">
              {movimentosFiltrados.length} registro(s) encontrados
            </span>
          </div>

          {movimentosQuery.isPending ? (
            <LoadingBloco />
          ) : movimentosQuery.isError ? (
            <ErrorState error={movimentosQuery.error} onRetry={() => movimentosQuery.refetch()} />
          ) : movimentosFiltrados.length === 0 ? (
            <EmptyState
              titulo="Nenhuma movimentação no período"
              descricao="Aportes confirmados e pagamentos executados aparecerão listados aqui."
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border bg-muted/30 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Data</th>
                    <th className="px-4 py-3 font-medium">Tipo</th>
                    <th className="px-4 py-3 font-medium">Descrição</th>
                    <th className="px-4 py-3 font-medium text-right">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {movimentosFiltrados.map((m) => {
                    const isCredito = m.tipo === "credito";
                    return (
                      <tr key={m.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 font-mono tabular-nums text-muted-foreground">
                          {dataHora(m.criado_em)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 font-medium ${
                              isCredito
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-foreground"
                            }`}
                          >
                            {isCredito ? (
                              <ArrowDownLeft className="size-3.5" />
                            ) : (
                              <ArrowUpRight className="size-3.5 text-muted-foreground" />
                            )}
                            {isCredito ? "Entrada" : "Saída"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-foreground font-medium">{m.descricao}</td>
                        <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums">
                          <span
                            className={
                              isCredito
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-foreground"
                            }
                          >
                            {isCredito ? "+" : "-"} {moeda(m.valor)}
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

        {/* ABA 4: Minhas Recargas */}
        <TabsContent value="historico-recargas" className="mt-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Histórico de Recargas da Agência</h3>
            <span className="text-xs text-muted-foreground">
              {recargasAgencia.length} cobrança(s) de recarga
            </span>
          </div>

          {cobrancasQuery.isPending ? (
            <LoadingBloco />
          ) : recargasAgencia.length === 0 ? (
            <EmptyState
              titulo="Nenhuma recarga efetuada ainda"
              descricao="Utilize a aba 'Adicionar Saldo' para gerar seu primeiro aporte."
            />
          ) : (
            <ul className="space-y-2">
              {recargasAgencia.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold tabular-nums">{moeda(c.valor)}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.forma === "pix" ? "Pix" : c.forma === "boleto" ? "Boleto" : "Cartão"} ·{" "}
                      {dataHora(c.criado_em)}
                    </p>
                    {c.erro ? <p className="text-xs text-destructive">{c.erro}</p> : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={c.status} />
                    {c.pix_copia_cola ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (c.pix_copia_cola) void copiar(c.pix_copia_cola);
                        }}
                      >
                        <Copy className="size-4" /> Copiar Pix
                      </Button>
                    ) : null}
                    {c.link_pagamento ? (
                      <a
                        className="text-xs underline underline-offset-4"
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
                        disabled={conferir.isPending}
                        onClick={() => conferir.mutate(c.id)}
                      >
                        <RefreshCw className="size-4" /> Verificar Status
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
