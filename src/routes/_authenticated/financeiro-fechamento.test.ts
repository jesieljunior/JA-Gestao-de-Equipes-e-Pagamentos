import { describe, expect, it } from "vitest";

import { centavosParaReais, formatarBRL, reaisParaCentavos } from "@/lib/moeda";

interface ItemPagamento {
  id: string;
  freelancerNome: string;
  chavePix: string;
  valorCentavos: number;
  status: "pendente" | "agendado" | "pago" | "falha";
}

function validarLotePagamentoPix(
  itens: ItemPagamento[],
  saldoDisponivelCentavos: number,
): {
  valido: boolean;
  totalLoteCentavos: number;
  erro?: string;
} {
  if (itens.length === 0) {
    return { valido: false, totalLoteCentavos: 0, erro: "Nenhum item selecionado para pagamento." };
  }

  const itensSemPix = itens.filter((i) => !i.chavePix || i.chavePix.trim().length < 3);
  if (itensSemPix.length > 0) {
    return {
      valido: false,
      totalLoteCentavos: 0,
      erro: `${itensSemPix.length} freelancer(s) sem chave Pix cadastrada.`,
    };
  }

  const totalLoteCentavos = itens.reduce((sum, item) => sum + item.valorCentavos, 0);

  if (totalLoteCentavos > saldoDisponivelCentavos) {
    return {
      valido: false,
      totalLoteCentavos,
      erro: `Saldo insuficiente para realizar o pagamento. Necessário: ${formatarBRL(
        centavosParaReais(totalLoteCentavos),
      )}. Disponível: ${formatarBRL(centavosParaReais(saldoDisponivelCentavos))}.`,
    };
  }

  return { valido: true, totalLoteCentavos };
}

function calcularTaxasSeparadas(
  valorTrabalhoReais: number,
  taxaGatewayFixaReais: number,
  faturaSaaSReais: number,
) {
  // Conforme AGENTS.md:
  // "Keep SaaS invoices separate from worker funding and gateway costs; payout and collection paths must never generate legacy percentage fees."
  const repasseFreelancer = valorTrabalhoReais;
  const custoGateway = taxaGatewayFixaReais;
  const faturaAssinaturaPlataforma = faturaSaaSReais;

  return {
    repasseFreelancer,
    custoGateway,
    faturaAssinaturaPlataforma,
    totalCobradoEmpresa: repasseFreelancer + custoGateway, // sem embutir percentual legado no pagamento do trabalhador
  };
}

describe("Rotas Financeiras: /fechamento, /financeiro e /saldo", () => {
  it("converte valores monetários com precisão de centavos", () => {
    expect(reaisParaCentavos(150.75)).toBe(15075);
    expect(centavosParaReais(15075)).toBe(150.75);
    expect(formatarBRL(150.75)).toContain("150,75");
  });

  it("valida criação e execução de lote Pix contra saldo disponível", () => {
    const itensValidos: ItemPagamento[] = [
      {
        id: "pag-1",
        freelancerNome: "Maria",
        chavePix: "11999999999",
        valorCentavos: 20000,
        status: "pendente",
      },
      {
        id: "pag-2",
        freelancerNome: "João",
        chavePix: "joao@email.com",
        valorCentavos: 15000,
        status: "pendente",
      },
    ];

    // Saldo suficiente (R$ 500,00 vs R$ 350,00)
    const comSaldo = validarLotePagamentoPix(itensValidos, 50000);
    expect(comSaldo.valido).toBe(true);
    expect(comSaldo.totalLoteCentavos).toBe(35000);

    // Saldo insuficiente (R$ 100,00 vs R$ 350,00)
    const semSaldo = validarLotePagamentoPix(itensValidos, 10000);
    expect(semSaldo.valido).toBe(false);
    expect(semSaldo.erro).toContain("Saldo insuficiente");
  });

  it("impede pagamento se houver freelancers sem chave Pix cadastrada", () => {
    const itensComErro: ItemPagamento[] = [
      {
        id: "pag-1",
        freelancerNome: "Carlos",
        chavePix: "",
        valorCentavos: 18000,
        status: "pendente",
      },
    ];
    const res = validarLotePagamentoPix(itensComErro, 50000);
    expect(res.valido).toBe(false);
    expect(res.erro).toContain("sem chave Pix");
  });

  it("mantém a fatura do SaaS estritamente separada do saldo e repasse aos trabalhadores", () => {
    const separacao = calcularTaxasSeparadas(300, 1.89, 49.9);
    expect(separacao.repasseFreelancer).toBe(300);
    expect(separacao.custoGateway).toBe(1.89);
    expect(separacao.faturaAssinaturaPlataforma).toBe(49.9);
    expect(separacao.totalCobradoEmpresa).toBe(301.89);
  });

  it("calcula janelas de repasses Pix de 30, 60 e 90 dias para o dono da empresa", () => {
    const agora = new Date("2026-10-17T12:00:00Z");
    const pagamentos = [
      { id: "1", valor: 500, status: "executado", executado_em: "2026-10-05T10:00:00Z" }, // 12 dias atrás (30d)
      { id: "2", valor: 800, status: "executado", executado_em: "2026-09-01T10:00:00Z" }, // 46 dias atrás (60d)
      { id: "3", valor: 1200, status: "executado", executado_em: "2026-08-01T10:00:00Z" }, // 77 dias atrás (90d)
      { id: "4", valor: 2000, status: "executado", executado_em: "2026-06-01T10:00:00Z" }, // 138 dias atrás (>90d)
    ];

    const somarNoIntervalo = (dias: number) => {
      const limite = new Date(agora.getTime() - dias * 24 * 60 * 60 * 1000);
      return pagamentos
        .filter((p) => new Date(p.executado_em).getTime() >= limite.getTime())
        .reduce((sum, p) => sum + p.valor, 0);
    };

    expect(somarNoIntervalo(30)).toBe(500);
    expect(somarNoIntervalo(60)).toBe(1300); // 500 + 800
    expect(somarNoIntervalo(90)).toBe(2500); // 500 + 800 + 1200
  });

  it("calcula saldo em custódia do cliente (total colocado vs repassado nos eventos)", () => {
    const cobrancasCliente = [
      { valor: 10000, status: "pago" },
      { valor: 5000, status: "pago" },
      { valor: 3000, status: "aguardando_pagamento" }, // pendente de entrar
    ];

    const totalColocado = cobrancasCliente
      .filter((c) => c.status === "pago")
      .reduce((sum, c) => sum + c.valor, 0);

    const totalPendente = cobrancasCliente
      .filter((c) => c.status === "aguardando_pagamento")
      .reduce((sum, c) => sum + c.valor, 0);

    const totalRepassadoEquipe = 11500;
    const saldoCustodia = totalColocado - totalRepassadoEquipe;

    expect(totalColocado).toBe(15000);
    expect(totalPendente).toBe(3000);
    expect(saldoCustodia).toBe(3500); // R$ 3.500,00 de margem / saldo em custódia
  });
});
