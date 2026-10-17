import { describe, expect, it } from "vitest";

import { mascararToken } from "@/lib/mercadopago.functions";

interface PlanoConfig {
  nome: string;
  maxEventosMes: number;
  maxCltAtivos: number;
  recursosHabilitados: string[];
}

function verificarAcessoRecursoPlano(
  plano: PlanoConfig,
  recurso: string,
): { permitido: boolean; motivo?: string } {
  if (!plano.recursosHabilitados.includes(recurso)) {
    return {
      permitido: false,
      motivo: `O recurso "${recurso}" não está disponível no plano ${plano.nome}. Faça upgrade para acessar.`,
    };
  }
  return { permitido: true };
}

function validarLimiteEventos(
  plano: PlanoConfig,
  eventosCriadosNoCiclo: number,
): { permitido: boolean; erro?: string } {
  if (eventosCriadosNoCiclo >= plano.maxEventosMes) {
    return {
      permitido: false,
      erro: `Limite de eventos atingido (${eventosCriadosNoCiclo}/${plano.maxEventosMes}) no ciclo do plano ${plano.nome}.`,
    };
  }
  return { permitido: true };
}

describe("Rotas de Configurações e Planos: /configuracoes e /plano", () => {
  const planoGratuito: PlanoConfig = {
    nome: "Starter",
    maxEventosMes: 3,
    maxCltAtivos: 5,
    recursosHabilitados: ["ponto_qrcode"],
  };

  const planoPro: PlanoConfig = {
    nome: "Profissional",
    maxEventosMes: 50,
    maxCltAtivos: 100,
    recursosHabilitados: ["ponto_qrcode", "pagamento_pix", "fiscal_nfe", "regras_avancadas"],
  };

  it("bloqueia recursos avançados fora do plano contratado", () => {
    const pixStarter = verificarAcessoRecursoPlano(planoGratuito, "pagamento_pix");
    expect(pixStarter.permitido).toBe(false);
    expect(pixStarter.motivo).toContain("não está disponível");

    const pixPro = verificarAcessoRecursoPlano(planoPro, "pagamento_pix");
    expect(pixPro.permitido).toBe(true);
  });

  it("enforça limites de eventos por ciclo de cobrança", () => {
    expect(validarLimiteEventos(planoGratuito, 2).permitido).toBe(true);
    expect(validarLimiteEventos(planoGratuito, 3).permitido).toBe(false);
    expect(validarLimiteEventos(planoGratuito, 3).erro).toContain("Limite de eventos atingido");
  });

  it("mascara credenciais do Mercado Pago para exibição segura na interface", () => {
    expect(mascararToken("APP_USR-123456789-abcdefg")).toBe("APP_USR-...defg");
    expect(mascararToken("TEST-987654321-zyxwvu")).toBe("TEST-987...xwvu");
    expect(mascararToken("curto")).toBe("••••••••");
    expect(mascararToken("")).toBe("");
  });
});
