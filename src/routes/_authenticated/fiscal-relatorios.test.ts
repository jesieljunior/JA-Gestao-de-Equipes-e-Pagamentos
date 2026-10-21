import { describe, expect, it } from "vitest";

interface DocumentoFiscal {
  id: string;
  numeroNota: string;
  valorServico: number;
  aliquotaIss: number;
  reterIss: boolean;
  reterIr: boolean;
  reterInss: boolean;
}

function calcularImpostosNota(doc: DocumentoFiscal) {
  const valorIss = Math.round(doc.valorServico * (doc.aliquotaIss / 100) * 100) / 100;
  const valorIr = doc.reterIr ? Math.round(doc.valorServico * 0.015 * 100) / 100 : 0; // 1.5% IRRF
  const valorInss = doc.reterInss ? Math.round(doc.valorServico * 0.11 * 100) / 100 : 0; // 11% INSS

  const totalRetencoes = (doc.reterIss ? valorIss : 0) + valorIr + valorInss;
  const valorLiquido = Math.round((doc.valorServico - totalRetencoes) * 100) / 100;

  return {
    valorIss,
    valorIr,
    valorInss,
    totalRetencoes,
    valorLiquido,
  };
}

function filtrarLinhasRelatorio<T extends { criado_em: string }>(
  dados: T[],
  filtroInicio: string,
  filtroFim: string,
): T[] {
  const inicio = new Date(filtroInicio).getTime();
  const fim = new Date(filtroFim).getTime();

  return dados.filter((item) => {
    const dataItem = new Date(item.criado_em).getTime();
    return dataItem >= inicio && dataItem <= fim;
  });
}

function sanitizarCelulaCsv(valor: unknown): string {
  if (valor == null) return '""';
  const str = String(valor).replace(/"/g, '""');
  // Protege contra formula injection no Excel
  if (/^[=+\-@]/.test(str)) {
    return `"'${str}"`;
  }
  return `"${str}"`;
}

describe("Rotas Fiscais e Relatórios: /documentos-fiscais e /relatorios", () => {
  it("calcula retenções tributárias e valor líquido de notas fiscais", () => {
    const doc: DocumentoFiscal = {
      id: "doc-1",
      numeroNota: "2026/001",
      valorServico: 1000.0,
      aliquotaIss: 5.0, // 5% = R$ 50,00
      reterIss: true,
      reterIr: true, // 1.5% = R$ 15,00
      reterInss: false,
    };

    const impostos = calcularImpostosNota(doc);
    expect(impostos.valorIss).toBe(50.0);
    expect(impostos.valorIr).toBe(15.0);
    expect(impostos.valorInss).toBe(0.0);
    expect(impostos.totalRetencoes).toBe(65.0);
    expect(impostos.valorLiquido).toBe(935.0);
  });

  it("filtra registros de relatórios por período de datas", () => {
    const itens = [
      { id: "1", criado_em: "2026-10-01T10:00:00Z" },
      { id: "2", criado_em: "2026-10-15T15:30:00Z" },
      { id: "3", criado_em: "2026-10-25T12:00:00Z" },
    ];

    const filtrados = filtrarLinhasRelatorio(itens, "2026-10-10T00:00:00Z", "2026-10-20T23:59:59Z");

    expect(filtrados.length).toBe(1);
    expect(filtrados[0]?.id).toBe("2");
  });

  it("sanitiza campos exportados em relatórios para prevenir formula injection", () => {
    expect(sanitizarCelulaCsv("Carlos Silva")).toBe('"Carlos Silva"');
    expect(sanitizarCelulaCsv("=SUM(A1:A10)")).toBe('"\'=SUM(A1:A10)"');
    expect(sanitizarCelulaCsv("+5511999999999")).toBe('"\' +5511999999999"'.replace(" ", ""));
  });
});
