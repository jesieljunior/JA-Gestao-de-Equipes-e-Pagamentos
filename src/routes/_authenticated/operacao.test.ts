import { describe, expect, it } from "vitest";

interface EscalaItem {
  id: string;
  status: "confirmado" | "pendente" | "substituido" | "recusado";
  pontos: Array<{
    id: string;
    status: "aprovado" | "pendente" | "rejeitado";
    tipo: "entrada" | "inicio_intervalo" | "fim_intervalo" | "saida";
  }>;
}

function calcularMetricasOperacao(escalas: EscalaItem[]) {
  const ativas = escalas.filter((e) => e.status !== "substituido" && e.status !== "recusado");
  const totalEscalados = ativas.length;

  const presentes = ativas.filter((e) =>
    e.pontos.some((p) => p.status === "aprovado" || p.status === "pendente"),
  ).length;

  const pontosPendentes = ativas.reduce(
    (acc, e) => acc + e.pontos.filter((p) => p.status === "pendente").length,
    0,
  );

  return { totalEscalados, presentes, pontosPendentes };
}

function filtrarEscalas(
  escalas: EscalaItem[],
  filtro: "todos" | "pendentes" | "presentes" | "sem_ponto",
) {
  const ativas = escalas.filter((e) => e.status !== "substituido" && e.status !== "recusado");

  return ativas.filter((es) => {
    if (filtro === "pendentes") {
      return es.pontos.some((p) => p.status === "pendente");
    }
    if (filtro === "presentes") {
      return es.pontos.some((p) => p.status === "aprovado" || p.status === "pendente");
    }
    if (filtro === "sem_ponto") {
      return es.pontos.length === 0;
    }
    return true;
  });
}

function validarDecisaoPonto(
  decisao: "aprovado" | "rejeitado",
  motivo?: string | null,
): { valido: boolean; erro?: string } {
  if (decisao === "rejeitado" && (!motivo || motivo.trim().length < 3)) {
    return { valido: false, erro: "Justificativa obrigatória para rejeição de ponto." };
  }
  return { valido: true };
}

describe("Rotas de Operação: /operacao e /operacao.$eventoId", () => {
  const mockEscalas: EscalaItem[] = [
    {
      id: "escala-1",
      status: "confirmado",
      pontos: [
        { id: "p1", status: "aprovado", tipo: "entrada" },
        { id: "p2", status: "pendente", tipo: "saida" },
      ],
    },
    {
      id: "escala-2",
      status: "confirmado",
      pontos: [],
    },
    {
      id: "escala-3",
      status: "substituido",
      pontos: [],
    },
    {
      id: "escala-4",
      status: "confirmado",
      pontos: [{ id: "p3", status: "aprovado", tipo: "entrada" }],
    },
  ];

  it("calcula metricas operacionais corretamente ignorando substituidos", () => {
    const { totalEscalados, presentes, pontosPendentes } = calcularMetricasOperacao(mockEscalas);

    expect(totalEscalados).toBe(3); // escala-1, escala-2, escala-4 (escala-3 substituida)
    expect(presentes).toBe(2); // escala-1 e escala-4
    expect(pontosPendentes).toBe(1); // p2
  });

  it("filtra colaboradores por abas operacionais", () => {
    const todos = filtrarEscalas(mockEscalas, "todos");
    expect(todos.length).toBe(3);

    const pendentes = filtrarEscalas(mockEscalas, "pendentes");
    expect(pendentes.length).toBe(1);
    expect(pendentes[0]?.id).toBe("escala-1");

    const presentes = filtrarEscalas(mockEscalas, "presentes");
    expect(presentes.length).toBe(2);

    const semPonto = filtrarEscalas(mockEscalas, "sem_ponto");
    expect(semPonto.length).toBe(1);
    expect(semPonto[0]?.id).toBe("escala-2");
  });

  it("exige motivo ao rejeitar ponto do colaborador", () => {
    expect(validarDecisaoPonto("aprovado")).toEqual({ valido: true });
    expect(validarDecisaoPonto("rejeitado", null).valido).toBe(false);
    expect(validarDecisaoPonto("rejeitado", "").valido).toBe(false);
    expect(validarDecisaoPonto("rejeitado", "Horário incompatível com o evento").valido).toBe(true);
  });
});
