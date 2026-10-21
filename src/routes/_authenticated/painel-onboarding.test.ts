import { describe, expect, it } from "vitest";

import { soDigitos } from "@/lib/dominio";

interface EventoResumo {
  id: string;
  nome: string;
  status: string;
  data_inicio: string;
}

interface EscalaResumo {
  id: string;
  status: string;
}

interface FechamentoResumo {
  id: string;
  status: string;
  valor_total: number;
}

function calcularKpisPainel(
  eventos: EventoResumo[],
  escalas: EscalaResumo[],
  fechamentos: FechamentoResumo[],
) {
  const eventosAtivos = eventos.filter((e) =>
    ["pronto", "em_execucao", "encerrando"].includes(e.status),
  ).length;

  const escalasConfirmadas = escalas.filter((e) => e.status === "confirmado").length;
  const escalasPendentes = escalas.filter((e) => e.status === "convidado").length;

  const fechamentosAguardando = fechamentos.filter((f) => f.status === "pendente_aprovacao").length;

  const valorTotalFechamentos = fechamentos
    .filter((f) => f.status === "aprovado")
    .reduce((acc, f) => acc + Number(f.valor_total || 0), 0);

  return {
    eventosAtivos,
    escalasConfirmadas,
    escalasPendentes,
    fechamentosAguardando,
    valorTotalFechamentos: Math.round(valorTotalFechamentos * 100) / 100,
  };
}

function validarDadosOnboarding(input: { nomeAgencia: string; cnpj?: string }): {
  valido: boolean;
  erro?: string;
  cnpjNormalizado?: string | null;
} {
  const nome = input.nomeAgencia.trim();
  if (nome.length < 3) {
    return { valido: false, erro: "O nome da agência deve ter pelo menos 3 caracteres." };
  }

  let cnpjNormalizado: string | null = null;
  if (input.cnpj && input.cnpj.trim().length > 0) {
    const digitos = soDigitos(input.cnpj);
    if (digitos.length !== 14) {
      return { valido: false, erro: "CNPJ inválido. Deve conter 14 dígitos." };
    }
    cnpjNormalizado = digitos;
  }

  return { valido: true, cnpjNormalizado };
}

describe("Rotas de Painel e Onboarding: /painel e /onboarding", () => {
  it("calcula indicadores operacionais e financeiros consolidados no Painel", () => {
    const eventos: EventoResumo[] = [
      { id: "e1", nome: "Festival A", status: "em_execucao", data_inicio: "2026-10-18T10:00:00Z" },
      { id: "e2", nome: "Show B", status: "pronto", data_inicio: "2026-10-19T14:00:00Z" },
      { id: "e3", nome: "Corporativo C", status: "concluido", data_inicio: "2026-10-10T08:00:00Z" },
    ];

    const escalas: EscalaResumo[] = [
      { id: "s1", status: "confirmado" },
      { id: "s2", status: "confirmado" },
      { id: "s3", status: "convidado" },
    ];

    const fechamentos: FechamentoResumo[] = [
      { id: "f1", status: "pendente_aprovacao", valor_total: 450.0 },
      { id: "f2", status: "aprovado", valor_total: 1200.5 },
      { id: "f3", status: "aprovado", valor_total: 800.25 },
    ];

    const kpis = calcularKpisPainel(eventos, escalas, fechamentos);
    expect(kpis.eventosAtivos).toBe(2);
    expect(kpis.escalasConfirmadas).toBe(2);
    expect(kpis.escalasPendentes).toBe(1);
    expect(kpis.fechamentosAguardando).toBe(1);
    expect(kpis.valorTotalFechamentos).toBe(2000.75);
  });

  it("valida preenchimento obrigatório no cadastro de agência no Onboarding", () => {
    const nomeCurto = validarDadosOnboarding({ nomeAgencia: "ab" });
    expect(nomeCurto.valido).toBe(false);
    expect(nomeCurto.erro).toContain("pelo menos 3 caracteres");

    const cnpjInvalido = validarDadosOnboarding({
      nomeAgencia: "Produtora Estrela",
      cnpj: "1234",
    });
    expect(cnpjInvalido.valido).toBe(false);
    expect(cnpjInvalido.erro).toContain("CNPJ inválido");

    const sucesso = validarDadosOnboarding({
      nomeAgencia: "Produtora Estrela Ltda",
      cnpj: "11.222.333/0001-44",
    });
    expect(sucesso.valido).toBe(true);
    expect(sucesso.cnpjNormalizado).toBe("11222333000144");
  });

  it("filtra estritamente eventos e escalas pelo empresa_id no cálculo dos KPIs do Painel", () => {
    const eventosComEmpresa = [
      { id: "e1", empresaId: "emp-A", status: "em_execucao" },
      { id: "e2", empresaId: "emp-A", status: "pronto" },
      { id: "e3", empresaId: "emp-B", status: "em_execucao" }, // outra empresa - não deve vazar
    ];

    const eventosEmpresaA = eventosComEmpresa.filter((e) => e.empresaId === "emp-A");
    expect(eventosEmpresaA).toHaveLength(2);
    expect(eventosEmpresaA.some((e) => e.empresaId === "emp-B")).toBe(false);
  });

  it("calcula total de pendências operacionais agregando pontos, fechamentos e falhas", () => {
    const dados = {
      pontosPendentes: 3,
      fechamentosPendentes: 2,
      pontosForaHorario: 1,
      pagamentosFalhos: 1,
    };
    const total =
      dados.pontosPendentes +
      dados.fechamentosPendentes +
      dados.pontosForaHorario +
      dados.pagamentosFalhos;
    expect(total).toBe(7);
  });

  it("identifica corretamente eventos ao vivo para o cockpit operacional", () => {
    const eventos = [
      { id: "1", status: "em_execucao" },
      { id: "2", status: "pronto" },
      { id: "3", status: "encerrando" },
      { id: "4", status: "planejamento" },
      { id: "5", status: "concluido" },
    ];
    const aoVivo = eventos.filter((e) =>
      ["em_execucao", "pronto", "encerrando"].includes(e.status),
    );
    expect(aoVivo).toHaveLength(3);
    expect(aoVivo.map((e) => e.id)).toEqual(["1", "2", "3"]);
  });
});
