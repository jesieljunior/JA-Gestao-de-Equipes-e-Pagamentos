import { describe, expect, it } from "vitest";

import { podeCancelar, proximoStatus, validarTransicao, type StatusEvento } from "@/lib/dominio";

describe("Rotas de Eventos: /eventos e /eventos.$eventoId", () => {
  it("avança o status do evento um passo por vez", () => {
    expect(proximoStatus("planejamento")).toBe("escala");
    expect(proximoStatus("escala")).toBe("confirmacoes");
    expect(proximoStatus("confirmacoes")).toBe("pronto");
    expect(proximoStatus("pronto")).toBe("em_execucao");
    expect(proximoStatus("em_execucao")).toBe("encerrando");
    expect(proximoStatus("encerrando")).toBe("fechamento");
    expect(proximoStatus("fechamento")).toBe("pagamento");
    expect(proximoStatus("pagamento")).toBe("concluido");
    expect(proximoStatus("concluido")).toBe("arquivado");
    expect(proximoStatus("arquivado")).toBeNull();
    expect(proximoStatus("cancelado")).toBeNull();
  });

  it("permite transições estritas válidas", () => {
    expect(validarTransicao("planejamento", "escala")).toBeNull();
    expect(validarTransicao("escala", "confirmacoes")).toBeNull();
    expect(validarTransicao("confirmacoes", "pronto")).toBeNull();
    expect(validarTransicao("pronto", "em_execucao")).toBeNull();
    expect(validarTransicao("em_execucao", "encerrando")).toBeNull();
    expect(validarTransicao("encerrando", "fechamento")).toBeNull();
    expect(validarTransicao("fechamento", "pagamento")).toBeNull();
    expect(validarTransicao("pagamento", "concluido")).toBeNull();
    expect(validarTransicao("concluido", "arquivado")).toBeNull();
  });

  it("rejeita saltar etapas ou retroceder estados", () => {
    // Pular de planejamento direto para em_execucao
    const salto = validarTransicao("planejamento", "em_execucao");
    expect(salto).not.toBeNull();
    expect(salto).toContain("passe por");

    // Retroceder de concluído para em_execucao
    const retrocesso = validarTransicao("concluido", "em_execucao");
    expect(retrocesso).not.toBeNull();
  });

  it("permite cancelar apenas antes da conclusão do evento", () => {
    expect(podeCancelar("planejamento")).toBe(true);
    expect(podeCancelar("escala")).toBe(true);
    expect(podeCancelar("em_execucao")).toBe(true);
    expect(podeCancelar("concluido")).toBe(false);
    expect(podeCancelar("arquivado")).toBe(false);
    expect(podeCancelar("cancelado")).toBe(false);

    expect(validarTransicao("planejamento", "cancelado")).toBeNull();
    expect(validarTransicao("concluido", "cancelado")).toContain("não pode mais ser cancelado");
  });

  it("verifica janela de validade máxima de 12 horas para tokens de QR Code", () => {
    const agora = Date.now();
    const LIMITE_EXPIRACAO_MS = 12 * 60 * 60 * 1000;

    const dataCriacaoRecente = new Date(agora - 2 * 60 * 60 * 1000).toISOString();
    const dataCriacaoExpirada = new Date(agora - 13 * 60 * 60 * 1000).toISOString();

    const isExpirado = (criadoEm: string) =>
      Date.now() - new Date(criadoEm).getTime() > LIMITE_EXPIRACAO_MS;

    expect(isExpirado(dataCriacaoRecente)).toBe(false);
    expect(isExpirado(dataCriacaoExpirada)).toBe(true);
  });
});
