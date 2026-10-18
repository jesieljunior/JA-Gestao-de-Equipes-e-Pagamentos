import { test } from "vitest";
import assert from "node:assert/strict";

import { calcularFolhaClt } from "./dominio.ts";

test("calcula desconto proporcional de falta CLT", () => {
  assert.deepEqual(calcularFolhaClt({ salarioBase: 3000, faltasNaoJustificadas: 1 }), {
    descontoCalculado: 100,
    valorFinal: 2900,
  });
});

test("abono mantém o salário integral e preserva o cálculo sugerido", () => {
  assert.deepEqual(
    calcularFolhaClt({ salarioBase: 3000, faltasNaoJustificadas: 1, descontoAbonado: true }),
    { descontoCalculado: 100, valorFinal: 3000 },
  );
});
