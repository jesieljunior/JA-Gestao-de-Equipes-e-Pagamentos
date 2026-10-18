/**
 * Regras puras da cobrança V2 (participações operacionais).
 * Nenhum preço fica fixo aqui: todos os valores vêm dos planos e taxas
 * configurados pela administração no banco.
 */

const centavos = (n: number) => Math.round(n * 100) / 100;

export type PlanoPreco = {
  id: string;
  nome: string;
  mensalidade: number;
  participacoes_incluidas: number;
  valor_excedente: number;
};

export function calcularFatura(plano: PlanoPreco, participacoes: number, desconto = 0) {
  const excedentes = Math.max(participacoes - plano.participacoes_incluidas, 0);
  const valorExcedente = centavos(excedentes * plano.valor_excedente);
  const bruto = centavos(plano.mensalidade + valorExcedente);
  return {
    excedentes,
    valorExcedente,
    bruto,
    total: Math.max(centavos(bruto - desconto), 0),
  };
}

/** Plano mais barato para um volume de participações. */
export function melhorPlano(planos: PlanoPreco[], participacoes: number): PlanoPreco | null {
  let melhor: PlanoPreco | null = null;
  let menor = Number.POSITIVE_INFINITY;
  for (const plano of planos) {
    const { total } = calcularFatura(plano, participacoes);
    if (total < menor) {
      menor = total;
      melhor = plano;
    }
  }
  return melhor;
}

/**
 * Ponto de virada: menor nº de participações a partir do qual o plano
 * superior fica igual ou mais barato que continuar pagando excedente.
 */
export function pontoDeVirada(inferior: PlanoPreco, superior: PlanoPreco): number | null {
  // Custos são lineares por trecho; avaliar franquias e a raiz de cada trecho.
  const limites = [
    ...new Set([0, inferior.participacoes_incluidas, superior.participacoes_incluidas]),
  ].sort((a, b) => a - b);
  for (let i = 0; i < limites.length; i++) {
    const inicio = limites[i] ?? 0;
    const fim = limites[i + 1] ?? Number.POSITIVE_INFINITY;
    const diferenca =
      calcularFatura(superior, inicio).total - calcularFatura(inferior, inicio).total;
    if (diferenca <= 0) return inicio;
    const inclinacao =
      (inicio >= superior.participacoes_incluidas ? superior.valor_excedente : 0) -
      (inicio >= inferior.participacoes_incluidas ? inferior.valor_excedente : 0);
    if (inclinacao >= 0) continue;
    const candidato = inicio + Math.ceil(diferenca / -inclinacao);
    if (
      candidato <= fim &&
      calcularFatura(superior, candidato).total <= calcularFatura(inferior, candidato).total
    )
      return candidato;
  }
  return null;
}

/** Repasse da taxa do meio de pagamento por dentro: líquido / (1 - taxa). */
export function valorComRepasse(valorLiquido: number, taxa: number) {
  if (!Number.isFinite(valorLiquido) || valorLiquido < 0)
    throw new Error("Valor líquido inválido.");
  if (!Number.isFinite(taxa) || taxa < 0 || taxa >= 1) throw new Error("Taxa inválida.");
  const cobrado = centavos(valorLiquido / (1 - taxa));
  return { cobrado, custo: centavos(cobrado - valorLiquido) };
}

export const RECURSOS_PLANO = [
  { chave: "fechamento", rotulo: "Fechamento financeiro" },
  { chave: "financeiro", rotulo: "Gestão financeira e pagamentos" },
  { chave: "agendamento_pix", rotulo: "Agendamento de Pix" },
  { chave: "pix_massa", rotulo: "Pagamentos e Pix em massa" },
  { chave: "importacao_excel", rotulo: "Importação em massa via Excel" },
  { chave: "relatorios_avancados", rotulo: "Relatórios completos" },
  { chave: "exportacao_avancada", rotulo: "Exportação avançada" },
  { chave: "api", rotulo: "API" },
  { chave: "suporte_prioritario", rotulo: "Suporte prioritário" },
] as const;

export type ChaveRecurso = (typeof RECURSOS_PLANO)[number]["chave"];

export function temRecurso(recursos: unknown, chave: ChaveRecurso): boolean {
  return Boolean(
    recursos &&
    typeof recursos === "object" &&
    (recursos as Record<string, unknown>)[chave] === true,
  );
}

export const AVISO_CLT = "Módulo em processo de validação jurídica trabalhista.";
