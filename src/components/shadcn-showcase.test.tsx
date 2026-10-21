import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ShadcnShowcase } from "./shadcn-showcase";
import { Button, buttonVariants } from "./ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";

describe("shadcn/ui componentes e configuração", () => {
  it("renderiza Button do shadcn/ui e aplica variantes via cva", () => {
    const html = renderToStaticMarkup(
      React.createElement(Button, { variant: "default", size: "sm" }, "Entrar Já"),
    );
    expect(html).toContain("Entrar Já");
    expect(html).toContain("bg-primary");
    expect(buttonVariants({ variant: "destructive" })).toContain("bg-destructive");
  });

  it("renderiza Card do shadcn/ui com estrutura padrão", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        Card,
        null,
        React.createElement(
          CardHeader,
          null,
          React.createElement(CardTitle, null, "Já — Gestão de Equipes e Pagamentos"),
        ),
        React.createElement(CardContent, null, "Conteúdo de teste"),
      ),
    );
    expect(html).toContain("Já — Gestão de Equipes e Pagamentos");
    expect(html).toContain("Conteúdo de teste");
    expect(html).toContain("rounded-xl");
  });

  it("renderiza o componente de prova ShadcnShowcase com a nova marca", () => {
    const html = renderToStaticMarkup(React.createElement(ShadcnShowcase));
    expect(html).toContain("Já — Gestão de Equipes e Pagamentos");
    expect(html).toContain("shadcn/ui configurado");
  });
});
