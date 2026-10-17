import { describe, expect, it } from "vitest";

import {
  formatarCpf,
  podeCom,
  soDigitos,
  type Capacidade,
  type PapelUsuario,
  type TipoVinculo,
} from "@/lib/dominio";

interface FreelancerPayload {
  nome: string;
  cpf: string;
  telefone?: string | null;
  funcao?: string | null;
  chave_pix: string;
  tipo_vinculo: TipoVinculo;
  salario_mensal?: number | null;
  ativo: boolean;
}

function validarCadastroFreelancer(input: {
  nome: string;
  cpf: string;
  chavePix: string;
  tipoVinculo: TipoVinculo;
  salarioMensal?: string | number | null;
}): { valido: boolean; erro?: string; payload?: FreelancerPayload } {
  const nomeLimpo = input.nome.trim();
  if (!nomeLimpo) {
    return { valido: false, erro: "Nome obrigatório." };
  }

  const digitos = soDigitos(input.cpf);
  if (digitos.length !== 11) {
    return { valido: false, erro: "CPF deve ter 11 dígitos." };
  }

  const pixLimpo = input.chavePix.trim();
  if (!pixLimpo) {
    return { valido: false, erro: "Chave Pix obrigatória para repasse." };
  }

  let salario: number | null = null;
  if (input.tipoVinculo === "clt") {
    const raw =
      typeof input.salarioMensal === "string"
        ? Number(input.salarioMensal.replace(",", "."))
        : Number(input.salarioMensal);

    if (!raw || isNaN(raw) || raw <= 0) {
      return { valido: false, erro: "Informe o salário mensal do colaborador CLT." };
    }
    salario = Math.round(raw * 100) / 100;
  }

  return {
    valido: true,
    payload: {
      nome: nomeLimpo,
      cpf: digitos,
      chave_pix: pixLimpo,
      tipo_vinculo: input.tipoVinculo,
      salario_mensal: salario,
      ativo: true,
    },
  };
}

interface ClientePayload {
  nome: string;
  documento?: string | null;
  email?: string | null;
  telefone?: string | null;
}

function validarCadastroCliente(input: { nome: string; documento?: string; email?: string }): {
  valido: boolean;
  erro?: string;
  payload?: ClientePayload;
} {
  const nomeLimpo = input.nome.trim();
  if (!nomeLimpo) return { valido: false, erro: "Nome do cliente obrigatório." };

  const doc = input.documento ? soDigitos(input.documento) : null;
  if (doc && doc.length !== 11 && doc.length !== 14) {
    return { valido: false, erro: "Documento deve ser CPF (11 dígitos) ou CNPJ (14 dígitos)." };
  }

  if (input.email && !input.email.includes("@")) {
    return { valido: false, erro: "E-mail inválido." };
  }

  return {
    valido: true,
    payload: {
      nome: nomeLimpo,
      documento: doc,
      email: input.email?.trim() || null,
    },
  };
}

describe("Rotas de Cadastros: /freelancers, /clientes e /equipe", () => {
  it("valida formulário de cadastro de freelancers e formatação de CPF", () => {
    expect(formatarCpf("12345678901")).toBe("123.456.789-01");

    const invalidoCpf = validarCadastroFreelancer({
      nome: "Carlos Lima",
      cpf: "123",
      chavePix: "carlos@pix.com",
      tipoVinculo: "frela",
    });
    expect(invalidoCpf.valido).toBe(false);
    expect(invalidoCpf.erro).toContain("11 dígitos");

    const cltSemSalario = validarCadastroFreelancer({
      nome: "Ana Souza",
      cpf: "12345678901",
      chavePix: "ana@pix.com",
      tipoVinculo: "clt",
      salarioMensal: "",
    });
    expect(cltSemSalario.valido).toBe(false);
    expect(cltSemSalario.erro).toContain("salário mensal");

    const frelaValido = validarCadastroFreelancer({
      nome: "Marcos Paulo",
      cpf: "12345678901",
      chavePix: "11999998888",
      tipoVinculo: "frela",
    });
    expect(frelaValido.valido).toBe(true);
    expect(frelaValido.payload?.salario_mensal).toBeNull();
  });

  it("valida cadastro de clientes com CPF ou CNPJ", () => {
    const docInvalido = validarCadastroCliente({
      nome: "Empresa XPTO",
      documento: "12345",
    });
    expect(docInvalido.valido).toBe(false);
    expect(docInvalido.erro).toContain("CPF (11 dígitos) ou CNPJ (14 dígitos)");

    const validoCnpj = validarCadastroCliente({
      nome: "Agência Alpha Ltda",
      documento: "12.345.678/0001-99",
      email: "contato@alpha.com",
    });
    expect(validoCnpj.valido).toBe(true);
    expect(validoCnpj.payload?.documento).toBe("12345678000199");
  });

  it("garante matriz de permissões para gestão de equipe", () => {
    // Admin tem todas as capacidades
    expect(podeCom(["admin"], "cadastros.gerenciar")).toBe(true);
    expect(podeCom(["admin"], "financeiro.gerenciar")).toBe(true);
    expect(podeCom(["admin"], "configuracoes.gerenciar")).toBe(true);

    // Coordenador gerencia eventos e operação, mas não financeiro nem configurações
    expect(podeCom(["coordenador"], "eventos.gerenciar")).toBe(true);
    expect(podeCom(["coordenador"], "operacao.supervisionar")).toBe(true);
    expect(podeCom(["coordenador"], "financeiro.gerenciar")).toBe(false);
    expect(podeCom(["coordenador"], "configuracoes.gerenciar")).toBe(false);

    // Supervisor restrito à supervisão da operação
    expect(podeCom(["supervisor"], "operacao.supervisionar")).toBe(true);
    expect(podeCom(["supervisor"], "eventos.gerenciar")).toBe(false);

    // Financeiro restrito a financeiro e relatórios
    expect(podeCom(["financeiro"], "financeiro.gerenciar")).toBe(true);
    expect(podeCom(["financeiro"], "relatorios.ver")).toBe(true);
    expect(podeCom(["financeiro"], "eventos.gerenciar")).toBe(false);
  });
});
