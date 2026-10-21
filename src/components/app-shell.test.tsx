import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Mock router
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    className,
    ...props
  }: {
    children?: React.ReactNode;
    to: string;
    className?: string;
  }) => React.createElement("a", { href: to, className, ...props }, children),
  useRouterState: () => "/painel",
  useNavigate: () => vi.fn(),
}));

// Mock queryClient
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    cancelQueries: vi.fn(),
    clear: vi.fn(),
  }),
}));

// Mock useSessao
vi.mock("@/hooks/use-sessao", () => ({
  useSessao: () => ({
    sessao: {
      usuario: { id: "u1", nome: "Carla Gestora", email: "carla@agencia.com", ativo: true },
      empresa: { id: "emp-1", nome: "Vibe Eventos Produtora" },
      papeis: ["admin"],
      papeisPlataforma: [],
      contexto: {
        hasOrganizationContext: true,
        hasPlatformContext: false,
        organizationContext: { empresaId: "emp-1", roles: ["admin"] },
        platformContext: null,
      },
    },
    pode: () => true,
    ehAdminMaster: false,
    ehEquipePlataforma: false,
    contexto: {
      hasOrganizationContext: true,
      hasPlatformContext: false,
      organizationContext: { empresaId: "emp-1", roles: ["admin"] },
      platformContext: null,
    },
  }),
}));

import { AppShell } from "./app-shell";

describe("AppShell — Layout e Identidade Visual da Já", () => {
  it("renderiza a marca Já e os dados da organização", () => {
    const html = renderToStaticMarkup(
      <AppShell titulo="Painel Operacional" descricao="Visão consolidada da operação">
        <div>Conteúdo do Painel</div>
      </AppShell>,
    );

    expect(html).toContain("Já");
    expect(html).toContain("Swali");
    expect(html).toContain("Painel Operacional");
    expect(html).toContain("Visão consolidada da operação");
    expect(html).toContain("Vibe Eventos Produtora");
    expect(html).toContain("Carla Gestora");
    expect(html).not.toContain("PayCrew");
  });

  it("renderiza grupos de navegação por módulos", () => {
    const html = renderToStaticMarkup(
      <AppShell titulo="Eventos">
        <div>Lista de Eventos</div>
      </AppShell>,
    );

    expect(html).toContain("Operação");
    expect(html).toContain("Pessoas &amp; Cadastros");
    expect(html).toContain("Financeiro &amp; Fiscal");
    expect(html).toContain("/eventos");
    expect(html).toContain("/operacao");
    expect(html).toContain("/fechamento");
    expect(html).toContain("/financeiro");
  });
});
