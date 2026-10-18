/**
 * Módulo de Tesouraria, Balanço e Repasses Pix do PayCrew.
 * Modelo funcional para agências de casting, promotores e produtoras de eventos:
 * - Saldo Real Disponível em Conta
 * - Saldo Aportado / Colocado pelos Clientes
 * - Saldo Pendente de Entrar (Recebíveis Futuros)
 * - Saldo Repassado via Pix nos últimos 30, 60 e 90 dias
 * - Balanço e Custódia segregados por Cliente
 */

export type PeriodoDias = "30" | "60" | "90" | "todos";

export const ROTULO_PERIODO: Record<PeriodoDias, string> = {
  "30": "Últimos 30 dias",
  "60": "Últimos 60 dias",
  "90": "Últimos 90 dias",
  todos: "Todo o histórico",
};

export function calcularDataLimite(dias: PeriodoDias, referencia = new Date()): Date | null {
  if (dias === "todos") return null;
  const numDias = parseInt(dias, 10);
  const data = new Date(referencia.getTime());
  data.setDate(data.getDate() - numDias);
  data.setHours(0, 0, 0, 0);
  return data;
}

export function estaNoPeriodo(
  dataString: string | null | undefined,
  periodo: PeriodoDias,
  referencia = new Date(),
): boolean {
  if (periodo === "todos") return true;
  if (!dataString) return false;
  const limite = calcularDataLimite(periodo, referencia);
  if (!limite) return true;
  const data = new Date(dataString);
  return data.getTime() >= limite.getTime();
}

export interface CobrancaItem {
  id: string;
  cliente_id?: string | null;
  evento_id?: string | null;
  valor: number | string;
  status: string;
  tipo: string;
  forma?: string | null;
  criado_em: string;
  pago_em?: string | null;
  vencimento?: string | null;
  descricao?: string | null;
}

export interface PagamentoItem {
  id: string;
  valor: number | string;
  status: string;
  executado_em?: string | null;
  data_agendada?: string | null;
  criado_em: string;
  evento_id?: string | null;
  cliente_id?: string | null;
}

export interface MetricasTesouraria {
  saldoReal: number;
  saldoClientesColocadoTotal: number;
  saldoClientesColocadoPeriodo: number;
  saldoPendenteEntrar: number;
  saldoRepassado30Dias: number;
  saldoRepassado60Dias: number;
  saldoRepassado90Dias: number;
  saldoRepassadoPeriodo: number;
  qtdRepassesPeriodo: number;
  qtdCobrancasPagas: number;
  qtdCobrancasPendentes: number;
}

export function calcularMetricasTesouraria({
  saldoReal,
  cobrancas = [],
  pagamentos = [],
  periodo = "30",
  referencia = new Date(),
}: {
  saldoReal: number;
  cobrancas?: CobrancaItem[];
  pagamentos?: PagamentoItem[];
  periodo?: PeriodoDias;
  referencia?: Date;
}): MetricasTesouraria {
  // 1. Cobranças de clientes
  const cobrancasClientes = cobrancas.filter((c) => c.tipo === "cobranca_cliente");

  const cobrancasPagas = cobrancasClientes.filter((c) => c.status === "pago");
  const cobrancasPendentes = cobrancasClientes.filter(
    (c) => c.status === "aguardando_pagamento" || c.status === "rascunho",
  );

  const saldoClientesColocadoTotal = cobrancasPagas.reduce(
    (acc, c) => acc + Number(c.valor || 0),
    0,
  );

  const saldoClientesColocadoPeriodo = cobrancasPagas
    .filter((c) => estaNoPeriodo(c.pago_em || c.criado_em, periodo, referencia))
    .reduce((acc, c) => acc + Number(c.valor || 0), 0);

  const saldoPendenteEntrar = cobrancasPendentes.reduce((acc, c) => acc + Number(c.valor || 0), 0);

  // 2. Pagamentos Pix a freelancers/equipes executados
  const pagamentosExecutados = pagamentos.filter((p) => p.status === "executado");

  const calcularRepassesDias = (dias: "30" | "60" | "90") => {
    return pagamentosExecutados
      .filter((p) => estaNoPeriodo(p.executado_em || p.criado_em, dias, referencia))
      .reduce((acc, p) => acc + Number(p.valor || 0), 0);
  };

  const saldoRepassado30Dias = calcularRepassesDias("30");
  const saldoRepassado60Dias = calcularRepassesDias("60");
  const saldoRepassado90Dias = calcularRepassesDias("90");

  const pagamentosNoPeriodo = pagamentosExecutados.filter((p) =>
    estaNoPeriodo(p.executado_em || p.criado_em, periodo, referencia),
  );

  const saldoRepassadoPeriodo = pagamentosNoPeriodo.reduce(
    (acc, p) => acc + Number(p.valor || 0),
    0,
  );

  return {
    saldoReal: Math.round(saldoReal * 100) / 100,
    saldoClientesColocadoTotal: Math.round(saldoClientesColocadoTotal * 100) / 100,
    saldoClientesColocadoPeriodo: Math.round(saldoClientesColocadoPeriodo * 100) / 100,
    saldoPendenteEntrar: Math.round(saldoPendenteEntrar * 100) / 100,
    saldoRepassado30Dias: Math.round(saldoRepassado30Dias * 100) / 100,
    saldoRepassado60Dias: Math.round(saldoRepassado60Dias * 100) / 100,
    saldoRepassado90Dias: Math.round(saldoRepassado90Dias * 100) / 100,
    saldoRepassadoPeriodo: Math.round(saldoRepassadoPeriodo * 100) / 100,
    qtdRepassesPeriodo: pagamentosNoPeriodo.length,
    qtdCobrancasPagas: cobrancasPagas.length,
    qtdCobrancasPendentes: cobrancasPendentes.length,
  };
}

export interface ClienteItem {
  id: string;
  nome: string;
  cpf_cnpj?: string | null;
  email?: string | null;
  telefone?: string | null;
}

export interface PosicaoCliente {
  clienteId: string;
  nome: string;
  cpfCnpj: string | null;
  totalColocado: number;
  totalPendente: number;
  totalRepassado: number;
  saldoCustodia: number;
  totalEventos: number;
}

export function calcularPosicaoPorCliente({
  clientes = [],
  cobrancas = [],
  pagamentos = [],
  eventoClienteMap = new Map<string, string>(),
}: {
  clientes?: ClienteItem[];
  cobrancas?: CobrancaItem[];
  pagamentos?: PagamentoItem[];
  eventoClienteMap?: Map<string, string>; // eventoId -> clienteId
}): PosicaoCliente[] {
  return clientes.map((cli) => {
    const cobrancasDoCliente = cobrancas.filter(
      (c) => c.cliente_id === cli.id && c.tipo === "cobranca_cliente",
    );

    const totalColocado = cobrancasDoCliente
      .filter((c) => c.status === "pago")
      .reduce((sum, c) => sum + Number(c.valor || 0), 0);

    const totalPendente = cobrancasDoCliente
      .filter((c) => c.status === "aguardando_pagamento" || c.status === "rascunho")
      .reduce((sum, c) => sum + Number(c.valor || 0), 0);

    // Pagamentos executados cujos eventos pertencem a esse cliente
    const totalRepassado = pagamentos
      .filter((p) => {
        if (p.status !== "executado") return false;
        if (p.cliente_id === cli.id) return true;
        if (p.evento_id && eventoClienteMap.get(p.evento_id) === cli.id) return true;
        return false;
      })
      .reduce((sum, p) => sum + Number(p.valor || 0), 0);

    const saldoCustodia = totalColocado - totalRepassado;

    // Contagem de eventos únicos vinculados
    const eventosIds = new Set<string>();
    cobrancasDoCliente.forEach((c) => {
      if (c.evento_id) eventosIds.add(c.evento_id);
    });
    eventoClienteMap.forEach((cId, eId) => {
      if (cId === cli.id) eventosIds.add(eId);
    });

    return {
      clienteId: cli.id,
      nome: cli.nome,
      cpfCnpj: cli.cpf_cnpj ?? null,
      totalColocado: Math.round(totalColocado * 100) / 100,
      totalPendente: Math.round(totalPendente * 100) / 100,
      totalRepassado: Math.round(totalRepassado * 100) / 100,
      saldoCustodia: Math.round(saldoCustodia * 100) / 100,
      totalEventos: eventosIds.size,
    };
  });
}
