import assert from "node:assert/strict";
import { test } from "vitest";

import { calcularFechamento } from "./dominio.ts";

const ponto = (tipo: "entrada" | "saida", status: "aprovado" | "pendente", hora: string) =>
  ({ tipo, status, registrado_em: hora }) as never;

test("diária preserva o valor combinado sem pontos e sinaliza revisão", () => {
  assert.deepEqual(calcularFechamento({ tipo_valor: "diaria", valor_combinado: 5 }, []), {
    horas: 0,
    valor: 5,
    requerRevisao: true,
    motivoRevisao: "Sem entrada e saída aprovadas.",
  });
});

test("diária preserva R$ 3,00 com ponto pendente", () => {
  const resultado = calcularFechamento({ tipo_valor: "diaria", valor_combinado: 3 }, [
    ponto("entrada", "pendente", "2026-09-24T10:00:00Z"),
  ]);
  assert.equal(resultado.valor, 3);
  assert.equal(resultado.requerRevisao, true);
});

test("hora continua zerada sem saída aprovada", () => {
  const resultado = calcularFechamento({ tipo_valor: "hora", valor_combinado: 10 }, [
    ponto("entrada", "aprovado", "2026-09-24T10:00:00Z"),
  ]);
  assert.equal(resultado.valor, 0);
  assert.equal(resultado.requerRevisao, true);
});

test("calcula diária e horas quando os pontos estão completos", () => {
  const resultado = calcularFechamento({ tipo_valor: "diaria", valor_combinado: 5 }, [
    ponto("entrada", "aprovado", "2026-09-24T10:00:00Z"),
    ponto("saida", "aprovado", "2026-09-24T18:00:00Z"),
  ]);
  assert.deepEqual(resultado, { horas: 8, valor: 5, requerRevisao: false, motivoRevisao: null });
});
