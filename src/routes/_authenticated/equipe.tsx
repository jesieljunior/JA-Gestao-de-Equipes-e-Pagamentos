import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Copy, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { EmptyState, ErrorState, LoadingBloco } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { criarAcessoEquipe } from "@/lib/acessos.functions";
import { ROTULO_PAPEL, type PapelUsuario } from "@/lib/dominio";

export const Route = createFileRoute("/_authenticated/equipe")({
  head: () => ({
    meta: [
      { title: "Equipe e acessos | PayCrew" },
      {
        name: "description",
        content: "Gerencie os acessos e responsabilidades da equipe da agência.",
      },
      { property: "og:title", content: "Equipe e acessos | PayCrew" },
      { property: "og:description", content: "Acessos e responsabilidades da equipe da agência." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Equipe,
});

type Credencial = { nome: string; email: string; senha: string };

function Equipe() {
  const { empresaId, pode } = useSessao();
  const queryClient = useQueryClient();
  const criarFn = useServerFn(criarAcessoEquipe);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [papel, setPapel] = useState<PapelUsuario>("supervisor");
  const [credencial, setCredencial] = useState<Credencial | null>(null);

  const q = useQuery({
    queryKey: ["equipe-acessos", empresaId],
    enabled: Boolean(empresaId),
    queryFn: async () => {
      const { data: usuarios, error } = await supabase
        .from("usuarios")
        .select("id, nome, email, ativo")
        .eq("empresa_id", empresaId ?? "")
        .order("nome");
      if (error) throw error;
      const ids = usuarios.map((u) => u.id);
      const { data: papeis, error: erroPapeis } = ids.length
        ? await supabase.from("user_roles").select("user_id, role").in("user_id", ids)
        : { data: [], error: null };
      if (erroPapeis) throw erroPapeis;
      return usuarios.map((u) => ({
        ...u,
        papeis: (papeis ?? []).filter((p) => p.user_id === u.id).map((p) => p.role),
      }));
    },
  });

  const criar = useMutation({
    mutationFn: () => criarFn({ data: { nome, email, papel } }),
    onSuccess: (data) => {
      setCredencial(data);
      setNome("");
      setEmail("");
      queryClient.invalidateQueries({ queryKey: ["equipe-acessos"] });
      toast.success("Acesso criado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!pode("configuracoes.gerenciar"))
    return (
      <AppShell titulo="Equipe e acessos">
        <EmptyState
          titulo="Área restrita"
          descricao="Somente administradores da agência gerenciam acessos."
        />
      </AppShell>
    );

  return (
    <AppShell titulo="Equipe e acessos" descricao="Contas da equipe da sua agência">
      <div className="grid gap-6 xl:grid-cols-[22rem_1fr]">
        <section className="space-y-4 rounded-md border border-border bg-card p-4">
          <div>
            <h2 className="font-semibold">Novo acesso</h2>
            <p className="text-sm text-muted-foreground">
              A senha aparece uma única vez para ser compartilhada com segurança.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="equipe-nome">Nome</Label>
            <Input id="equipe-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="equipe-email">E-mail</Label>
            <Input
              id="equipe-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Responsabilidade</Label>
            <Select value={papel} onValueChange={(v) => setPapel(v as PapelUsuario)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ROTULO_PAPEL).map(([v, r]) => (
                  <SelectItem key={v} value={v}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            className="w-full"
            disabled={criar.isPending || !nome.trim() || !email.trim()}
            onClick={() => criar.mutate()}
          >
            <UserPlus className="size-4" /> Criar acesso
          </Button>
          {credencial ? (
            <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3 text-sm">
              <p className="font-medium">Credenciais temporárias</p>
              <p className="break-all">{credencial.email}</p>
              <p className="font-mono break-all">{credencial.senha}</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(`${credencial.email}\n${credencial.senha}`);
                  toast.success("Credenciais copiadas.");
                }}
              >
                <Copy className="size-4" /> Copiar
              </Button>
            </div>
          ) : null}
        </section>
        <section>
          <h2 className="mb-3 font-semibold">Pessoas com acesso</h2>
          {q.isPending ? (
            <LoadingBloco />
          ) : q.isError ? (
            <ErrorState error={q.error} onRetry={() => q.refetch()} />
          ) : q.data.length === 0 ? (
            <EmptyState titulo="Nenhum acesso" descricao="Crie o primeiro acesso da equipe." />
          ) : (
            <ul className="space-y-2">
              {q.data.map((u) => (
                <li
                  key={u.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium">{u.nome}</p>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {u.papeis.map((p) => (
                      <Badge key={p} variant="secondary">
                        {ROTULO_PAPEL[p]}
                      </Badge>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
