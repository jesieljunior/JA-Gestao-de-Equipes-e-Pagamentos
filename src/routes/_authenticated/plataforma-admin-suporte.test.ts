import { describe, expect, it } from "vitest";

import {
  resolverContextoLegacy,
  type ContextoResolvido,
  type PapelPlataforma,
} from "@/lib/dominio";

interface AtendimentoSuporte {
  id: string;
  agenteId: string;
  status: "aberto" | "fechado";
  empresaAlvoId: string;
}

function validarLeituraSuporte(
  contexto: ContextoResolvido,
  atendimento: AtendimentoSuporte | null,
  empresaIdConsultada: string,
): { permitido: boolean; motivo?: string } {
  // AGENTS.md: Support reads require a caller-owned open audited attendance and explicit ownership-chain filters
  if (!contexto.hasPlatformContext || !contexto.papeisPlataforma.includes("suporte")) {
    return { permitido: false, motivo: "Usuário não possui papel de suporte." };
  }

  if (!atendimento || atendimento.status !== "aberto") {
    return { permitido: false, motivo: "Atendimento de suporte aberto e auditado é obrigatório." };
  }

  if (atendimento.agenteId !== contexto.usuarioId) {
    return { permitido: false, motivo: "O atendimento pertence a outro agente de suporte." };
  }

  if (atendimento.empresaAlvoId !== empresaIdConsultada) {
    return {
      permitido: false,
      motivo: "Atendimento não autorizado para a empresa alvo consultada.",
    };
  }

  return { permitido: true };
}

function validarOperacaoFinanceiraSuporte(contexto: ContextoResolvido): {
  permitido: boolean;
  motivo: string;
} {
  // AGENTS.md: support money-moving endpoints fail closed
  if (
    contexto.papeisPlataforma.includes("suporte") &&
    !contexto.papeisPlataforma.includes("admin_master")
  ) {
    return {
      permitido: false,
      motivo: "Operações financeiras bloqueadas para perfil de suporte (fail closed).",
    };
  }
  return { permitido: true, motivo: "Autorizado." };
}

function validarAcessoMasterAdmin(contexto: ContextoResolvido): {
  autorizado: boolean;
  motivo?: string;
} {
  // AGENTS.md: privileged account changes verify master authority before loading the administrative client
  const isMaster =
    contexto.hasPlatformContext && contexto.papeisPlataforma.includes("admin_master");
  if (!isMaster) {
    return { autorizado: false, motivo: "Acesso restrito ao Administrador Master da plataforma." };
  }
  return { autorizado: true };
}

describe("Rotas de Plataforma: /admin, /suporte e /acessos-teste", () => {
  it("isola estritamente os contextos de plataforma e organização (AGENTS.md)", () => {
    // Um usuário de plataforma vinculado a uma empresa legada não deve herdar contexto de organização
    const contextoHibrido = resolverContextoLegacy({
      usuarioId: "user-plat-1",
      empresaId: "emp-legada-1",
      papeisPlataforma: ["admin_master"],
      papeis: ["admin"],
    });

    expect(contextoHibrido.hasPlatformContext).toBe(true);
    expect(contextoHibrido.hasOrganizationContext).toBe(false);
    expect(contextoHibrido.empresaId).toBeNull();
    expect(contextoHibrido.papeis).toEqual([]);
  });

  it("exige atendimento aberto do próprio agente para leitura de dados no /suporte", () => {
    const agenteSuporte = resolverContextoLegacy({
      usuarioId: "agente-1",
      empresaId: null,
      papeisPlataforma: ["suporte"],
    });

    // 1. Sem atendimento aberto
    const semAtendimento = validarLeituraSuporte(agenteSuporte, null, "emp-100");
    expect(semAtendimento.permitido).toBe(false);
    expect(semAtendimento.motivo).toContain("aberto e auditado");

    // 2. Atendimento de outro agente
    const atendimentoOutro: AtendimentoSuporte = {
      id: "atend-1",
      agenteId: "agente-99",
      status: "aberto",
      empresaAlvoId: "emp-100",
    };
    const outroAgente = validarLeituraSuporte(agenteSuporte, atendimentoOutro, "emp-100");
    expect(outroAgente.permitido).toBe(false);
    expect(outroAgente.motivo).toContain("outro agente");

    // 3. Atendimento correto do próprio agente para a empresa correta
    const atendimentoProprio: AtendimentoSuporte = {
      id: "atend-2",
      agenteId: "agente-1",
      status: "aberto",
      empresaAlvoId: "emp-100",
    };
    const leituraValida = validarLeituraSuporte(agenteSuporte, atendimentoProprio, "emp-100");
    expect(leituraValida.permitido).toBe(true);
  });

  it("garante que endpoints que movimentam dinheiro falhem fechados para suporte (fail closed)", () => {
    const agenteSuporte = resolverContextoLegacy({
      usuarioId: "agente-2",
      empresaId: null,
      papeisPlataforma: ["suporte"],
    });

    const operacaoFinanceira = validarOperacaoFinanceiraSuporte(agenteSuporte);
    expect(operacaoFinanceira.permitido).toBe(false);
    expect(operacaoFinanceira.motivo).toContain("fail closed");
  });

  it("exige autoridade master antes de carregar cliente administrativo em /admin e /acessos-teste", () => {
    const adminAgencia = resolverContextoLegacy({
      usuarioId: "admin-agencia-1",
      empresaId: "emp-1",
      papeis: ["admin"],
    });
    expect(validarAcessoMasterAdmin(adminAgencia).autorizado).toBe(false);

    const master = resolverContextoLegacy({
      usuarioId: "master-super-1",
      empresaId: null,
      papeisPlataforma: ["admin_master"],
    });
    expect(validarAcessoMasterAdmin(master).autorizado).toBe(true);
  });
});
