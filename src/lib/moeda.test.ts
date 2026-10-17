import assert from "node:assert/strict";
import { test } from "vitest";

import { parseMoedaBrasileira, parseValorPositivo } from "./moeda.ts";

test("converte valores brasileiros e numéricos", () => {
  assert.equal(parseMoedaBrasileira(3), 3);
  assert.equal(parseMoedaBrasileira("5"), 5);
  assert.equal(parseMoedaBrasileira("3,00"), 3);
  assert.equal(parseMoedaBrasileira("R$ 5,00"), 5);
  assert.equal(parseMoedaBrasileira("1.234,56"), 1234.56);
  assert.equal(parseMoedaBrasileira("1,234.56"), 1234.56);
});

test("rejeita valores inválidos e inferiores a um centavo", () => {
  assert.throws(() => parseMoedaBrasileira("R$ qualquer"), /valor válido/);
  assert.throws(() => parseValorPositivo("0,00"), /R\$ 0,01/);
});
