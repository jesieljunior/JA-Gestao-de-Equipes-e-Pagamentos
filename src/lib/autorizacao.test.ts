import { describe, it, expect } from "vitest";
import { resolverContextoLegacy, podeCom } from "./dominio";
import {
  requireOrganizationContext,
  requirePlatformContext,
  requireResourceAccess,
} from "./autorizacao.server";
describe("role and tenant boundaries", () => {
  const org = resolverContextoLegacy({ usuarioId: "a", empresaId: "A", papeis: ["admin"] });
  const support = resolverContextoLegacy({
    usuarioId: "s",
    empresaId: "B",
    papeis: ["admin"],
    papeisPlataforma: ["suporte"],
  });
  const master = resolverContextoLegacy({
    usuarioId: "m",
    empresaId: "A",
    papeis: ["admin"],
    papeisPlataforma: ["admin_master"],
  });
  it("support does not inherit organization privileges from a legacy company link", () => {
    expect(support.organizationContext).toBeNull();
    expect(support.papeis).toEqual([]);
    expect(() => requireOrganizationContext({ contexto: support })).toThrow();
  });
  it("master has platform context without company membership", () => {
    expect(requirePlatformContext({ contexto: master }).hasPlatformContext).toBe(true);
    expect(master.organizationContext).toBeNull();
  });
  it("organization admin cannot access another company by ID", () => {
    expect(requireResourceAccess({ contexto: org }, "A").empresaId).toBe("A");
    expect(() => requireResourceAccess({ contexto: org }, "B")).toThrow();
  });
  it("support cannot use the master resource bypass", () => {
    expect(() =>
      requireResourceAccess({ contexto: support }, "B", { allowPlatform: true }),
    ).toThrow();
  });
  it("only master can use the explicit global read bypass", () => {
    expect(requireResourceAccess({ contexto: master }, "B", { allowPlatform: true })).toBe(master);
  });
  it("coordinator retains operation but not finance", () => {
    expect(podeCom(["coordenador"], "eventos.gerenciar")).toBe(true);
    expect(podeCom(["coordenador"], "financeiro.gerenciar")).toBe(false);
  });
  it("financeiro has finance but not event administration", () => {
    expect(podeCom(["financeiro"], "financeiro.gerenciar")).toBe(true);
    expect(podeCom(["financeiro"], "eventos.gerenciar")).toBe(false);
  });
  it("supervisor has supervision but not finance", () => {
    expect(podeCom(["supervisor"], "operacao.supervisionar")).toBe(true);
    expect(podeCom(["supervisor"], "financeiro.gerenciar")).toBe(false);
  });
  it("relatorios permission is restricted to admin and financeiro", () => {
    expect(podeCom(["admin"], "relatorios.ver")).toBe(true);
    expect(podeCom(["financeiro"], "relatorios.ver")).toBe(true);
    expect(podeCom(["coordenador"], "relatorios.ver")).toBe(false);
    expect(podeCom(["supervisor"], "relatorios.ver")).toBe(false);
  });
  it("new authenticated identity can onboard but cannot perform organization actions", () => {
    const c = resolverContextoLegacy({ usuarioId: "new", empresaId: null });
    expect(c.hasAnyContext).toBe(false);
    expect(() => requireOrganizationContext({ contexto: c })).toThrow();
  });
});
