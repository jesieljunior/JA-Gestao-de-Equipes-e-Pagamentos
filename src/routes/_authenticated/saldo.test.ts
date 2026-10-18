import { describe, expect, it } from "vitest";

import {
  calcularMetricasTesouraria,
  calcularPosicaoPorCliente,
  estaNoPeriodo,
  type PeriodoDias,
  ROTULO_PERIODO,
} from "@/lib/tesouraria";
import { formatarBRL } from "@/lib/moeda";

describe("Rota de Tesouraria & Saldo: /_authenticated/saldo", () => {
  const agora = new Date("2026-10-18T12:00:00Z");
  const d15 = new Date("2026-10-03T12:00:00Z").toISOString();
  const d45 = new Date("2026-09-03T12:00:00Z").toISOString();
  const d75 = new Date("2026-08-04T12:00:00Z").toISOString();
  const d100 = new Date("2026-07-10T12:00:00Z").toISOString();

  it("calcula corretamente os 4 pilares financeiros do dono da empresa", () => {
    const cobrancas = [
      // Cliente A pagou R$ 12.000 há 15 dias
      {
        id: "c-1",
        cliente_id: "cli-a",
        tipo: "cobranca_cliente",
        valor: 12000,
        status: "pago",
        pago_em: d15,
        criado_em: d15,
      },
      // Cliente B pagou R$ 8.000 há 45 dias
      {
        id: "c-2",
        cliente_id: "cli-b",
        tipo: "cobranca_cliente",
        valor: 8000,
        status: "pago",
        pago_em: d45,
        criado_em: d45,
      },
      // Cliente A tem cobrança pendente de R$ 4.500
      {
        id: "c-3",
        cliente_id: "cli-a",
        tipo: "cobranca_cliente",
        valor: 4500,
        status: "aguardando_pagamento",
        criado_em: d15,
      },
      // Aporte próprio da agência de R$ 5.000 (não entra no saldo de clientes)
      {
        id: "c-4",
        tipo: "aporte_agencia",
        valor: 5000,
        status: "pago",
        pago_em: d15,
        criado_em: d15,
      },
    ];

    const pagamentos = [
      // Repasse Pix executado há 15 dias: R$ 3.000
      {
        id: "p-1",
        valor: 3000,
        status: "executado",
        executado_em: d15,
        criado_em: d15,
        cliente_id: "cli-a",
      },
      // Repasse Pix executado há 45 dias: R$ 2.500
      {
        id: "p-2",
        valor: 2500,
        status: "executado",
        executado_em: d45,
        criado_em: d45,
        cliente_id: "cli-b",
      },
      // Repasse Pix executado há 75 dias: R$ 1.800
      {
        id: "p-3",
        valor: 1800,
        status: "executado",
        executado_em: d75,
        criado_em: d75,
        cliente_id: "cli-a",
      },
      // Repasse Pix executado há 100 dias: R$ 1.000 (fora dos 90 dias)
      {
        id: "p-4",
        valor: 1000,
        status: "executado",
        executado_em: d100,
        criado_em: d100,
        cliente_id: "cli-b",
      },
      // Pagamento ainda pendente de R$ 6.000
      {
        id: "p-5",
        valor: 6000,
        status: "pendente",
        criado_em: d15,
        cliente_id: "cli-a",
      },
    ];

    const metricas = calcularMetricasTesouraria({
      saldoReal: 19700,
      cobrancas,
      pagamentos,
      periodo: "30",
      referencia: agora,
    });

    // 1. Saldo Real em Conta
    expect(metricas.saldoReal).toBe(19700);

    // 2. Saldo colocado pelos clientes
    expect(metricas.saldoClientesColocadoTotal).toBe(20000); // 12000 + 8000
    expect(metricas.saldoClientesColocadoPeriodo).toBe(12000); // 12000 em 30d

    // 3. Saldo pendente de entrar (recebíveis)
    expect(metricas.saldoPendenteEntrar).toBe(4500);
    expect(metricas.qtdCobrancasPendentes).toBe(1);

    // 4. Saldo repassado via Pix nos últimos 30, 60 e 90 dias
    expect(metricas.saldoRepassado30Dias).toBe(3000); // p-1
    expect(metricas.saldoRepassado60Dias).toBe(5500); // p-1 + p-2 (3000 + 2500)
    expect(metricas.saldoRepassado90Dias).toBe(7300); // p-1 + p-2 + p-3 (3000 + 2500 + 1800)
    expect(metricas.saldoRepassadoPeriodo).toBe(3000); // período 30d selecionado
    expect(metricas.qtdRepassesPeriodo).toBe(1);

    // Verifica rótulos de período
    expect(ROTULO_PERIODO["30"]).toBe("Últimos 30 dias");
    expect(ROTULO_PERIODO["60"]).toBe("Últimos 60 dias");
    expect(ROTULO_PERIODO["90"]).toBe("Últimos 90 dias");
  });

  it("calcula a posição individual e custódia por cliente", () => {
    const clientes = [
      { id: "cli-a", nome: "Agência Alpha Eventos", cpf_cnpj: "11222333000144" },
      { id: "cli-b", nome: "Beta Festivais", cpf_cnpj: "55666777000188" },
    ];

    const cobrancas = [
      {
        id: "c-1",
        cliente_id: "cli-a",
        tipo: "cobranca_cliente",
        valor: 15000,
        status: "pago",
        criado_em: d15,
      },
      {
        id: "c-2",
        cliente_id: "cli-a",
        tipo: "cobranca_cliente",
        valor: 5000,
        status: "aguardando_pagamento",
        criado_em: d15,
      },
      {
        id: "c-3",
        cliente_id: "cli-b",
        tipo: "cobranca_cliente",
        valor: 10000,
        status: "pago",
        criado_em: d45,
      },
    ];

    const pagamentos = [
      {
        id: "p-1",
        valor: 4000,
        status: "executado",
        cliente_id: "cli-a",
        criado_em: d15,
      },
      {
        id: "p-2",
        valor: 12000,
        status: "executado",
        cliente_id: "cli-b",
        criado_em: d45,
      },
    ];

    const posicoes = calcularPosicaoPorCliente({
      clientes,
      cobrancas,
      pagamentos,
    });

    const posA = posicoes.find((p) => p.clienteId === "cli-a")!;
    expect(posA.nome).toBe("Agência Alpha Eventos");
    expect(posA.totalColocado).toBe(15000);
    expect(posA.totalPendente).toBe(5000);
    expect(posA.totalRepassado).toBe(4000);
    expect(posA.saldoCustodia).toBe(11000); // 15000 - 4000 (positivo)

    const posB = posicoes.find((p) => p.clienteId === "cli-b")!;
    expect(posB.totalColocado).toBe(10000);
    expect(posB.totalRepassado).toBe(12000);
    expect(posB.saldoCustodia).toBe(-2000); // 10000 - 12000 (deficitário, requer cobrança Pix)
  });

  it("filtra transações por período de 30, 60 e 90 dias com precisão", () => {
    expect(estaNoPeriodo(d15, "30", agora)).toBe(true);
    expect(estaNoPeriodo(d45, "30", agora)).toBe(false);
    expect(estaNoPeriodo(d45, "60", agora)).toBe(true);
    expect(estaNoPeriodo(d75, "60", agora)).toBe(false);
    expect(estaNoPeriodo(d75, "90", agora)).toBe(true);
    expect(estaNoPeriodo(d100, "90", agora)).toBe(false);
    expect(estaNoPeriodo(d100, "todos", agora)).toBe(true);
  });
});
