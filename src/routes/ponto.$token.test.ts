import { describe, expect, it } from "vitest";
import { z } from "zod";

import { soDigitos } from "@/lib/dominio";

// Schemas e regras que espelham ponto.functions.ts e ponto.$token.tsx
const tokenSchema = z.object({ token: z.string().min(8).max(128) });
const SEQUENCIA_PONTOS = ["entrada", "inicio_intervalo", "fim_intervalo", "saida"] as const;

function proximoPontoPermitido(ultimoTipo: string | null): string {
  if (!ultimoTipo) return "entrada";
  const idx = SEQUENCIA_PONTOS.indexOf(ultimoTipo as (typeof SEQUENCIA_PONTOS)[number]);
  if (idx < 0 || idx >= SEQUENCIA_PONTOS.length - 1) return "concluido";
  return SEQUENCIA_PONTOS[idx + 1];
}

function validarSequenciaPonto(tipoNovo: string, ultimoTipo: string | null): boolean {
  return proximoPontoPermitido(ultimoTipo) === tipoNovo;
}

function validarCoordenadasGps(lat?: number | null, lng?: number | null): boolean {
  if (lat === null || lat === undefined || lng === null || lng === undefined) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function validarEvidenciaSelfie(fotoBase64?: string | null): {
  valida: boolean;
  motivo?: string;
} {
  if (!fotoBase64) {
    return {
      valida: false,
      motivo: "Selfie é obrigatória como evidência visual para conferência humana.",
    };
  }
  if (!fotoBase64.startsWith("data:image/")) {
    return { valida: false, motivo: "Formato de imagem inválido." };
  }
  return { valida: true };
}

describe("Rotas de Ponto: /ponto.$token", () => {
  it("valida o formato do token de ponto", () => {
    expect(() => tokenSchema.parse({ token: "token-valido-123" })).not.toThrow();
    expect(() => tokenSchema.parse({ token: "curto" })).toThrow();
    expect(() => tokenSchema.parse({ token: "a".repeat(129) })).toThrow();
  });

  it("garante a ordem estrita das batidas de ponto em campo", () => {
    // 1. Primeira batida só pode ser entrada
    expect(validarSequenciaPonto("entrada", null)).toBe(true);
    expect(validarSequenciaPonto("saida", null)).toBe(false);
    expect(validarSequenciaPonto("inicio_intervalo", null)).toBe(false);

    // 2. Após entrada, o próximo é início do intervalo
    expect(validarSequenciaPonto("inicio_intervalo", "entrada")).toBe(true);
    expect(validarSequenciaPonto("saida", "entrada")).toBe(false);

    // 3. Após início do intervalo, o próximo é fim do intervalo
    expect(validarSequenciaPonto("fim_intervalo", "inicio_intervalo")).toBe(true);
    expect(validarSequenciaPonto("entrada", "inicio_intervalo")).toBe(false);

    // 4. Após fim do intervalo, o próximo é saída
    expect(validarSequenciaPonto("saida", "fim_intervalo")).toBe(true);
    expect(validarSequenciaPonto("inicio_intervalo", "fim_intervalo")).toBe(false);

    // 5. Após saída, sequência concluída
    expect(proximoPontoPermitido("saida")).toBe("concluido");
  });

  it("valida coordenadas geográficas do GPS em campo", () => {
    // Coordenadas válidas (ex: São Paulo)
    expect(validarCoordenadasGps(-23.55052, -46.633308)).toBe(true);
    // Coordenadas inválidas
    expect(validarCoordenadasGps(95, -46)).toBe(false);
    expect(validarCoordenadasGps(-23, 200)).toBe(false);
    expect(validarCoordenadasGps(null, null)).toBe(false);
  });

  it("enforça selfie como evidência para conferência humana e não prova biométrica", () => {
    const semFoto = validarEvidenciaSelfie(null);
    expect(semFoto.valida).toBe(false);
    expect(semFoto.motivo).toContain("conferência humana");

    const comFotoValida = validarEvidenciaSelfie("data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ...");
    expect(comFotoValida.valida).toBe(true);
  });

  it("normaliza CPF para identificação no ponto público", () => {
    expect(soDigitos("123.456.789-00")).toBe("12345678900");
    expect(soDigitos(" 123 456 789 00 ")).toBe("12345678900");
  });
});
