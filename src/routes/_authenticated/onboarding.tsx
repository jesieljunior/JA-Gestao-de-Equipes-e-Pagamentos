import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { soDigitos } from "@/lib/dominio";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Criar agência — PayCrew" },
      {
        name: "description",
        content:
          "Cadastre sua agência de eventos no PayCrew para começar a escalar equipes, registrar ponto e pagar freelancers.",
      },
      { property: "og:title", content: "Criar agência — PayCrew" },
      {
        property: "og:description",
        content: "Primeiro passo no PayCrew: cadastrar a agência de eventos.",
      },
    ],
  }),
  component: Onboarding,
});

function Onboarding() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [nome, setNome] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    const { error } = await supabase.rpc("criar_empresa", {
      _nome: nome.trim(),
      _cnpj: soDigitos(cnpj),
    });
    setSalvando(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await queryClient.invalidateQueries();
    toast.success("Agência criada. Bem-vindo ao PayCrew!");
    navigate({ to: "/painel", replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
      <form
        onSubmit={criar}
        className="w-full max-w-sm rounded-md border border-border bg-card p-5"
      >
        <h1 className="text-base font-semibold tracking-tight">Criar sua agência</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Você será o administrador e poderá convidar a equipe depois.
        </p>

        <div className="mt-5 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="nome">Nome da agência</Label>
            <Input
              id="nome"
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cnpj">CNPJ</Label>
            <Input
              id="cnpj"
              required
              inputMode="numeric"
              placeholder="00000000000000"
              value={cnpj}
              onChange={(e) => setCnpj(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={salvando}>
            Criar agência
          </Button>
        </div>
      </form>
    </div>
  );
}
