/**
 * Cliente HTTP do Asaas (server-only).
 * Sandbox e produção mudam apenas de base URL; a chave define o ambiente.
 * Documentação: https://docs.asaas.com/
 */

export type AmbienteAsaas = "sandbox" | "producao";

function baseUrl(): string {
  const amb = (process.env["ASAAS_ENVIRONMENT"] ?? "sandbox") as AmbienteAsaas;
  return amb === "producao" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";
}

export class AsaasError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AsaasError";
  }
}

async function chamar<T>(
  caminho: string,
  init: { method: "GET" | "POST"; body?: unknown } = { method: "GET" },
): Promise<T> {
  const chave = process.env["ASAAS_API_KEY"];
  if (!chave) throw new AsaasError("Chave do Asaas não configurada.", 500);

  const resposta = await fetch(`${baseUrl()}${caminho}`, {
    method: init.method,
    headers: {
      access_token: chave,
      "Content-Type": "application/json",
      "User-Agent": "Ja-Gestao-Equipes-Pagamentos",
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  });

  const texto = await resposta.text();
  let corpo: unknown = {};
  try {
    corpo = texto ? JSON.parse(texto) : {};
  } catch {
    corpo = { raw: texto };
  }

  if (!resposta.ok) {
    const asaasResponse = corpo as {
      errors?: { description?: string }[];
      message?: string;
      error?: string;
    };
    const descricao =
      asaasResponse.errors
        ?.map((e) => e.description)
        .filter(Boolean)
        .join("; ") ||
      asaasResponse.message ||
      asaasResponse.error ||
      (texto ? `Asaas erro: ${texto.slice(0, 150)}` : "");
    throw new AsaasError(descricao || `Asaas respondeu status ${resposta.status}`, resposta.status);
  }
  return corpo as T;
}

export type ClienteAsaas = { id: string };

export async function garantirClienteAsaas(dados: {
  nome: string;
  cpfCnpj: string;
  email?: string | null;
  telefone?: string | null;
  referenciaExterna: string;
}): Promise<string> {
  const existentes = await chamar<{ data: ClienteAsaas[] }>(
    `/customers?cpfCnpj=${encodeURIComponent(dados.cpfCnpj)}&limit=1`,
  );
  const achado = existentes.data?.[0]?.id;
  if (achado) return achado;

  const criado = await chamar<ClienteAsaas>("/customers", {
    method: "POST",
    body: {
      name: dados.nome,
      cpfCnpj: dados.cpfCnpj,
      email: dados.email ?? undefined,
      mobilePhone: dados.telefone ?? undefined,
      externalReference: dados.referenciaExterna,
    },
  });
  return criado.id;
}

export type CobrancaAsaas = {
  id: string;
  status: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
};

export async function criarCobrancaAsaas(dados: {
  clienteAsaasId: string;
  valor: number;
  forma: "pix" | "boleto" | "cartao";
  vencimento: string;
  descricao: string;
  referenciaExterna: string;
  split?: { walletId: string; percentualValue?: number; fixedValue?: number }[];
}): Promise<CobrancaAsaas> {
  // "cartao" vai como UNDEFINED para a fatura do Asaas aceitar crédito e débito.
  const billingType =
    dados.forma === "pix" ? "PIX" : dados.forma === "boleto" ? "BOLETO" : "UNDEFINED";

  return chamar<CobrancaAsaas>("/payments", {
    method: "POST",
    body: {
      customer: dados.clienteAsaasId,
      billingType,
      value: dados.valor,
      dueDate: dados.vencimento,
      description: dados.descricao,
      externalReference: dados.referenciaExterna,
      ...(dados.split?.length ? { split: dados.split } : {}),
    },
  });
}

export async function obterPixQrCode(
  cobrancaId: string,
): Promise<{ payload: string | null; imagem: string | null }> {
  try {
    const r = await chamar<{ payload?: string; encodedImage?: string }>(
      `/payments/${cobrancaId}/pixQrCode`,
    );
    return { payload: r.payload ?? null, imagem: r.encodedImage ?? null };
  } catch {
    return { payload: null, imagem: null };
  }
}

export async function obterPixCopiaCola(cobrancaId: string): Promise<string | null> {
  return (await obterPixQrCode(cobrancaId)).payload;
}

export async function obterCobrancaAsaas(cobrancaId: string) {
  return chamar<{ id: string; status: string; paymentDate?: string }>(`/payments/${cobrancaId}`);
}

/** Tipo da chave Pix inferido pelo formato, como o Asaas espera. */
export function tipoChavePix(chave: string): "CPF" | "CNPJ" | "EMAIL" | "PHONE" | "EVP" {
  const digitos = chave.replace(/\D+/g, "");
  if (chave.includes("@") && !/^\d/.test(chave)) return "EMAIL";
  if (digitos.length === 11 && digitos === chave.replace(/\D+/g, "") && !chave.startsWith("+"))
    return "CPF";
  if (digitos.length === 14) return "CNPJ";
  if (
    digitos.length === 10 ||
    digitos.length === 11 ||
    digitos.length === 12 ||
    digitos.length === 13 ||
    chave.startsWith("+")
  )
    return "PHONE";
  return "EVP";
}

export function normalizarChavePix(chave: string): {
  chave: string;
  tipo: "CPF" | "CNPJ" | "EMAIL" | "PHONE" | "EVP";
} {
  const chaveLimpa = chave.trim();
  const tipo = tipoChavePix(chaveLimpa);
  let chaveFormatada = chaveLimpa;

  if (tipo === "CPF" || tipo === "CNPJ") {
    chaveFormatada = chaveLimpa.replace(/\D+/g, "");
  } else if (tipo === "PHONE") {
    const digitos = chaveLimpa.replace(/\D+/g, "");
    chaveFormatada = chaveLimpa.startsWith("+")
      ? chaveLimpa
      : digitos.startsWith("55")
        ? `+${digitos}`
        : `+55${digitos}`;
  } else if (tipo === "EMAIL") {
    chaveFormatada = chaveLimpa.toLowerCase();
  }

  return { chave: chaveFormatada, tipo };
}

export type TransferenciaAsaas = { id: string; status: string; failReason?: string };

export async function transferirPix(dados: {
  valor: number;
  chavePix: string;
  descricao: string;
  referenciaExterna: string;
  chaveIdempotencia: string;
}): Promise<TransferenciaAsaas> {
  const { chave: pixAddressKey, tipo: pixAddressKeyType } = normalizarChavePix(dados.chavePix);
  const transferencia = await chamar<TransferenciaAsaas>("/transfers", {
    method: "POST",
    body: {
      value: dados.valor,
      operationType: "PIX",
      pixAddressKey,
      pixAddressKeyType,
      description: dados.descricao,
      externalReference: dados.referenciaExterna,
      idempotencyKey: dados.chaveIdempotencia,
    },
  });

  if (transferencia.status === "FAILED" || transferencia.failReason) {
    throw new AsaasError(
      `Pix recusado pelo parceiro: ${transferencia.failReason || "Falha na transferência"}`,
      400,
    );
  }

  return transferencia;
}
