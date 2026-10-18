import { test } from "vitest";
import assert from "node:assert/strict";

import { gerarChaveWebhookAsaas } from "./webhook-idempotencia.ts";

test("gera a mesma chave para eventos duplicados do Asaas", () => {
  const payloadA = {
    event: "PAYMENT_RECEIVED",
    payment: { id: "pay_123", externalReference: "cob_456", value: 1500 },
  };

  const payloadB = {
    event: "PAYMENT_RECEIVED",
    payment: { id: "pay_123", externalReference: "cob_456", value: 1500 },
  };

  assert.equal(gerarChaveWebhookAsaas(payloadA), gerarChaveWebhookAsaas(payloadB));
});

test("ignora pequenos detalhes de payload quando o evento é o mesmo", () => {
  const payloadA = {
    event: "TRANSFER_FAILED",
    transfer: {
      id: "tr_999",
      externalReference: "pay_001",
      failReason: "bank_rejected",
    },
  };

  const payloadB = {
    event: "TRANSFER_FAILED",
    transfer: {
      id: "tr_999",
      externalReference: "pay_001",
      failReason: "different_reason",
    },
  };

  assert.equal(gerarChaveWebhookAsaas(payloadA), gerarChaveWebhookAsaas(payloadB));
});
