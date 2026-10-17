import { describe, expect, it } from "vitest";

import { extrairTokenOuLink, resolverDestinoAcesso } from "./auth-navigation";
import { resolverContextoLegacy } from "./dominio";

describe("auth-navigation: resolverDestinoAcesso", () => {
  it("redireciona usuário desativado para /auth", () => {
    const contexto = resolverContextoLegacy({
      usuarioId: "u1",
      empresaId: "emp-1",
      papeis: ["admin"],
    });
    const destino = resolverDestinoAcesso({ ativo: false, contexto }, "/painel");
    expect(destino).toBe("/auth");
  });

  it("redireciona usuário sem empresa para /onboarding se tentar acessar rotas privadas", () => {
    const contexto = resolverContextoLegacy({
      usuarioId: "u2",
      empresaId: null,
    });
    const destino = resolverDestinoAcesso({ ativo: true, contexto }, "/painel");
    expect(destino).toBe("/onboarding");
  });

  it("permite usuário sem empresa permanecer no /onboarding", () => {
    const contexto = resolverContextoLegacy({
      usuarioId: "u3",
      empresaId: null,
    });
    const destino = resolverDestinoAcesso({ ativo: true, contexto }, "/onboarding");
    expect(destino).toBe("/onboarding");
  });

  it("redireciona usuário já vinculado para /painel se tentar acessar /onboarding", () => {
    const contexto = resolverContextoLegacy({
      usuarioId: "u4",
      empresaId: "emp-1",
      papeis: ["admin"],
    });
    const destino = resolverDestinoAcesso({ ativo: true, contexto }, "/onboarding");
    expect(destino).toBe("/painel");
  });

  it("permite usuário de agência acessar suas rotas operacionais", () => {
    const contexto = resolverContextoLegacy({
      usuarioId: "u5",
      empresaId: "emp-1",
      papeis: ["coordenador"],
    });
    expect(resolverDestinoAcesso({ ativo: true, contexto }, "/eventos")).toBe("/eventos");
    expect(resolverDestinoAcesso({ ativo: true, contexto }, "/fechamento")).toBe("/fechamento");
    expect(resolverDestinoAcesso({ ativo: true, contexto }, "/financeiro")).toBe("/financeiro");
  });

  it("impede usuário de agência de acessar portais da plataforma (admin, suporte, acessos-teste)", () => {
    const contexto = resolverContextoLegacy({
      usuarioId: "u6",
      empresaId: "emp-1",
      papeis: ["admin"],
    });
    expect(resolverDestinoAcesso({ ativo: true, contexto }, "/admin")).toBe("/painel");
    expect(resolverDestinoAcesso({ ativo: true, contexto }, "/suporte")).toBe("/painel");
    expect(resolverDestinoAcesso({ ativo: true, contexto }, "/acessos-teste")).toBe("/painel");
  });

  it("direciona admin_master para suas rotas autorizadas", () => {
    const contexto = resolverContextoLegacy({
      usuarioId: "master-1",
      empresaId: null,
      papeisPlataforma: ["admin_master"],
    });
    expect(resolverDestinoAcesso({ ativo: true, contexto }, "/admin")).toBe("/admin");
    expect(resolverDestinoAcesso({ ativo: true, contexto }, "/acessos-teste")).toBe(
      "/acessos-teste",
    );
    expect(resolverDestinoAcesso({ ativo: true, contexto }, "/suporte")).toBe("/suporte");
    // Se estiver em rota genérica, vai para /admin
    expect(resolverDestinoAcesso({ ativo: true, contexto }, "/painel")).toBe("/admin");
  });

  it("direciona suporte apenas para /suporte", () => {
    const contexto = resolverContextoLegacy({
      usuarioId: "sup-1",
      empresaId: null,
      papeisPlataforma: ["suporte"],
    });
    expect(resolverDestinoAcesso({ ativo: true, contexto }, "/suporte")).toBe("/suporte");
    expect(resolverDestinoAcesso({ ativo: true, contexto }, "/admin")).toBe("/suporte");
    expect(resolverDestinoAcesso({ ativo: true, contexto }, "/painel")).toBe("/suporte");
  });
});

describe("auth-navigation: extrairTokenOuLink", () => {
  it("extrai código numérico puro de 6 dígitos", () => {
    const res = extrairTokenOuLink(" 849201 ");
    expect(res.tipo).toBe("codigo_puro");
    expect(res.token).toBe("849201");
    expect(res.tokenType).toBe("email");
  });

  it("extrai tokens de hash de URL completa de redirecionamento", () => {
    const url =
      "https://app.swali.com.br/#access_token=token-xyz-123&refresh_token=refresh-abc-456";
    const res = extrairTokenOuLink(url);
    expect(res.tipo).toBe("tokens_hash");
    expect(res.accessToken).toBe("token-xyz-123");
    expect(res.refreshToken).toBe("refresh-abc-456");
  });

  it("extrai parâmetro token e type de link mágico de verificação", () => {
    const url =
      "https://rutmjtmirwcyoroyjqdy.supabase.co/auth/v1/verify?token=pkce_abc999&type=magiclink&redirect_to=http://localhost:3000/auth";
    const res = extrairTokenOuLink(url);
    expect(res.tipo).toBe("token_param");
    expect(res.token).toBe("pkce_abc999");
    expect(res.tokenType).toBe("magiclink");
  });
});
