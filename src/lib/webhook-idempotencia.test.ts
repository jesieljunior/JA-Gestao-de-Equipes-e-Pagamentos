import { describe, expect, it } from "vitest";
import { gerarChaveWebhookAsaas, type EventoAsaasWebhook } from "./webhook-idempotencia.ts";

describe("Webhook Asaas: Idempotência e Segurança", () => {
  it("gera a mesma chave para eventos duplicados do Asaas", () => {
    const payloadA: EventoAsaasWebhook = {
      event: "PAYMENT_RECEIVED",
      payment: { id: "pay_123", externalReference: "cob_456", value: 1500 },
    };
    const payloadB: EventoAsaasWebhook = {
      event: "PAYMENT_RECEIVED",
      payment: { id: "pay_123", externalReference: "cob_456", value: 1500 },
    };
    expect(gerarChaveWebhookAsaas(payloadA)).toBe(gerarChaveWebhookAsaas(payloadB));
  });

  it("ignora pequenos detalhes de payload quando o evento é o mesmo", () => {
    const payloadA: EventoAsaasWebhook = {
      event: "TRANSFER_FAILED",
      transfer: {
        id: "tr_999",
        externalReference: "pay_001",
        failReason: "bank_rejected",
      },
    };
    const payloadB: EventoAsaasWebhook = {
      event: "TRANSFER_FAILED",
      transfer: {
        id: "tr_999",
        externalReference: "pay_001",
        failReason: "different_reason",
      },
    };
    expect(gerarChaveWebhookAsaas(payloadA)).toBe(gerarChaveWebhookAsaas(payloadB));
  });

  it("gera chaves distintas para pagamentos ou eventos diferentes", () => {
    const payloadA: EventoAsaasWebhook = {
      event: "PAYMENT_RECEIVED",
      payment: { id: "pay_123", value: 1500 },
    };
    const payloadB: EventoAsaasWebhook = {
      event: "PAYMENT_CONFIRMED",
      payment: { id: "pay_123", value: 1500 },
    };
    const payloadC: EventoAsaasWebhook = {
      event: "PAYMENT_RECEIVED",
      payment: { id: "pay_456", value: 1500 },
    };
    const chaveA = gerarChaveWebhookAsaas(payloadA);
    const chaveB = gerarChaveWebhookAsaas(payloadB);
    const chaveC = gerarChaveWebhookAsaas(payloadC);

    expect(chaveA).not.toBe(chaveB);
    expect(chaveA).not.toBe(chaveC);
  });

  it("simula idempotência impedindo duplo crédito em eventos repetidos", () => {
    const eventosProcessados = new Set<string>();
    let saldoAgencia = 0;
    let chamadasCredito = 0;

    function processarWebhookSimulado(payload: EventoAsaasWebhook): {
      status: number;
      mensagem: string;
      ignoradoDuplicado: boolean;
    } {
      const chave = gerarChaveWebhookAsaas(payload);
      if (eventosProcessados.has(chave)) {
        return { status: 200, mensagem: "ok", ignoradoDuplicado: true };
      }

      if (payload.event === "PAYMENT_RECEIVED" && payload.payment?.value) {
        saldoAgencia += payload.payment.value;
        chamadasCredito++;
      }

      eventosProcessados.add(chave);
      return { status: 200, mensagem: "ok", ignoradoDuplicado: false };
    }

    const payloadPix: EventoAsaasWebhook = {
      event: "PAYMENT_RECEIVED",
      payment: { id: "pay_abc_789", value: 2500 },
    };

    // Primeira entrega do webhook pelo Asaas
    const res1 = processarWebhookSimulado(payloadPix);
    expect(res1.status).toBe(200);
    expect(res1.ignoradoDuplicado).toBe(false);
    expect(saldoAgencia).toBe(2500);
    expect(chamadasCredito).toBe(1);

    // Segunda entrega do webhook (retentativa de rede / timeout)
    const res2 = processarWebhookSimulado(payloadPix);
    expect(res2.status).toBe(200);
    expect(res2.ignoradoDuplicado).toBe(true);
    // Saldo não foi creditado uma segunda vez
    expect(saldoAgencia).toBe(2500);
    expect(chamadasCredito).toBe(1);
  });

  it("rejeita webhooks com token ausente ou inválido", () => {
    const TOKEN_ESPERADO = "webhook_token_secreto_ja_2026";

    function autenticarWebhook(headerToken: string | null | undefined): boolean {
      if (!headerToken) return false;
      return headerToken === TOKEN_ESPERADO;
    }

    expect(autenticarWebhook(null)).toBe(false);
    expect(autenticarWebhook("")).toBe(false);
    expect(autenticarWebhook("token_errado")).toBe(false);
    expect(autenticarWebhook("webhook_token_secreto_ja_2026")).toBe(true);
  });

  it("trata eventos fora de ordem sem corromper status terminal", () => {
    type StatusCobranca = "pendente" | "vencido" | "pago";
    let statusAtual: StatusCobranca = "pago";

    function aplicarEvento(status: StatusCobranca, novoEvento: string): StatusCobranca {
      // Regra: uma vez pago, status não pode regredir para pendente ou vencido
      if (status === "pago") return "pago";
      if (novoEvento === "PAYMENT_OVERDUE") return "vencido";
      if (novoEvento === "PAYMENT_RECEIVED") return "pago";
      return status;
    }

    // Se receber PAYMENT_OVERDUE atrasado após já ter sido pago:
    statusAtual = aplicarEvento(statusAtual, "PAYMENT_OVERDUE");
    expect(statusAtual).toBe("pago");
  });
});
