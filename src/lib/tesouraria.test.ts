import { describe, expect, it } from "vitest";

import {
  calcularDataLimite,
  calcularMetricasTesouraria,
  calcularPosicaoPorCliente,
  estaNoPeriodo,
} from "./tesouraria";

describe("lib/tesouraria: Métricas Financeiras e Balanço por Cliente", () => {
  const agora = new Date("2026-10-17T12:00:00Z");

  const dezDiasAtras = new Date("2026-10-07T12:00:00Z").toISOString();
  const quarentaDiasAtras = new Date("2026-09-07T12:00:00Z").toISOString();
  const setentaDiasAtras = new Date("2026-08-08T12:00:00Z").toISOString();
  const centoEVinteDiasAtras = new Date("2026-06-19T12:00:00Z").toISOString();

  it("filtra datas corretamente pelos períodos de 30, 60, 90 dias e todos", () => {
    expect(estaNoPeriodo(dezDiasAtras, "30", agora)).toBe(true);
    expect(estaNoPeriodo(quarentaDiasAtras, "30", agora)).toBe(false);

    expect(estaNoPeriodo(quarentaDiasAtras, "60", agora)).toBe(true);
    expect(estaNoPeriodo(setentaDiasAtras, "60", agora)).toBe(false);

    expect(estaNoPeriodo(setentaDiasAtras, "90", agora)).toBe(true);
    expect(estaNoPeriodo(centoEVinteDiasAtras, "90", agora)).toBe(false);

    expect(estaNoPeriodo(centoEVinteDiasAtras, "todos", agora)).toBe(true);
    expect(calcularDataLimite("todos", agora)).toBeNull();
  });

  it("calcula metricas de tesouraria do dono da empresa com precisao", () => {
    const cobrancas = [
      {
        id: "c1",
        tipo: "cobranca_cliente",
        valor: 15000,
        status: "pago",
        pago_em: dezDiasAtras,
        criado_em: dezDiasAtras,
      },
      {
        id: "c2",
        tipo: "cobranca_cliente",
        valor: 8000,
        status: "pago",
        pago_em: quarentaDiasAtras,
        criado_em: quarentaDiasAtras,
      },
      {
        id: "c3",
        tipo: "cobranca_cliente",
        valor: 5000,
        status: "aguardando_pagamento",
        criado_em: dezDiasAtras,
      },
      {
        id: "c4",
        tipo: "aporte_agencia",
        valor: 10000,
        status: "pago",
        criado_em: dezDiasAtras,
      },
    ];

    const pagamentos = [
      {
        id: "p1",
        valor: 3000,
        status: "executado",
        executado_em: dezDiasAtras,
        criado_em: dezDiasAtras,
      },
      {
        id: "p2",
        valor: 4500,
        status: "executado",
        executado_em: quarentaDiasAtras,
        criado_em: quarentaDiasAtras,
      },
      {
        id: "p3",
        valor: 2000,
        status: "executado",
        executado_em: setentaDiasAtras,
        criado_em: setentaDiasAtras,
      },
      {
        id: "p4",
        valor: 1500,
        status: "executado",
        executado_em: centoEVinteDiasAtras,
        criado_em: centoEVinteDiasAtras,
      },
      { id: "p5", valor: 7000, status: "pendente", criado_em: dezDiasAtras },
    ];

    const metricas30 = calcularMetricasTesouraria({
      saldoReal: 22000,
      cobrancas,
      pagamentos,
      periodo: "30",
      referencia: agora,
    });

    expect(metricas30.saldoReal).toBe(22000);
    expect(metricas30.saldoClientesColocadoTotal).toBe(23000); // 15000 + 8000
    expect(metricas30.saldoClientesColocadoPeriodo).toBe(15000); // 15000 em 30d
    expect(metricas30.saldoPendenteEntrar).toBe(5000); // c3
    expect(metricas30.saldoRepassado30Dias).toBe(3000); // p1
    expect(metricas30.saldoRepassado60Dias).toBe(7500); // p1 + p2 (3000 + 4500)
    expect(metricas30.saldoRepassado90Dias).toBe(9500); // p1 + p2 + p3 (3000 + 4500 + 2000)
    expect(metricas30.saldoRepassadoPeriodo).toBe(3000); // selecionado 30d
    expect(metricas30.qtdRepassesPeriodo).toBe(1);

    const metricas60 = calcularMetricasTesouraria({
      saldoReal: 22000,
      cobrancas,
      pagamentos,
      periodo: "60",
      referencia: agora,
    });
    expect(metricas60.saldoRepassadoPeriodo).toBe(7500);
    expect(metricas60.qtdRepassesPeriodo).toBe(2);
  });

  it("calcula segregacao de saldos e custodia por cliente", () => {
    const clientes = [
      { id: "cli-1", nome: "Coca-Cola Promoções", cpf_cnpj: "12345678000190" },
      { id: "cli-2", nome: "Heineken Festival", cpf_cnpj: "98765432000110" },
    ];

    const cobrancas = [
      {
        id: "c1",
        cliente_id: "cli-1",
        tipo: "cobranca_cliente",
        valor: 20000,
        status: "pago",
        criado_em: dezDiasAtras,
      },
      {
        id: "c2",
        cliente_id: "cli-1",
        tipo: "cobranca_cliente",
        valor: 5000,
        status: "aguardando_pagamento",
        criado_em: dezDiasAtras,
      },
      {
        id: "c3",
        cliente_id: "cli-2",
        tipo: "cobranca_cliente",
        valor: 12000,
        status: "pago",
        criado_em: dezDiasAtras,
      },
    ];

    const eventoClienteMap = new Map<string, string>([
      ["ev-1", "cli-1"],
      ["ev-2", "cli-2"],
    ]);

    const pagamentos = [
      { id: "p1", valor: 14000, status: "executado", evento_id: "ev-1", criado_em: dezDiasAtras },
      { id: "p2", valor: 15000, status: "executado", evento_id: "ev-2", criado_em: dezDiasAtras },
    ];

    const posicoes = calcularPosicaoPorCliente({
      clientes,
      cobrancas,
      pagamentos,
      eventoClienteMap,
    });

    const cli1 = posicoes.find((p) => p.clienteId === "cli-1");
    expect(cli1).toBeDefined();
    expect(cli1?.totalColocado).toBe(20000);
    expect(cli1?.totalPendente).toBe(5000);
    expect(cli1?.totalRepassado).toBe(14000);
    expect(cli1?.saldoCustodia).toBe(6000); // 20000 - 14000

    const cli2 = posicoes.find((p) => p.clienteId === "cli-2");
    expect(cli2).toBeDefined();
    expect(cli2?.totalColocado).toBe(12000);
    expect(cli2?.totalPendente).toBe(0);
    expect(cli2?.totalRepassado).toBe(15000);
    expect(cli2?.saldoCustodia).toBe(-3000); // 12000 - 15000 (repasses superaram aportes)
  });
});
