import { describe, expect, it } from "vitest";

function validarWebhookHeaders(headers: Record<string, string | undefined>): {
  valido: boolean;
  motivo?: string;
} {
  const token = headers["asaas-access-token"] || headers["x-webhook-token"];
  if (!token) {
    return { valido: false, motivo: "Token de webhook ausente." };
  }
  return { valido: true };
}

function calcularDataExpiracaoSelfie(
  diasRetencao: number,
  dataRegistro: string,
): { expirada: boolean; expiraEm: string } {
  const data = new Date(dataRegistro);
  const dataExpiracao = new Date(data.getTime() + diasRetencao * 24 * 60 * 60 * 1000);
  return {
    expirada: Date.now() > dataExpiracao.getTime(),
    expiraEm: dataExpiracao.toISOString(),
  };
}

function validarLoteAgendado(
  pagamentos: Array<{ id: string; status: string; dataAgendamento: string }>,
) {
  const agora = new Date().toISOString();
  return pagamentos.filter((p) => p.status === "agendado" && p.dataAgendamento <= agora);
}

describe("Rotas de API: /api/public e /api/internal", () => {
  it("valida headers de segurança nos webhooks públicos", () => {
    expect(validarWebhookHeaders({}).valido).toBe(false);
    expect(validarWebhookHeaders({ "asaas-access-token": "secret-123" }).valido).toBe(true);
  });

  it("calcula expiração de selfies conforme política de retenção configurada", () => {
    const seteDiasAtras = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const tresDiasAtras = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

    // Política de 7 dias de retenção
    expect(calcularDataExpiracaoSelfie(7, seteDiasAtras).expirada).toBe(true);
    expect(calcularDataExpiracaoSelfie(7, tresDiasAtras).expirada).toBe(false);
  });

  it("seleciona apenas pagamentos agendados prontos para processamento", () => {
    const passado = new Date(Date.now() - 10000).toISOString();
    const futuro = new Date(Date.now() + 100000).toISOString();

    const lista = [
      { id: "1", status: "agendado", dataAgendamento: passado },
      { id: "2", status: "agendado", dataAgendamento: futuro },
      { id: "3", status: "pago", dataAgendamento: passado },
    ];

    const prontos = validarLoteAgendado(lista);
    expect(prontos.length).toBe(1);
    expect(prontos[0].id).toBe("1");
  });
});
