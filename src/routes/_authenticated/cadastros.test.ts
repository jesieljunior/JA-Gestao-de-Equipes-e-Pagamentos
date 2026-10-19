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
  telefone?: string;
  funcao?: string;
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
      telefone: input.telefone?.trim() || null,
      funcao: input.funcao?.trim() || null,
      chave_pix: pixLimpo,
      tipo_vinculo: input.tipoVinculo,
      salario_mensal: salario,
      ativo: true,
    },
  };
}

interface ClientePayload {
  nome: string;
  tipo_pessoa: "pf" | "pj";
  cpf_cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  ativo: boolean;
  email?: string | null;
  email_financeiro?: string | null;
  telefone?: string | null;
  uf?: string | null;
  vencimento_preferencial?: number | null;
}

function validarCadastroCliente(input: {
  nome: string;
  tipoPessoa?: "pf" | "pj";
  documento?: string;
  razaoSocial?: string;
  nomeFantasia?: string;
  email?: string;
  emailFinanceiro?: string;
  telefone?: string;
  uf?: string;
  vencimento?: string | number | null;
}): {
  valido: boolean;
  erro?: string;
  payload?: ClientePayload;
} {
  const nomeLimpo = input.nome?.trim();
  if (!nomeLimpo) return { valido: false, erro: "Nome do cliente obrigatório." };

  const tipo = input.tipoPessoa ?? "pj";
  const docLimpo = input.documento ? soDigitos(input.documento) : "";
  const tamanhoEsperado = tipo === "pf" ? 11 : 14;

  if (docLimpo.length !== tamanhoEsperado) {
    return {
      valido: false,
      erro: tipo === "pf" ? "CPF deve ter 11 dígitos." : "CNPJ deve ter 14 dígitos.",
    };
  }

  if (input.uf && input.uf.trim().length !== 2) {
    return { valido: false, erro: "UF deve ter duas letras." };
  }

  let vencimentoNum: number | null = null;
  if (input.vencimento != null && String(input.vencimento).trim() !== "") {
    const parsed = Number(input.vencimento);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 31) {
      return { valido: false, erro: "O vencimento preferencial deve ficar entre 1 e 31." };
    }
    vencimentoNum = parsed;
  }

  const vazio = (valor?: string | null) => (valor && valor.trim() ? valor.trim() : null);

  return {
    valido: true,
    payload: {
      nome: nomeLimpo,
      tipo_pessoa: tipo,
      cpf_cnpj: docLimpo,
      razao_social: vazio(input.razaoSocial) ?? nomeLimpo,
      nome_fantasia: vazio(input.nomeFantasia) ?? nomeLimpo,
      ativo: true,
      email: vazio(input.email),
      email_financeiro: vazio(input.emailFinanceiro),
      telefone: vazio(input.telefone),
      uf: input.uf ? input.uf.trim().toUpperCase() : null,
      vencimento_preferencial: vencimentoNum,
    },
  };
}

function validarLinhaImportacao(
  linha: Record<string, unknown>,
  index: number,
): { valido: boolean; erro?: string } {
  const nome = String(linha["nome"] || "").trim();
  const cpf = soDigitos(String(linha["cpf"] || ""));
  const chavePix = String(linha["chave_pix"] || "").trim();
  const tipo = String(linha["tipo_vinculo"] || "frela").toLowerCase();
  const salario = linha["salario_mensal"] === "" ? null : Number(linha["salario_mensal"]);

  if (!nome || cpf.length !== 11 || !chavePix) {
    return { valido: false, erro: `Linha ${index + 2}: nome, CPF e chave Pix são obrigatórios.` };
  }
  if (tipo !== "frela" && tipo !== "clt") {
    return { valido: false, erro: `Linha ${index + 2}: tipo_vinculo deve ser frela ou clt.` };
  }
  if (tipo === "clt" && (!salario || salario <= 0)) {
    return { valido: false, erro: `Linha ${index + 2}: salário mensal é obrigatório para CLT.` };
  }
  return { valido: true };
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
      cpf: "123.456.789-01",
      chavePix: "11999998888",
      tipoVinculo: "frela",
      funcao: "Barman",
    });
    expect(frelaValido.valido).toBe(true);
    expect(frelaValido.payload?.cpf).toBe("12345678901");
    expect(frelaValido.payload?.salario_mensal).toBeNull();
    expect(frelaValido.payload?.funcao).toBe("Barman");
  });

  it("valida cadastro de colaboradores CLT com salário informado", () => {
    const cltValido = validarCadastroFreelancer({
      nome: "Juliana Santos",
      cpf: "98765432100",
      chavePix: "juliana@email.com",
      tipoVinculo: "clt",
      salarioMensal: "3500,50",
    });
    expect(cltValido.valido).toBe(true);
    expect(cltValido.payload?.salario_mensal).toBe(3500.5);
    expect(cltValido.payload?.tipo_vinculo).toBe("clt");
  });

  it("valida regras de importação de colaboradores via planilha Excel", () => {
    const linhaValida = validarLinhaImportacao(
      {
        nome: "Pedro Silva",
        cpf: "12345678901",
        chave_pix: "pedro@pix.com",
        tipo_vinculo: "frela",
      },
      0,
    );
    expect(linhaValida.valido).toBe(true);

    const linhaSemPix = validarLinhaImportacao(
      { nome: "Pedro Silva", cpf: "12345678901", chave_pix: "", tipo_vinculo: "frela" },
      1,
    );
    expect(linhaSemPix.valido).toBe(false);
    expect(linhaSemPix.erro).toContain("chave Pix são obrigatórios");

    const linhaCltInvalida = validarLinhaImportacao(
      {
        nome: "Renata Costa",
        cpf: "12345678901",
        chave_pix: "renata@pix.com",
        tipo_vinculo: "clt",
        salario_mensal: 0,
      },
      2,
    );
    expect(linhaCltInvalida.valido).toBe(false);
    expect(linhaCltInvalida.erro).toContain("salário mensal é obrigatório para CLT");
  });

  it("valida cadastro de clientes com CPF ou CNPJ e campos complementares", () => {
    const docInvalido = validarCadastroCliente({
      nome: "Empresa XPTO",
      tipoPessoa: "pj",
      documento: "12345",
    });
    expect(docInvalido.valido).toBe(false);
    expect(docInvalido.erro).toContain("CNPJ deve ter 14 dígitos");

    const pfInvalido = validarCadastroCliente({
      nome: "João Silva",
      tipoPessoa: "pf",
      documento: "123456789",
    });
    expect(pfInvalido.valido).toBe(false);
    expect(pfInvalido.erro).toContain("CPF deve ter 11 dígitos");

    const validoCnpj = validarCadastroCliente({
      nome: "Agência Alpha Ltda",
      tipoPessoa: "pj",
      documento: "12.345.678/0001-99",
      email: "contato@alpha.com",
      uf: "SP",
      vencimento: 15,
    });
    expect(validoCnpj.valido).toBe(true);
    expect(validoCnpj.payload?.cpf_cnpj).toBe("12345678000199");
    expect(validoCnpj.payload?.uf).toBe("SP");
    expect(validoCnpj.payload?.vencimento_preferencial).toBe(15);

    const ufInvalida = validarCadastroCliente({
      nome: "Agência Beta",
      tipoPessoa: "pj",
      documento: "12.345.678/0001-99",
      uf: "SAOPAULO",
    });
    expect(ufInvalida.valido).toBe(false);
    expect(ufInvalida.erro).toContain("UF deve ter duas letras");

    const vencimentoInvalido = validarCadastroCliente({
      nome: "Agência Beta",
      tipoPessoa: "pj",
      documento: "12.345.678/0001-99",
      vencimento: 32,
    });
    expect(vencimentoInvalido.valido).toBe(false);
    expect(vencimentoInvalido.erro).toContain("entre 1 e 31");
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
