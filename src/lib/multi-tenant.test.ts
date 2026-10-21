import { describe, expect, it } from "vitest";

interface EntidadeTenant {
  id: string;
  empresa_id: string;
  nome?: string;
  valor?: number;
}

interface Evento extends EntidadeTenant {
  titulo: string;
}

interface Pagamento extends EntidadeTenant {
  status: "pendente" | "agendado" | "executado" | "falhou";
  destinatario: string;
}

interface UsuarioContexto {
  userId: string;
  empresaId: string | null;
  papel: "admin" | "coordenador" | "suporte" | "admin_master";
  sessaoSuporteAtiva?: boolean;
}

// Simulador de motor de consulta com isolamento RLS multi-tenant
function executarConsultaTenant<T extends EntidadeTenant>(
  tabela: T[],
  contexto: UsuarioContexto,
  filtros?: { id?: string },
): { data: T[]; error: string | null } {
  // Usuário sem organização selecionada e sem permissão master é rejeitado
  if (!contexto.empresaId && contexto.papel !== "admin_master") {
    return { data: [], error: "Contexto de empresa não selecionado." };
  }

  // Sessão de suporte sem ticket de auditoria ativo falha fechada
  if (contexto.papel === "suporte" && !contexto.sessaoSuporteAtiva) {
    return { data: [], error: "Sessão de suporte exige atendimento auditado ativo." };
  }

  // Isolamento estrito por empresa_id (Row Level Security equivalente)
  let resultados = tabela.filter((item) => item.empresa_id === contexto.empresaId);

  // Filtro adicional por ID (busca pontual com proteção contra adulteração de ID)
  if (filtros?.id) {
    resultados = resultados.filter((item) => item.id === filtros.id);
  }

  return { data: resultados, error: null };
}

describe("Isolamento Multi-Tenant Estrito (Org A vs Org B)", () => {
  const ORG_A = "empresa-alpha-111";
  const ORG_B = "empresa-beta-222";

  const eventosMock: Evento[] = [
    { id: "evt-a-1", empresa_id: ORG_A, titulo: "Festival de Música São Paulo" },
    { id: "evt-a-2", empresa_id: ORG_A, titulo: "Convenção Farmacêutica" },
    { id: "evt-b-1", empresa_id: ORG_B, titulo: "Feira de Tecnologia Rio" },
    { id: "evt-b-2", empresa_id: ORG_B, titulo: "Lançamento Automotivo" },
  ];

  const pagamentosMock: Pagamento[] = [
    {
      id: "pay-a-1",
      empresa_id: ORG_A,
      status: "executado",
      valor: 350,
      destinatario: "João Silva",
    },
    {
      id: "pay-a-2",
      empresa_id: ORG_A,
      status: "agendado",
      valor: 400,
      destinatario: "Maria Santos",
    },
    {
      id: "pay-b-1",
      empresa_id: ORG_B,
      status: "executado",
      valor: 500,
      destinatario: "Carlos Lima",
    },
  ];

  it("garante que a Organização A nunca enxerga eventos da Organização B", () => {
    const usuarioOrgA: UsuarioContexto = {
      userId: "usr-a",
      empresaId: ORG_A,
      papel: "admin",
    };

    const resultado = executarConsultaTenant(eventosMock, usuarioOrgA);
    expect(resultado.error).toBeNull();
    expect(resultado.data.length).toBe(2);
    expect(resultado.data.every((e) => e.empresa_id === ORG_A)).toBe(true);

    const idsRetornados = resultado.data.map((e) => e.id);
    expect(idsRetornados).toContain("evt-a-1");
    expect(idsRetornados).toContain("evt-a-2");
    expect(idsRetornados).not.toContain("evt-b-1");
    expect(idsRetornados).not.toContain("evt-b-2");
  });

  it("garante que a Organização B nunca enxerga pagamentos da Organização A", () => {
    const usuarioOrgB: UsuarioContexto = {
      userId: "usr-b",
      empresaId: ORG_B,
      papel: "admin",
    };

    const resultado = executarConsultaTenant(pagamentosMock, usuarioOrgB);
    expect(resultado.error).toBeNull();
    expect(resultado.data.length).toBe(1);
    expect(resultado.data[0]?.id).toBe("pay-b-1");
    expect(resultado.data[0]?.destinatario).toBe("Carlos Lima");
  });

  it("impede adulteração de ID (ID Tampering / IDOR) entre tenants", () => {
    const usuarioOrgA: UsuarioContexto = {
      userId: "usr-a",
      empresaId: ORG_A,
      papel: "admin",
    };

    // Usuário da Org A tenta acessar diretamente pelo ID o evento evt-b-1 da Org B
    const tentativaIdor = executarConsultaTenant(eventosMock, usuarioOrgA, { id: "evt-b-1" });
    expect(tentativaIdor.error).toBeNull();
    // Deve retornar vazio, pois a cláusula RLS empresa_id não combina
    expect(tentativaIdor.data.length).toBe(0);
  });

  it("bloqueia consultas de suporte sem sessão auditada ativa (fail-closed)", () => {
    const usuarioSuporteSemSessao: UsuarioContexto = {
      userId: "usr-sup",
      empresaId: ORG_A,
      papel: "suporte",
      sessaoSuporteAtiva: false,
    };

    const resultado = executarConsultaTenant(eventosMock, usuarioSuporteSemSessao);
    expect(resultado.data.length).toBe(0);
    expect(resultado.error).toContain("exige atendimento auditado");
  });

  it("permite leitura estrita de suporte apenas quando sessão auditada estiver ativa", () => {
    const usuarioSuporteComSessao: UsuarioContexto = {
      userId: "usr-sup",
      empresaId: ORG_A,
      papel: "suporte",
      sessaoSuporteAtiva: true,
    };

    const resultado = executarConsultaTenant(eventosMock, usuarioSuporteComSessao);
    expect(resultado.error).toBeNull();
    expect(resultado.data.length).toBe(2);
    expect(resultado.data.every((e) => e.empresa_id === ORG_A)).toBe(true);
  });
});
