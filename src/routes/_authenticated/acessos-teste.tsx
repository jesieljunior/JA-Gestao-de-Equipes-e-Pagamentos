import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Copy, FlaskConical } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { EmptyState, LoadingBloco } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSessao } from "@/hooks/use-sessao";
import { supabase } from "@/integrations/supabase/client";
import { criarAcessosTeste } from "@/lib/acessos.functions";

export const Route = createFileRoute("/_authenticated/acessos-teste")({
  head: () => ({
    meta: [
      { title: "Acessos de teste | PayCrew" },
      {
        name: "description",
        content: "Crie acessos temporários para validar os três portais da PayCrew.",
      },
      { property: "og:title", content: "Acessos de teste | PayCrew" },
      {
        property: "og:description",
        content: "Validação dos portais da agência, suporte e administração.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AcessosTeste,
});

type Acesso = { nome: string; email: string; senha: string };
function AcessosTeste() {
  const { ehAdminMaster, isPending } = useSessao();
  const criarFn = useServerFn(criarAcessosTeste);
  const [empresaId, setEmpresaId] = useState("");
  const [acessos, setAcessos] = useState<Acesso[]>([]);
  const empresas = useQuery({
    queryKey: ["empresas-acessos-teste"],
    enabled: ehAdminMaster,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("empresas")
        .select("id, nome")
        .eq("ativa", true)
        .order("nome");
      if (error) throw error;
      return data;
    },
  });
  const criar = useMutation({
    mutationFn: () => criarFn({ data: { empresaId } }),
    onSuccess: (data) => {
      setAcessos(data);
      toast.success("Três acessos de teste criados.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isPending)
    return (
      <AppShell titulo="Acessos de teste">
        <LoadingBloco />
      </AppShell>
    );
  if (!ehAdminMaster)
    return (
      <AppShell titulo="Acessos de teste">
        <EmptyState
          titulo="Área restrita"
          descricao="Somente a administração master cria estes acessos."
        />
      </AppShell>
    );
  return (
    <AppShell titulo="Acessos de teste" descricao="Valide separadamente os três portais">
      <div className="max-w-3xl space-y-6">
        <section className="space-y-4 rounded-md border border-border bg-card p-4">
          <div>
            <h2 className="font-semibold">Novo conjunto de teste</h2>
            <p className="text-sm text-muted-foreground">
              Cria uma agência administradora, um suporte e um administrador master. As senhas são
              exibidas apenas agora.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Agência usada no teste</Label>
            <Select value={empresaId} onValueChange={setEmpresaId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {(empresas.data ?? []).map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button disabled={!empresaId || criar.isPending} onClick={() => criar.mutate()}>
            <FlaskConical className="size-4" /> Criar os 3 acessos
          </Button>
        </section>
        {acessos.length ? (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Credenciais temporárias</h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(
                    acessos.map((a) => `${a.nome}\n${a.email}\n${a.senha}`).join("\n\n"),
                  );
                  toast.success("Credenciais copiadas.");
                }}
              >
                <Copy className="size-4" /> Copiar todas
              </Button>
            </div>
            {acessos.map((a) => (
              <div
                key={a.email}
                className="grid gap-1 rounded-md border border-border bg-card p-4 text-sm sm:grid-cols-[10rem_1fr]"
              >
                <strong>{a.nome}</strong>
                <div>
                  <p className="break-all">{a.email}</p>
                  <p className="font-mono break-all">{a.senha}</p>
                </div>
              </div>
            ))}
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
