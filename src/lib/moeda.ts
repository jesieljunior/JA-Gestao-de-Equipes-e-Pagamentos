/** Converte valores brasileiros sem aceitar conversões parciais ou assumir zero. */
export function parseMoedaBrasileira(valor: string | number): number {
  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) throw new Error("Informe um valor válido.");
    return Math.round(valor * 100) / 100;
  }

  const texto = valor.trim().replace(/R\$/gi, "").replace(/\s/g, "");
  if (!texto) throw new Error("Informe um valor válido.");

  const ultimaVirgula = texto.lastIndexOf(",");
  const ultimoPonto = texto.lastIndexOf(".");
  let normalizado = texto;

  if (ultimaVirgula > ultimoPonto) {
    normalizado = texto.replace(/\./g, "").replace(",", ".");
  } else if (ultimoPonto > ultimaVirgula && ultimaVirgula >= 0) {
    normalizado = texto.replace(/,/g, "");
  } else if (ultimaVirgula >= 0) {
    normalizado = texto.replace(",", ".");
  }

  if (!/^-?\d+(?:\.\d+)?$/.test(normalizado)) {
    throw new Error("Informe um valor válido.");
  }

  const numero = Number(normalizado);
  if (!Number.isFinite(numero)) throw new Error("Informe um valor válido.");
  return Math.round(numero * 100) / 100;
}

export function parseValorPositivo(valor: string | number): number {
  const numero = parseMoedaBrasileira(valor);
  if (numero < 0.01) throw new Error("Informe um valor maior ou igual a R$ 0,01.");
  return numero;
}

export function reaisParaCentavos(reais: number): number {
  return Math.round(reais * 100);
}

export function centavosParaReais(centavos: number): number {
  return Math.round(centavos) / 100;
}

export function formatarBRL(valor: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valor);
}
